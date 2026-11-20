//! Macros por software.
//!
//! O firmware não mostrou suporte confiável a macros (a gravação no MK1 Elite deixou o
//! teclado emitindo funções de sistema). Então: a tecla escolhida no Warrior é remapeada
//! no firmware para F13–F24 (que o Logitech não tem), e este módulo registra F13–F24 como
//! atalhos globais (RegisterHotKey). Ao disparar, a sequência é reproduzida com SendInput.
//! Assim a macro só acontece pelo Warrior e nenhum gancho global de teclado é necessário.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Step {
    /// Pressiona as teclas em ordem e solta na ordem inversa (ex.: Ctrl+Shift+S).
    Combo { vks: Vec<u16> },
    /// Digita um texto (Unicode; "\n" vira Enter).
    Text { text: String },
    /// Espera em milissegundos (máx. 10 s por passo).
    Delay { ms: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Macro {
    /// 0..11 → F13..F24
    pub slot: u8,
    pub name: String,
    #[serde(default)]
    pub steps: Vec<Step>,
    #[serde(default = "one")]
    pub repeat: u32,
}

fn one() -> u32 {
    1
}

pub const VK_F13: u32 = 0x7C;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotStatus {
    pub slot: u8,
    pub registered: bool,
}

pub struct MacroEngine {
    macros: Arc<Mutex<Vec<Macro>>>,
    status: Arc<Mutex<Vec<SlotStatus>>>,
    thread_id: Arc<AtomicU32>,
    playing: Arc<AtomicBool>,
}

/// Pedido para interromper a macro em andamento (apertar a tecla da macro de novo).
static CANCEL: AtomicBool = AtomicBool::new(false);

impl MacroEngine {
    pub fn start(initial: Vec<Macro>) -> Self {
        let engine = Self {
            macros: Arc::new(Mutex::new(initial)),
            status: Arc::new(Mutex::new(Vec::new())),
            thread_id: Arc::new(AtomicU32::new(0)),
            playing: Arc::new(AtomicBool::new(false)),
        };
        #[cfg(windows)]
        win::spawn_loop(engine.macros.clone(), engine.status.clone(), engine.thread_id.clone(), engine.playing.clone());
        engine
    }

    pub fn set(&self, macros: Vec<Macro>) {
        *self.macros.lock().unwrap() = macros;
        #[cfg(windows)]
        win::request_reload(self.thread_id.load(Ordering::SeqCst));
    }

    pub fn status(&self) -> Vec<SlotStatus> {
        self.status.lock().unwrap().clone()
    }

    /// Executa a macro de um slot agora (botão "Testar" da interface).
    pub fn play_now(&self, slot: u8) {
        let m = self.macros.lock().unwrap().iter().find(|m| m.slot == slot).cloned();
        if let Some(m) = m {
            play(m, self.playing.clone());
        }
    }
}

fn play(m: Macro, playing: Arc<AtomicBool>) {
    if playing.swap(true, Ordering::SeqCst) {
        // já há uma macro rodando: apertar de novo interrompe (útil com "repetir" alto)
        CANCEL.store(true, Ordering::SeqCst);
        return;
    }
    CANCEL.store(false, Ordering::SeqCst);
    thread::spawn(move || {
        // pequena espera para a tecla de disparo ser solta
        thread::sleep(Duration::from_millis(60));
        'outer: for _ in 0..m.repeat.clamp(1, 100) {
            for s in &m.steps {
                if CANCEL.load(Ordering::SeqCst) {
                    break 'outer;
                }
                match s {
                    Step::Combo { vks } => {
                        #[cfg(windows)]
                        win::combo(vks);
                    }
                    Step::Text { text } => {
                        #[cfg(windows)]
                        win::type_text(text);
                        #[cfg(not(windows))]
                        let _ = text;
                    }
                    Step::Delay { ms } => {
                        // espera em fatias para a interrupção responder rápido
                        let mut left = (*ms).min(10_000) as u64;
                        while left > 0 && !CANCEL.load(Ordering::SeqCst) {
                            let d = left.min(50);
                            thread::sleep(Duration::from_millis(d));
                            left -= d;
                        }
                    }
                }
            }
        }
        CANCEL.store(false, Ordering::SeqCst);
        playing.store(false, Ordering::SeqCst);
    });
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::ffi::c_void;
    use std::ptr::null_mut;

    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }
    #[repr(C)]
    struct Msg {
        hwnd: *mut c_void,
        message: u32,
        wparam: usize,
        lparam: isize,
        time: u32,
        pt: Point,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct KeybdInput {
        vk: u16,
        scan: u16,
        flags: u32,
        time: u32,
        extra: usize,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct MouseInput {
        dx: i32,
        dy: i32,
        data: u32,
        flags: u32,
        time: u32,
        extra: usize,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    union InputUnion {
        ki: KeybdInput,
        mi: MouseInput,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Input {
        kind: u32,
        u: InputUnion,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn RegisterHotKey(hwnd: *mut c_void, id: i32, mods: u32, vk: u32) -> i32;
        fn UnregisterHotKey(hwnd: *mut c_void, id: i32) -> i32;
        fn GetMessageW(msg: *mut Msg, hwnd: *mut c_void, min: u32, max: u32) -> i32;
        fn PeekMessageW(msg: *mut Msg, hwnd: *mut c_void, min: u32, max: u32, remove: u32) -> i32;
        fn PostThreadMessageW(tid: u32, msg: u32, w: usize, l: isize) -> i32;
        fn SendInput(n: u32, inputs: *const Input, size: i32) -> u32;
        fn MapVirtualKeyW(code: u32, map_type: u32) -> u32;
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentThreadId() -> u32;
    }

    const WM_HOTKEY: u32 = 0x0312;
    const WM_USER: u32 = 0x0400;
    const WM_APP_RELOAD: u32 = 0x8001;
    const MOD_NOREPEAT: u32 = 0x4000;
    /// Também dispara com Shift, Ctrl ou Alt segurados (ex.: correndo com Shift num jogo).
    const MOD_VARIANTS: [u32; 4] = [0, 0x0004, 0x0002, 0x0001];
    const INPUT_KEYBOARD: u32 = 1;
    const KEYEVENTF_EXTENDEDKEY: u32 = 0x1;
    const KEYEVENTF_KEYUP: u32 = 0x2;
    const KEYEVENTF_UNICODE: u32 = 0x4;
    const VK_RETURN: u16 = 0x0D;

    pub fn spawn_loop(
        macros: Arc<Mutex<Vec<Macro>>>,
        status: Arc<Mutex<Vec<SlotStatus>>>,
        thread_id: Arc<AtomicU32>,
        playing: Arc<AtomicBool>,
    ) {
        thread::spawn(move || unsafe {
            let mut msg: Msg = std::mem::zeroed();
            // cria a fila de mensagens da thread antes de publicar o id
            PeekMessageW(&mut msg, null_mut(), WM_USER, WM_USER, 0);
            thread_id.store(GetCurrentThreadId(), Ordering::SeqCst);
            register_all(&macros, &status);
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                match msg.message {
                    WM_HOTKEY => {
                        let slot = (msg.wparam % crate::protocol::MACRO_COUNT as usize) as u8;
                        let m = macros.lock().unwrap().iter().find(|m| m.slot == slot).cloned();
                        if let Some(m) = m {
                            play(m, playing.clone());
                        }
                    }
                    WM_APP_RELOAD => register_all(&macros, &status),
                    _ => {}
                }
            }
        });
    }

    unsafe fn register_all(macros: &Arc<Mutex<Vec<Macro>>>, status: &Arc<Mutex<Vec<SlotStatus>>>) {
        let n = crate::protocol::MACRO_COUNT as i32;
        for id in 0..n * MOD_VARIANTS.len() as i32 {
            unsafe { UnregisterHotKey(null_mut(), id) };
        }
        let list = macros.lock().unwrap().clone();
        let mut st = Vec::new();
        for m in list.iter().filter(|m| (m.slot as i32) < n && !m.steps.is_empty()) {
            let mut ok = false;
            for (k, mods) in MOD_VARIANTS.iter().enumerate() {
                let id = m.slot as i32 + n * k as i32;
                let r = unsafe { RegisterHotKey(null_mut(), id, MOD_NOREPEAT | mods, VK_F13 + m.slot as u32) } != 0;
                if k == 0 {
                    ok = r;
                }
            }
            st.push(SlotStatus { slot: m.slot, registered: ok });
        }
        *status.lock().unwrap() = st;
    }

    pub fn request_reload(tid: u32) {
        if tid != 0 {
            unsafe { PostThreadMessageW(tid, WM_APP_RELOAD, 0, 0) };
        }
    }

    fn is_extended(vk: u16) -> bool {
        matches!(vk, 0x21..=0x28 | 0x2D | 0x2E | 0x5B | 0x5C | 0x5D | 0x6F | 0x90 | 0xA3 | 0xA5)
    }

    fn key(vk: u16, up: bool) -> Input {
        let scan = unsafe { MapVirtualKeyW(vk as u32, 0) } as u16;
        let mut flags = if up { KEYEVENTF_KEYUP } else { 0 };
        if is_extended(vk) {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        Input { kind: INPUT_KEYBOARD, u: InputUnion { ki: KeybdInput { vk, scan, flags, time: 0, extra: 0 } } }
    }

    fn unicode(unit: u16, up: bool) -> Input {
        let flags = KEYEVENTF_UNICODE | if up { KEYEVENTF_KEYUP } else { 0 };
        Input { kind: INPUT_KEYBOARD, u: InputUnion { ki: KeybdInput { vk: 0, scan: unit, flags, time: 0, extra: 0 } } }
    }

    fn send(inputs: &[Input]) {
        if !inputs.is_empty() {
            unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<Input>() as i32) };
        }
    }

    pub fn combo(vks: &[u16]) {
        let mut v: Vec<Input> = vks.iter().map(|&k| key(k, false)).collect();
        v.extend(vks.iter().rev().map(|&k| key(k, true)));
        send(&v);
        thread::sleep(Duration::from_millis(15));
    }

    pub fn type_text(text: &str) {
        for ch in text.chars() {
            if ch == '\n' {
                send(&[key(VK_RETURN, false), key(VK_RETURN, true)]);
            } else {
                let mut buf = [0u16; 2];
                let units = ch.encode_utf16(&mut buf);
                let mut v: Vec<Input> = units.iter().map(|&u| unicode(u, false)).collect();
                v.extend(units.iter().map(|&u| unicode(u, true)));
                send(&v);
            }
            thread::sleep(Duration::from_millis(4));
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn input_layout_matches_win32() {
            // INPUT tem 40 bytes no Windows x64
            assert_eq!(std::mem::size_of::<Input>(), if cfg!(target_pointer_width = "64") { 40 } else { 28 });
        }
    }
}
