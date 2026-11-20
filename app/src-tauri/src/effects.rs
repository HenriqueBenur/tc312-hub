//! Efeitos de iluminação feitos pelo app (paletas de 2 e 3 cores e variações que o firmware não tem).
//!
//! O firmware do TC312 só guarda um modo, uma cor e a opção "multicolor" (ver protocolo §4).
//! Paletas animadas são desenhadas aqui e enviadas quadro a quadro pelo modo direto (0x12),
//! como o MK1 Elite faz (~17 quadros/s). Por isso só funcionam com o app aberto ou na bandeja.
//!
//! Regras de segurança (skill `tc312-protocolo`):
//! - cada quadro passa por `protocol::sanitize_colors` (nada depois da entrada 127);
//! - no máximo ~20 quadros/s;
//! - se o teclado mandar eventos estranhos (sinal do defeito de firmware), o motor para sozinho;
//! - com o MK1 Elite aberto o motor pausa (os dois disputariam o teclado).
//!
//! A matemática é espelhada em `src/effects.ts` (a prévia da interface usa a mesma fórmula).

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::device::Warrior;
use crate::protocol::{self, LED_SLOTS};

const FRAME: Duration = Duration::from_millis(55);
/// Período de um ciclo do efeito, por velocidade (0 = mais rápida, como no firmware).
const PERIODS: [f32; 6] = [2.0, 3.0, 4.5, 6.0, 8.5, 12.0];
const LAYOUT_W: f32 = 18.25;
const LAYOUT_H: f32 = 6.25;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EffectKind {
    Wave,
    Breathing,
    Cycle,
    Starlight,
    Ripple,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftEffect {
    pub kind: EffectKind,
    /// true = espectro (arco-íris); senão usa `colors` (1 a 3 cores).
    pub rainbow: bool,
    pub colors: Vec<[u8; 3]>,
    /// 0 (mais rápida) … 5
    pub speed: u8,
    /// Onda: 0 → direita, 1 → esquerda, 2 → baixo, 3 → cima.
    pub direction: u8,
    /// 0 … 4, igual ao firmware.
    pub brightness: u8,
}

impl SoftEffect {
    pub fn validate(&self) -> Result<(), String> {
        if !self.rainbow && !(1..=3).contains(&self.colors.len()) {
            return Err("A paleta precisa de 1 a 3 cores.".into());
        }
        if self.speed > 5 || self.direction > 3 || self.brightness > 4 {
            return Err("Velocidade (0–5), direção (0–3) ou brilho (0–4) fora da faixa.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EffectStatus {
    /// "parado" | "rodando" | "aguardando" | "pausado" | "seguranca"
    pub state: String,
    pub effect: Option<SoftEffect>,
    pub fps: f32,
    pub message: Option<String>,
}

#[derive(Deserialize)]
struct LayoutKey {
    m: usize,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

/// Centro de cada LED em unidades de tecla (índice da matriz, x, y), na ordem do layout.json.
pub fn layout_centers() -> &'static [(usize, f32, f32)] {
    positions()
}

/// Centro de cada LED em unidades de tecla, pela mesma tabela da interface.
fn positions() -> &'static [(usize, f32, f32)] {
    static P: OnceLock<Vec<(usize, f32, f32)>> = OnceLock::new();
    P.get_or_init(|| {
        let keys: Vec<LayoutKey> = serde_json::from_str(include_str!("../../src/layout.json")).expect("layout.json");
        keys.into_iter()
            .filter(|k| k.m < LED_SLOTS)
            .map(|k| (k.m, k.x + k.w / 2.0, k.y + k.h / 2.0))
            .collect()
    })
}

fn frac(x: f32) -> f32 {
    x - x.floor()
}

fn smooth(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

fn lerp(a: [u8; 3], b: [u8; 3], t: f32) -> [f32; 3] {
    let m = |x: u8, y: u8| x as f32 + (y as f32 - x as f32) * t;
    [m(a[0], b[0]), m(a[1], b[1]), m(a[2], b[2])]
}

fn hsv(h: f32, s: f32, v: f32) -> [f32; 3] {
    let h = frac(h / 360.0) * 6.0;
    let i = h.floor() as i32;
    let f = h - i as f32;
    let (p, q, t) = (v * (1.0 - s), v * (1.0 - s * f), v * (1.0 - s * (1.0 - f)));
    let (r, g, b) = match i {
        0 => (v, t, p),
        1 => (q, v, p),
        2 => (p, v, t),
        3 => (p, q, v),
        4 => (t, p, v),
        _ => (v, p, q),
    };
    [r * 255.0, g * 255.0, b * 255.0]
}

fn rgb_to_hsv(c: [u8; 3]) -> (f32, f32, f32) {
    let [r, g, b] = c.map(|x| x as f32 / 255.0);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let d = max - min;
    let h = if d == 0.0 {
        0.0
    } else if max == r {
        60.0 * ((g - b) / d).rem_euclid(6.0)
    } else if max == g {
        60.0 * ((b - r) / d + 2.0)
    } else {
        60.0 * ((r - g) / d + 4.0)
    };
    (h, if max == 0.0 { 0.0 } else { d / max }, max)
}

/// Cor da paleta numa posição cíclica `u` ∈ [0, 1).
fn sample(e: &SoftEffect, u: f32) -> [f32; 3] {
    if e.rainbow {
        return hsv(frac(u) * 360.0, 1.0, 1.0);
    }
    let n = e.colors.len();
    if n == 1 {
        let c = e.colors[0];
        return [c[0] as f32, c[1] as f32, c[2] as f32];
    }
    let seg = frac(u) * n as f32;
    let i = (seg.floor() as usize).min(n - 1);
    lerp(e.colors[i], e.colors[(i + 1) % n], smooth(seg - i as f32))
}

/// Número pseudoaleatório estável em [0, 1) (mesmo cálculo em effects.ts).
fn hash(i: u32, k: u32) -> f32 {
    let mut h = i.wrapping_mul(73_856_093) ^ k.wrapping_mul(19_349_663);
    h ^= h >> 13;
    h = h.wrapping_mul(0x5bd1_e995);
    h ^= h >> 15;
    (h % 10_000) as f32 / 10_000.0
}

fn scale(c: [f32; 3], k: f32) -> [f32; 3] {
    [c[0] * k, c[1] * k, c[2] * k]
}

/// Cor de um LED (centro `cx`,`cy` em unidades de tecla) no instante `t` (segundos).
pub fn color_at(e: &SoftEffect, index: usize, cx: f32, cy: f32, t: f32) -> [u8; 3] {
    let period = PERIODS[e.speed.min(5) as usize];
    let nx = cx / LAYOUT_W;
    let ny = cy / LAYOUT_H;
    let single = !e.rainbow && e.colors.len() == 1;
    let c = match e.kind {
        EffectKind::Wave => {
            let pos = match e.direction {
                1 => 1.0 - nx,
                2 => ny,
                3 => 1.0 - ny,
                _ => nx,
            };
            let u = pos - t / period;
            if single {
                // uma cor: faixa de luz que corre sobre a cor de fundo mais fraca
                let band = 0.5 + 0.5 * (std::f32::consts::TAU * u).cos();
                scale(sample(e, 0.0), 0.18 + 0.82 * band * band)
            } else {
                sample(e, -u)
            }
        }
        EffectKind::Breathing => {
            let cycles = t / period;
            let b = 0.5 - 0.5 * (std::f32::consts::TAU * cycles).cos();
            let k = cycles.floor();
            let base = if e.rainbow {
                hsv(frac(k * 0.13) * 360.0, 1.0, 1.0)
            } else {
                let c = e.colors[(k as usize) % e.colors.len()];
                [c[0] as f32, c[1] as f32, c[2] as f32]
            };
            scale(base, b * b)
        }
        EffectKind::Cycle => {
            let u = t / (period * 2.0);
            if single {
                // uma cor: passeia pelos tons vizinhos (±28° no círculo de cores)
                let (h, s, v) = rgb_to_hsv(e.colors[0]);
                hsv(h + 28.0 * (std::f32::consts::TAU * u).sin(), s, v)
            } else {
                sample(e, u)
            }
        }
        EffectKind::Starlight => {
            let rate = 0.6 + hash(index as u32, 7) * 0.9;
            let phase = hash(index as u32, 3);
            let cyc = t / period * rate + phase;
            let tw = (std::f32::consts::PI * frac(cyc)).sin().max(0.0).powi(3);
            let k = cyc.floor() as u32;
            let base = if e.rainbow {
                hsv(hash(index as u32, k + 11) * 360.0, 1.0, 1.0)
            } else {
                let n = e.colors.len() as u32;
                let c = e.colors[((hash(index as u32, k + 11) * 1000.0) as u32 % n) as usize];
                [c[0] as f32, c[1] as f32, c[2] as f32]
            };
            scale(base, tw)
        }
        EffectKind::Ripple => {
            let dx = cx - LAYOUT_W / 2.0;
            let dy = (cy - LAYOUT_H / 2.0) * 1.4;
            let d = (dx * dx + dy * dy).sqrt() / 9.5;
            let u = d - t / period;
            if single {
                let band = 0.5 + 0.5 * (std::f32::consts::TAU * u).cos();
                scale(sample(e, 0.0), 0.15 + 0.85 * band * band)
            } else {
                sample(e, -u)
            }
        }
    };
    let k = e.brightness.min(4) as f32 / 4.0;
    [c[0], c[1], c[2]].map(|x| (x * k).round().clamp(0.0, 255.0) as u8)
}

/// Quadro completo (510 bytes, entradas 0..127; o resto fica zerado).
pub fn frame(e: &SoftEffect, t: f32) -> Vec<u8> {
    let mut v = vec![0u8; protocol::COLORS_LEN];
    for &(m, cx, cy) in positions() {
        v[m * 3..m * 3 + 3].copy_from_slice(&color_at(e, m, cx, cy, t));
    }
    protocol::sanitize_colors(&v)
}

struct Shared {
    want: Mutex<Option<SoftEffect>>,
    wake: Condvar,
    status: Mutex<EffectStatus>,
    /// contador de eventos estranhos do keytest (cão de guarda) e o valor quando o efeito começou
    anomaly_count: fn() -> u32,
    baseline: AtomicU32,
    /// parar sem regravar a configuração (quem parou vai gravar outra logo em seguida)
    skip_restore: AtomicBool,
    quit: AtomicBool,
}

pub struct EffectEngine {
    shared: Arc<Shared>,
}

/// O que o motor chama para falar com o resto do app.
pub struct Hooks {
    pub hid: Arc<Mutex<()>>,
    pub anomaly_count: fn() -> u32,
    pub official_app_running: fn() -> bool,
    pub log: Box<dyn Fn(&str) + Send>,
    /// regrava a configuração salva (o efeito do firmware) quando o motor para
    pub restore: Box<dyn Fn(&Warrior) + Send>,
}

impl EffectEngine {
    pub fn start(hooks: Hooks) -> Self {
        let shared = Arc::new(Shared {
            want: Mutex::new(None),
            wake: Condvar::new(),
            status: Mutex::new(EffectStatus { state: "parado".into(), ..Default::default() }),
            anomaly_count: hooks.anomaly_count,
            baseline: AtomicU32::new(0),
            skip_restore: AtomicBool::new(false),
            quit: AtomicBool::new(false),
        });
        let s = shared.clone();
        thread::spawn(move || run(s, hooks));
        Self { shared }
    }

    pub fn set(&self, effect: Option<SoftEffect>) {
        self.shared.baseline.store((self.shared.anomaly_count)(), Ordering::SeqCst);
        if effect.is_some() {
            self.shared.skip_restore.store(false, Ordering::SeqCst);
            let mut st = self.shared.status.lock().unwrap();
            if st.state == "seguranca" {
                st.state = "parado".into();
                st.message = None;
            }
        }
        *self.shared.want.lock().unwrap() = effect;
        self.shared.wake.notify_all();
    }

    /// Para antes de uma gravação que já vai definir o efeito do teclado (sem regravar o antigo).
    pub fn stop_for_write(&self) {
        self.shared.skip_restore.store(true, Ordering::SeqCst);
        self.stop_and_wait();
    }

    pub fn current(&self) -> Option<SoftEffect> {
        self.shared.want.lock().unwrap().clone()
    }

    pub fn status(&self) -> EffectStatus {
        self.shared.status.lock().unwrap().clone()
    }

    pub fn is_active(&self) -> bool {
        self.shared.want.lock().unwrap().is_some()
    }

    /// Para o motor e espera o último quadro sair (antes de gravar no teclado ou ao sair do app).
    pub fn stop_and_wait(&self) {
        self.set(None);
        for _ in 0..40 {
            if self.status().state == "parado" || self.status().state == "seguranca" {
                return;
            }
            thread::sleep(Duration::from_millis(25));
        }
    }

    pub fn shutdown(&self) {
        self.stop_and_wait();
        self.shared.quit.store(true, Ordering::SeqCst);
        self.shared.wake.notify_all();
    }
}

fn set_status(s: &Shared, state: &str, effect: Option<SoftEffect>, fps: f32, message: Option<String>) {
    *s.status.lock().unwrap() = EffectStatus { state: state.into(), effect, fps, message };
}

fn run(s: Arc<Shared>, hooks: Hooks) {
    let mut dev: Option<Warrior> = None;
    let mut streamed = false;
    let mut last_check = Instant::now() - Duration::from_secs(10);
    let mut mk1 = false;
    let t0 = Instant::now();
    let mut frames = 0u32;
    let mut fps_t = Instant::now();
    let mut fps = 0.0f32;
    loop {
        if s.quit.load(Ordering::SeqCst) {
            return;
        }
        let want = s.want.lock().unwrap().clone();
        let Some(effect) = want else {
            // parou: devolve o teclado ao efeito gravado nele
            if streamed {
                if s.skip_restore.swap(false, Ordering::SeqCst) {
                    (hooks.log)("efeito do app parado para uma gravação");
                } else if let Some(w) = dev.as_ref() {
                    let _g = hooks.hid.lock();
                    (hooks.restore)(w);
                    (hooks.log)("efeito do app parado; configuração do teclado regravada");
                }
                streamed = false;
            }
            dev = None;
            let mut st = s.status.lock().unwrap();
            if st.state != "seguranca" {
                *st = EffectStatus { state: "parado".into(), ..Default::default() };
            }
            drop(st);
            let g = s.want.lock().unwrap();
            let _ = s.wake.wait_timeout(g, Duration::from_millis(500));
            continue;
        };

        if (s.anomaly_count)() > s.baseline.load(Ordering::SeqCst) {
            (hooks.log)("efeito do app interrompido: o teclado enviou eventos estranhos (cão de guarda)");
            *s.want.lock().unwrap() = None;
            set_status(
                &s,
                "seguranca",
                None,
                0.0,
                Some("Parei o efeito porque o teclado enviou eventos estranhos. Teste as teclas e, se preciso, use Reparar.".into()),
            );
            continue;
        }

        if last_check.elapsed() > Duration::from_secs(3) {
            mk1 = (hooks.official_app_running)();
            last_check = Instant::now();
        }
        if mk1 {
            dev = None;
            set_status(&s, "pausado", Some(effect), 0.0, Some("MK1 Elite aberto: efeito pausado.".into()));
            thread::sleep(Duration::from_millis(500));
            continue;
        }

        if dev.is_none() {
            match Warrior::open() {
                Ok(w) => dev = Some(w),
                Err(_) => {
                    set_status(&s, "aguardando", Some(effect), 0.0, Some("Aguardando o Warrior.".into()));
                    let g = s.want.lock().unwrap();
                    let _ = s.wake.wait_timeout(g, Duration::from_secs(2));
                    continue;
                }
            }
        }

        let started = Instant::now();
        let data = frame(&effect, t0.elapsed().as_secs_f32());
        let r = {
            let _g = hooks.hid.lock();
            dev.as_ref().map(|w| w.stream_frame(&data)).unwrap_or(Err("sem teclado".into()))
        };
        match r {
            Ok(()) => {
                streamed = true;
                frames += 1;
                if fps_t.elapsed() >= Duration::from_secs(1) {
                    fps = frames as f32 / fps_t.elapsed().as_secs_f32();
                    frames = 0;
                    fps_t = Instant::now();
                }
                set_status(&s, "rodando", Some(effect), fps, None);
            }
            Err(e) => {
                (hooks.log)(&format!("quadro do efeito falhou: {e}"));
                dev = None;
                set_status(&s, "aguardando", Some(effect), 0.0, Some(e));
                thread::sleep(Duration::from_secs(1));
                continue;
            }
        }
        if let Some(rest) = FRAME.checked_sub(started.elapsed()) {
            thread::sleep(rest);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fx(kind: EffectKind, rainbow: bool, colors: Vec<[u8; 3]>) -> SoftEffect {
        SoftEffect { kind, rainbow, colors, speed: 2, direction: 0, brightness: 4 }
    }

    #[test]
    fn frames_never_touch_past_entry_127() {
        for kind in [EffectKind::Wave, EffectKind::Breathing, EffectKind::Cycle, EffectKind::Starlight, EffectKind::Ripple] {
            for e in [fx(kind, true, vec![]), fx(kind, false, vec![[255, 0, 0]]), fx(kind, false, vec![[255, 0, 0], [0, 0, 255], [0, 255, 0]])] {
                for t in [0.0, 0.7, 3.3, 61.0] {
                    let f = frame(&e, t);
                    assert_eq!(f.len(), protocol::COLORS_LEN);
                    assert!(f[LED_SLOTS * 3..].iter().all(|&b| b == 0), "{kind:?} t={t}");
                }
            }
        }
    }

    #[test]
    fn layout_has_all_keys() {
        assert_eq!(positions().len(), 89);
    }

    #[test]
    fn brightness_zero_is_dark() {
        let mut e = fx(EffectKind::Wave, true, vec![]);
        e.brightness = 0;
        assert!(frame(&e, 1.0).iter().all(|&b| b == 0));
    }

    #[test]
    fn palette_validation() {
        assert!(fx(EffectKind::Wave, false, vec![]).validate().is_err());
        assert!(fx(EffectKind::Wave, false, vec![[1, 2, 3]; 4]).validate().is_err());
        assert!(fx(EffectKind::Wave, false, vec![[1, 2, 3]; 3]).validate().is_ok());
        assert!(fx(EffectKind::Wave, true, vec![]).validate().is_ok());
    }

    #[test]
    fn two_color_wave_stays_on_the_gradient() {
        let e = fx(EffectKind::Wave, false, vec![[255, 0, 0], [0, 0, 255]]);
        for t in [0.0, 0.5, 1.9] {
            for &(m, cx, cy) in positions() {
                let c = color_at(&e, m, cx, cy, t);
                assert_eq!(c[1], 0, "verde não existe num gradiente vermelho→azul");
            }
        }
    }
}
