//! Protocolo EVision do Warrior TC312 (320F:5078).
//!
//! Tudo aqui foi verificado na captura `re/captures/20261116_022340` e no backup
//! `re/backups/backup_20261116_025220` (ver a skill `tc312-protocolo`).
//! Os códigos de comando são um `enum` fechado: um código fora da lista branca
//! simplesmente não pode ser montado.

use serde::Serialize;

pub const VID: u16 = 0x320F;
pub const PID: u16 = 0x5078;
pub const USAGE_PAGE: u16 = 0xFF1C;
/// VID da Logitech (teclado G413 e mouse G502 em uso). Nunca abrir.
pub const FORBIDDEN_VID: u16 = 0x046D;

pub const REPORT_ID: u8 = 0x04;
pub const PACKET_LEN: usize = 64;
pub const CHUNK: usize = 0x38;

pub const INFO_LEN: usize = 0x22;
pub const CONFIG_LEN: usize = 0x1B;
pub const KEYMAP_LEN: usize = 510; // 170 entradas x 3 bytes
pub const LEDMAP_LEN: usize = 170;
pub const KEY_SLOTS: usize = 170;
pub const COLORS_LEN: usize = 510; // 170 x RGB (modo personalizado)

/// Comandos observados no tráfego do software oficial.
/// (Algumas escritas ainda não são usadas na v0.1, mas ficam declaradas como lista branca.)
#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Command {
    Begin = 0x01,
    End = 0x02,
    ReadInfo = 0x03,
    ReadConfig = 0x05,
    WriteConfig = 0x06,
    ReadKeymap = 0x07,
    WriteKeymap = 0x09,
    WriteCustomColors = 0x0B,
    StreamColors = 0x12,
    ReadLedMap = 0x1B,
}

impl Command {
    pub fn code(self) -> u8 {
        self as u8
    }

    /// Comandos que alteram o estado do teclado.
    pub fn is_write(self) -> bool {
        matches!(
            self,
            Command::WriteConfig | Command::WriteKeymap | Command::WriteCustomColors | Command::StreamColors
        )
    }
}

/// Monta um pacote de 64 bytes: [id, ck_lo, ck_hi, cmd, len, off_lo, off_hi, 0, dados...].
/// Checksum = soma de 16 bits dos bytes 3..63.
pub fn build_packet(cmd: Command, len: u8, offset: u16, data: &[u8]) -> [u8; PACKET_LEN] {
    assert!(data.len() <= PACKET_LEN - 8, "dados maiores que o pacote");
    let mut p = [0u8; PACKET_LEN];
    p[0] = REPORT_ID;
    p[3] = cmd.code();
    p[4] = len;
    p[5..7].copy_from_slice(&offset.to_le_bytes());
    p[8..8 + data.len()].copy_from_slice(data);
    let sum = p[3..].iter().fold(0u16, |acc, &b| acc.wrapping_add(b as u16));
    p[1..3].copy_from_slice(&sum.to_le_bytes());
    p
}

/// A resposta válida ecoa os 8 bytes de cabeçalho do pedido.
pub fn response_matches(request: &[u8; PACKET_LEN], response: &[u8]) -> bool {
    response.len() == PACKET_LEN && response[..8] == request[..8]
}

/// Divide uma leitura de `total` bytes em pedidos (len, offset) de até 0x38 bytes.
pub fn chunks(total: usize) -> Vec<(u8, u16)> {
    (0..total)
        .step_by(CHUNK)
        .map(|off| ((total - off).min(CHUNK) as u8, off as u16))
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum KeyAction {
    /// Tecla HID comum (uso da página Keyboard/Keypad).
    Key { usage: u8 },
    /// Modificador: bitmask 01 LCtrl, 02 LShift, 04 LAlt, 08 LWin, 10 RCtrl, 20 RShift, 40 RAlt, 80 RWin.
    Modifier { mask: u8 },
    /// Tecla de mídia (página Consumer).
    Consumer { usage: u16 },
    /// Tecla Fn (`a0 01 00`).
    Fn,
    Empty,
    /// Tipo ainda não identificado (ex.: `a0 11 00`, `d0 a2 nn`).
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeySlot {
    pub index: usize,
    pub raw: String,
    pub action: KeyAction,
}

pub fn decode_key(raw: [u8; 3]) -> KeyAction {
    match raw {
        [0, 0, 0] | [0x20, 0, 0] => KeyAction::Empty,
        [0x20, 0, u] => KeyAction::Key { usage: u },
        [0x20, m, 0] => KeyAction::Modifier { mask: m },
        [0x30, lo, hi] => KeyAction::Consumer { usage: u16::from_le_bytes([lo, hi]) },
        [0xA0, 0x01, 0x00] => KeyAction::Fn,
        _ => KeyAction::Unknown,
    }
}

pub fn decode_keymap(data: &[u8]) -> Vec<KeySlot> {
    data.chunks_exact(3)
        .enumerate()
        .map(|(index, c)| {
            let raw = [c[0], c[1], c[2]];
            KeySlot { index, raw: hex(&raw), action: decode_key(raw) }
        })
        .collect()
}

/// Bloco de configuração de 27 bytes (comandos 0x05/0x06).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub mode: u8,
    pub brightness: u8,
    pub speed: u8,
    pub direction: u8,
    pub multicolor: bool,
    pub rgb: [u8; 3],
    /// Byte 0x15: 1 = tecla Windows bloqueada (verificado com Fn+Win).
    pub win_lock: bool,
    pub raw: String,
}

pub fn decode_config(b: &[u8]) -> Option<Config> {
    if b.len() < CONFIG_LEN {
        return None;
    }
    Some(Config {
        mode: b[0x01],
        brightness: b[0x02],
        speed: b[0x03],
        direction: b[0x04],
        multicolor: b[0x05] == 0x01,
        rgb: [b[0x06], b[0x07], b[0x08]],
        win_lock: b[0x15] == 0x01,
        raw: hex(&b[..CONFIG_LEN]),
    })
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn unhex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("hex com tamanho ímpar".into());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| "hex inválido".to_string()))
        .collect()
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/// Keymap de fábrica lido do próprio teclado (re/backups/backup_20261116_025220).
pub const FACTORY_KEYMAP: &[u8; KEYMAP_LEN] = include_bytes!("../assets/factory_keymap.bin");

/// Posição da tecla Fn na matriz (coluna 10, linha 5). Nunca é remapeada,
/// para não perder a camada Fn (Fn+Win, Fn+F-keys...).
pub const FN_SLOT: usize = 85;

/// Macros M1..M12 usam F13..F24 (usos HID 0x68..0x73).
pub const MACRO_COUNT: u8 = 12;

/// Configuração escolhida na interface.
#[derive(Debug, Clone, Copy, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LightingInput {
    pub mode: u8,
    pub brightness: u8,
    pub speed: u8,
    pub direction: u8,
    pub multicolor: bool,
    pub rgb: [u8; 3],
    pub win_lock: bool,
}

impl Default for LightingInput {
    /// Igual à escrita capturada `000604020001ffffff…ff00…` (estático, branco multicolor, brilho 4).
    fn default() -> Self {
        Self { mode: 0x06, brightness: 4, speed: 2, direction: 0, multicolor: true, rgb: [0xff; 3], win_lock: false }
    }
}

pub const VALID_MODES: &[u8] = &[
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x14,
];

/// Monta o bloco de 27 bytes no mesmo formato que o software oficial grava:
/// [00, modo, brilho, velocidade, direção, multicolor, R, G, B, 00 x10, 00, ff, winlock, 00 x5].
pub fn encode_config(l: &LightingInput) -> Result<[u8; CONFIG_LEN], String> {
    if !VALID_MODES.contains(&l.mode) {
        return Err(format!("Modo 0x{:02X} desconhecido.", l.mode));
    }
    if l.brightness > 4 || l.speed > 5 || l.direction > 3 {
        return Err("Brilho (0–4), velocidade (0–5) ou direção (0–3) fora da faixa.".into());
    }
    let mut b = [0u8; CONFIG_LEN];
    b[0x01] = l.mode;
    b[0x02] = l.brightness;
    b[0x03] = l.speed;
    b[0x04] = l.direction;
    b[0x05] = l.multicolor as u8;
    b[0x06..0x09].copy_from_slice(&l.rgb);
    b[0x14] = 0xff;
    b[0x15] = l.win_lock as u8;
    Ok(b)
}

// ---------------------------------------------------------------------------
// Limites observados no software oficial (v1.0.1 — correção do bug das "teclas malucas")
// ---------------------------------------------------------------------------

/// Tabelas de cor (0x0B/0x12): só as entradas 0..127 são cores (LED = posição na matriz).
/// Em 15 mil quadros o MK1 Elite NUNCA escreveu um byte diferente de zero depois do byte 383.
/// A área 384..509 é outra estrutura do firmware; a v1.0.0 escrevia cor ali e corrompia o teclado.
pub const LED_SLOTS: usize = 128;

/// Zera tudo depois da entrada 127, como o MK1 Elite faz.
pub fn sanitize_colors(rgb: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; COLORS_LEN];
    let n = rgb.len().min(LED_SLOTS * 3);
    out[..n].copy_from_slice(&rgb[..n]);
    out
}

/// Posições da matriz que não existem fisicamente no TKL ABNT2 e onde a tabela de fábrica
/// tem teclas internacionais (usos ≥ 0x85). O MK1 Elite sempre grava `20 00 00` nelas.
pub const NON_PHYSICAL_INTL: [usize; 7] = [29, 37, 53, 61, 69, 119, 127];

/// Deixa o keymap no formato que o MK1 Elite grava: posições internacionais inexistentes como
/// `20 00 00` e tudo depois da entrada 127 zerado.
pub fn sanitize_keymap(k: &[u8]) -> Vec<u8> {
    let mut out = k.to_vec();
    out.resize(KEYMAP_LEN, 0);
    for &i in &NON_PHYSICAL_INTL {
        out[i * 3..i * 3 + 3].copy_from_slice(&[0x20, 0x00, 0x00]);
    }
    for b in out[LED_SLOTS * 3..].iter_mut() {
        *b = 0;
    }
    out
}

/// Uma entrada de keymap que o app aceita gravar.
pub fn entry_is_writable(e: [u8; 3]) -> bool {
    match e {
        [0, 0, 0] | [0x20, 0, 0] => true,                                // desativada
        [0x20, 0, u] => (0x04..=0x84).contains(&u),                      // tecla HID (até 0x84, como o MK1)
        [0x20, m, 0] => m.count_ones() == 1,                             // um modificador
        [0x30, lo, hi] => u16::from_le_bytes([lo, hi]) != 0,             // mídia
        _ => false,
    }
}

/// Valida um keymap novo antes de gravar: tamanho, tecla Fn intacta e só entradas
/// conhecidas onde houve mudança (entradas iguais à atual ou à de fábrica passam).
pub fn validate_keymap(new: &[u8], current: &[u8]) -> Result<(), String> {
    if new.len() != KEYMAP_LEN || current.len() != KEYMAP_LEN {
        return Err(format!("Keymap precisa ter {KEYMAP_LEN} bytes."));
    }
    let slot = |d: &[u8], i: usize| [d[i * 3], d[i * 3 + 1], d[i * 3 + 2]];
    if slot(new, FN_SLOT) != slot(FACTORY_KEYMAP, FN_SLOT) {
        return Err("A tecla Fn não pode ser remapeada.".into());
    }
    for i in 0..KEY_SLOTS {
        let n = slot(new, i);
        if n == slot(current, i) || n == slot(FACTORY_KEYMAP, i) {
            continue;
        }
        if !entry_is_writable(n) {
            return Err(format!("Entrada {i} ({}) não é um código conhecido.", hex(&n)));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(p: &[u8; PACKET_LEN]) -> String {
        hex(&p[..8])
    }

    /// Os pedidos que montamos têm de ser idênticos, byte a byte, aos do software oficial.
    #[test]
    fn packets_match_capture() {
        assert_eq!(header(&build_packet(Command::Begin, 0, 0, &[])), "0401000100000000");
        assert_eq!(header(&build_packet(Command::End, 0, 0, &[])), "0402000200000000");
        assert_eq!(header(&build_packet(Command::ReadInfo, 0x22, 0, &[])), "0425000322000000");
        assert_eq!(header(&build_packet(Command::ReadKeymap, 0x38, 0, &[])), "043f000738000000");
        assert_eq!(header(&build_packet(Command::ReadKeymap, 0x38, 0xE0, &[])), "041f010738e00000");
        assert_eq!(header(&build_packet(Command::ReadKeymap, 0x06, 0x1F8, &[])), "0406010706f80100");
        assert_eq!(header(&build_packet(Command::ReadLedMap, 0x02, 0xA8, &[])), "04c5001b02a80000");
        assert_eq!(header(&build_packet(Command::ReadConfig, 0x01, 0, &[])), "0406000501000000");
        assert_eq!(header(&build_packet(Command::ReadConfig, 0x1B, 0, &[])), "042000051b000000");
    }

    /// Escrita de config capturada (estático, branco multicolor, Win-lock desligado).
    #[test]
    fn write_config_checksum_matches_capture() {
        let data = [
            0x00, 0x06, 0x04, 0x02, 0x00, 0x01, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let p = build_packet(Command::WriteConfig, 0x1B, 0, &data);
        assert_eq!(header(&p), "042a04061b000000");
    }

    #[test]
    fn chunking_matches_capture() {
        let k = chunks(KEYMAP_LEN);
        assert_eq!(k.len(), 10);
        assert_eq!(k[9], (0x06, 0x1F8));
        assert_eq!(chunks(LEDMAP_LEN), vec![(0x38, 0), (0x38, 0x38), (0x38, 0x70), (0x02, 0xA8)]);
    }

    #[test]
    fn decodes_known_entries() {
        assert!(matches!(decode_key([0x20, 0x00, 0x29]), KeyAction::Key { usage: 0x29 }));
        assert!(matches!(decode_key([0x20, 0x08, 0x00]), KeyAction::Modifier { mask: 0x08 }));
        assert!(matches!(decode_key([0x30, 0xe9, 0x00]), KeyAction::Consumer { usage: 0xE9 }));
        assert!(matches!(decode_key([0xa0, 0x01, 0x00]), KeyAction::Fn));
        assert!(matches!(decode_key([0xd0, 0xa2, 0x01]), KeyAction::Unknown));
    }

    #[test]
    fn decodes_backup_config() {
        let raw = [
            0x00, 0x06, 0x04, 0x02, 0x00, 0xff, 0xff, 0xff, 0xff, 0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0x00, 0, 0,
            0, 0, 0,
        ];
        let c = decode_config(&raw).unwrap();
        assert_eq!(c.mode, 6);
        assert_eq!(c.brightness, 4);
        assert!(!c.win_lock);
    }

    /// O bloco montado para o padrão é idêntico ao que o software oficial gravou.
    #[test]
    fn default_config_matches_captured_write() {
        let b = encode_config(&LightingInput::default()).unwrap();
        assert_eq!(hex(&b), "000604020001ffffff0000000000000000000000ff000000000000");
        let lock = encode_config(&LightingInput { win_lock: true, ..Default::default() }).unwrap();
        assert_eq!(hex(&lock), "000604020001ffffff0000000000000000000000ff010000000000");
        let blue = LightingInput { multicolor: false, rgb: [0, 0, 0xff], brightness: 3, mode: 0x14, ..Default::default() };
        assert_eq!(hex(&encode_config(&blue).unwrap()), "0014030200000000ff0000000000000000000000ff000000000000");
    }

    #[test]
    fn rejects_bad_config() {
        assert!(encode_config(&LightingInput { mode: 0x13, ..Default::default() }).is_err());
        assert!(encode_config(&LightingInput { brightness: 5, ..Default::default() }).is_err());
    }

    #[test]
    fn keymap_validation() {
        let factory = FACTORY_KEYMAP.to_vec();
        assert!(validate_keymap(&factory, &factory).is_ok());
        // CapsLock (entrada 3) -> B, como na captura
        let mut caps_b = factory.clone();
        caps_b[9..12].copy_from_slice(&[0x20, 0x00, 0x05]);
        assert!(validate_keymap(&caps_b, &factory).is_ok());
        // Fn protegido
        let mut no_fn = factory.clone();
        no_fn[FN_SLOT * 3..FN_SLOT * 3 + 3].copy_from_slice(&[0x20, 0x00, 0x05]);
        assert!(validate_keymap(&no_fn, &factory).is_err());
        // código desconhecido
        let mut weird = factory.clone();
        weird[0..3].copy_from_slice(&[0x77, 0x01, 0x02]);
        assert!(validate_keymap(&weird, &factory).is_err());
        // tamanho
        assert!(validate_keymap(&factory[..300], &factory).is_err());
    }

    /// Nenhuma tabela de cor pode ter bytes ≠ 0 depois do byte 383.
    #[test]
    fn colors_are_clamped_to_128_leds() {
        let all_blue: Vec<u8> = (0..COLORS_LEN).map(|i| [0x19, 0xb6, 0xff][i % 3]).collect();
        let s = sanitize_colors(&all_blue);
        assert_eq!(s.len(), COLORS_LEN);
        assert!(s[..384].iter().any(|&b| b != 0));
        assert!(s[384..].iter().all(|&b| b == 0));
    }

    /// O keymap sanitizado de fábrica tem que bater com o que o MK1 Elite gravou na captura
    /// (sessão 20261116_022340, t=592.144) em todas as posições, exceto a tecla "/" (#100),
    /// que o MK1 apaga e nós mantemos porque existe no ABNT2.
    #[test]
    fn sanitized_factory_matches_mk1_write() {
        let s = sanitize_keymap(FACTORY_KEYMAP);
        for i in 0..KEY_SLOTS {
            let ours = &s[i * 3..i * 3 + 3];
            let fac = &FACTORY_KEYMAP[i * 3..i * 3 + 3];
            if NON_PHYSICAL_INTL.contains(&i) {
                assert_eq!(ours, &[0x20, 0, 0], "posição {i}");
            } else if i >= LED_SLOTS {
                assert_eq!(ours, &[0, 0, 0]);
            } else {
                assert_eq!(ours, fac, "posição {i}");
            }
        }
        assert_eq!(&s[100 * 3..100 * 3 + 3], &[0x20, 0x00, 0x87]);
    }

    #[test]
    fn rejects_high_usages_on_new_assignments() {
        let factory = FACTORY_KEYMAP.to_vec();
        let mut k = factory.clone();
        k[0..3].copy_from_slice(&[0x20, 0x00, 0x91]); // Lang2 no Esc
        assert!(validate_keymap(&k, &factory).is_err());
        k[0..3].copy_from_slice(&[0x20, 0x00, 0x68]); // F13 (macro M1) no Esc
        assert!(validate_keymap(&k, &factory).is_ok());
    }

    #[test]
    fn factory_keymap_has_fn_and_esc() {
        assert_eq!(&FACTORY_KEYMAP[0..3], &[0x20, 0x00, 0x29]);
        assert_eq!(&FACTORY_KEYMAP[FN_SLOT * 3..FN_SLOT * 3 + 3], &[0xa0, 0x01, 0x00]);
    }

    #[test]
    fn write_commands_are_flagged() {
        assert!(Command::WriteKeymap.is_write());
        assert!(Command::StreamColors.is_write());
        assert!(!Command::ReadKeymap.is_write());
        assert!(!Command::Begin.is_write());
    }
}
