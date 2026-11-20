//! Acesso HID ao Warrior TC312.
//!
//! Regras (skill `tc312-protocolo`):
//! - abre só VID 0x320F + PID 0x5078 + usage page 0xFF1C; nunca VID 0x046D;
//! - só comandos da lista branca (o `enum Command` é fechado);
//! - as sequências reproduzem as do software oficial (captura 20261116_022340);
//! - toda escrita confere o eco do teclado (cabeçalho e dados).

use std::time::{Duration, Instant};

use hidapi::{HidApi, HidDevice};
use serde::Serialize;

use crate::protocol::{self, Command, Config, KeySlot, PACKET_LEN};

const READ_TIMEOUT_MS: i32 = 800;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceState {
    pub info: String,
    pub config: Option<Config>,
    pub keymap: Vec<KeySlot>,
    pub keymap_hex: String,
    pub ledmap: Vec<u8>,
    /// "teclado" = tabela lida (fábrica); "app" = último keymap aplicado pelo TC312 Hub.
    pub keymap_source: String,
}

impl DeviceState {
    /// Substitui o keymap lido pelo keymap aplicado pelo app, quando houver.
    pub fn with_applied_keymap(mut self, applied_hex: Option<&str>) -> Self {
        if let Some(h) = applied_hex {
            if let Ok(b) = protocol::unhex(h) {
                if b.len() == protocol::KEYMAP_LEN {
                    self.keymap = protocol::decode_keymap(&b);
                    self.keymap_hex = h.to_string();
                    self.keymap_source = "app".into();
                }
            }
        }
        self
    }
}

pub struct Warrior {
    dev: HidDevice,
}

fn is_config_channel(d: &hidapi::DeviceInfo) -> bool {
    d.vendor_id() != protocol::FORBIDDEN_VID
        && d.vendor_id() == protocol::VID
        && d.product_id() == protocol::PID
        && d.usage_page() == protocol::USAGE_PAGE
}

impl Warrior {
    pub fn open() -> Result<Self, String> {
        let api = HidApi::new().map_err(|e| format!("Falha ao iniciar o HID: {e}"))?;
        let candidates: Vec<_> = api.device_list().filter(|d| is_config_channel(d)).collect();
        match candidates.as_slice() {
            [] => Err("Warrior TC312 não encontrado (VID 320F, PID 5078).".into()),
            [one] => {
                let dev = one
                    .open_device(&api)
                    .map_err(|e| format!("Não consegui abrir o canal de configuração: {e}"))?;
                Ok(Self { dev })
            }
            many => Err(format!("Encontrei {} canais de configuração; esperava 1.", many.len())),
        }
    }

    pub fn is_connected() -> bool {
        HidApi::new().map(|api| api.device_list().any(is_config_channel)).unwrap_or(false)
    }

    /// Descarta relatórios antigos na fila deste handle. No Windows cada handle aberto recebe
    /// uma cópia de toda resposta do teclado; sem isso, a resposta de outra conversa (ex.: o
    /// motor de efeitos) seria lida como se fosse desta.
    fn drain(&self) {
        let mut b = [0u8; PACKET_LEN];
        for _ in 0..64 {
            match self.dev.read_timeout(&mut b, 0) {
                Ok(n) if n > 0 => continue,
                _ => break,
            }
        }
    }

    fn transact(&self, cmd: Command, len: u8, offset: u16, data: &[u8]) -> Result<[u8; PACKET_LEN], String> {
        let req = protocol::build_packet(cmd, len, offset, data);
        self.drain();
        self.dev.write(&req).map_err(|e| format!("Falha ao enviar 0x{:02X}: {e}", cmd.code()))?;
        let deadline = Instant::now() + Duration::from_millis(READ_TIMEOUT_MS as u64);
        let mut resp = [0u8; PACKET_LEN];
        loop {
            let left = deadline.saturating_duration_since(Instant::now()).as_millis() as i32;
            if left <= 0 {
                return Err(format!("O teclado não respondeu ao comando 0x{:02X}.", cmd.code()));
            }
            let n = self
                .dev
                .read_timeout(&mut resp, left)
                .map_err(|e| format!("Falha ao ler resposta de 0x{:02X}: {e}", cmd.code()))?;
            if n == 0 {
                return Err(format!("O teclado não respondeu ao comando 0x{:02X}.", cmd.code()));
            }
            // relatório de outra conversa: ignora e continua esperando o eco deste pedido
            if protocol::response_matches(&req, &resp[..n]) {
                break;
            }
        }
        if cmd.is_write() && resp[8..8 + len as usize] != req[8..8 + len as usize] {
            return Err(format!("O teclado não confirmou os dados do comando 0x{:02X}.", cmd.code()));
        }
        Ok(resp)
    }

    fn read_block(&self, cmd: Command, total: usize) -> Result<Vec<u8>, String> {
        let mut out = Vec::with_capacity(total);
        for (len, off) in protocol::chunks(total) {
            let r = self.transact(cmd, len, off, &[])?;
            out.extend_from_slice(&r[8..8 + len as usize]);
        }
        Ok(out)
    }

    fn write_block(&self, cmd: Command, data: &[u8]) -> Result<(), String> {
        for (len, off) in protocol::chunks(data.len()) {
            let o = off as usize;
            self.transact(cmd, len, off, &data[o..o + len as usize])?;
        }
        Ok(())
    }

    /// Executa `f` entre BEGIN e END; END é enviado mesmo se `f` falhar.
    fn framed<T>(&self, f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        self.transact(Command::Begin, 0, 0, &[])?;
        let r = f();
        let end = self.transact(Command::End, 0, 0, &[]);
        let v = r?;
        end?;
        Ok(v)
    }

    pub fn read_keymap(&self) -> Result<Vec<u8>, String> {
        self.framed(|| self.read_block(Command::ReadKeymap, protocol::KEYMAP_LEN))
    }

    pub fn read_config(&self) -> Result<Vec<u8>, String> {
        self.transact(Command::ReadConfig, 0x01, 0, &[])?;
        let r = self.transact(Command::ReadConfig, protocol::CONFIG_LEN as u8, 0, &[])?;
        Ok(r[8..8 + protocol::CONFIG_LEN].to_vec())
    }

    /// Mesma sequência da abertura do software oficial:
    /// BEGIN, 0x03, 0x07 x10, 0x1B x4, END e depois 0x05 (len 1) + 0x05 (len 0x1B).
    pub fn read_state(&self) -> Result<DeviceState, String> {
        let (info, keymap, ledmap) = self.framed(|| {
            let info = self.transact(Command::ReadInfo, protocol::INFO_LEN as u8, 0, &[])?;
            let keymap = self.read_block(Command::ReadKeymap, protocol::KEYMAP_LEN)?;
            let ledmap = self.read_block(Command::ReadLedMap, protocol::LEDMAP_LEN)?;
            Ok((info, keymap, ledmap))
        })?;
        let cfg = self.read_config()?;
        Ok(DeviceState {
            info: protocol::hex(&info[8..8 + protocol::INFO_LEN]),
            config: protocol::decode_config(&cfg),
            keymap: protocol::decode_keymap(&keymap),
            keymap_hex: protocol::hex(&keymap),
            ledmap,
            keymap_source: "teclado".into(),
        })
    }

    /// Grava o keymap como o software oficial: 0x03, 0x03, BEGIN, 0x09 x10, END.
    /// Cada pacote é conferido pelo eco do teclado. Não dá para reler: o 0x07 sempre
    /// devolve a tabela de fábrica (verificado em 16/11/2026), então o app guarda o
    /// keymap aplicado nas próprias configurações.
    pub fn write_keymap(&self, data: &[u8]) -> Result<(), String> {
        if data.len() != protocol::KEYMAP_LEN {
            return Err("Keymap com tamanho errado.".into());
        }
        self.transact(Command::ReadInfo, protocol::INFO_LEN as u8, 0, &[])?;
        self.transact(Command::ReadInfo, protocol::INFO_LEN as u8, 0, &[])?;
        self.framed(|| self.write_block(Command::WriteKeymap, data))
    }

    /// Grava a configuração como o software oficial: BEGIN, 0x06, END.
    pub fn write_config(&self, block: &[u8; protocol::CONFIG_LEN]) -> Result<(), String> {
        self.framed(|| self.transact(Command::WriteConfig, protocol::CONFIG_LEN as u8, 0, block).map(|_| ()))
    }

    /// Grava as cores do modo personalizado (0x0B x10, sem BEGIN/END, como na captura).
    /// Sempre zera a área depois da entrada 127 (ver `protocol::sanitize_colors`).
    pub fn write_custom_colors(&self, rgb: &[u8]) -> Result<(), String> {
        if rgb.len() != protocol::COLORS_LEN {
            return Err("Tabela de cores com tamanho errado.".into());
        }
        let clean = protocol::sanitize_colors(rgb);
        self.write_block(Command::WriteCustomColors, &clean)
    }

    /// Quadro do modo direto (0x12 x10, sem BEGIN/END, como na captura do MK1 Elite).
    /// Não persiste: o teclado só mostra enquanto o app manda quadros.
    /// Mesma regra das cores: nada depois da entrada 127.
    pub fn stream_frame(&self, rgb: &[u8]) -> Result<(), String> {
        let clean = protocol::sanitize_colors(rgb);
        self.write_block(Command::StreamColors, &clean)
    }

    /// Grava o keymap sempre no formato do MK1 Elite (ver `protocol::sanitize_keymap`).
    pub fn write_keymap_sanitized(&self, data: &[u8]) -> Result<Vec<u8>, String> {
        let clean = protocol::sanitize_keymap(data);
        self.write_keymap(&clean)?;
        Ok(clean)
    }
}
