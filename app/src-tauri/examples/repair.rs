//! Reparo do Warrior TC312 sem abrir o app (mesma rotina do botão "Reparar teclado").
//! Uso: cargo run --example repair
//! 1) tabela de cores 0x0B toda em zero (limpa a área depois da entrada 127 que a v1.0.0 corrompia)
//! 2) keymap de fábrica no formato do MK1 Elite
//! 3) configuração padrão (estático, branco multicolor, brilho 4, Win-lock desligado)

use tc312_hub_lib::device::Warrior;
use tc312_hub_lib::protocol::{self, LightingInput};

fn main() {
    let w = Warrior::open().expect("abrir Warrior (feche o TC312 Hub e o MK1 Elite)");
    let before = w.read_config().expect("ler config");
    println!("config antes:  {}", protocol::hex(&before));
    w.write_custom_colors(&vec![0u8; protocol::COLORS_LEN]).expect("limpar tabela de cores");
    println!("[1] tabela de cores zerada (510 bytes, eco confirmado)");
    w.write_keymap_sanitized(protocol::FACTORY_KEYMAP).expect("gravar keymap");
    println!("[2] keymap de fabrica gravado no formato do MK1 Elite");
    let cfg = protocol::encode_config(&LightingInput::default()).unwrap();
    w.write_config(&cfg).expect("gravar config");
    println!("[3] configuracao padrao gravada");
    println!("config depois: {}", protocol::hex(&w.read_config().expect("ler config")));
    println!("Pronto. Desconecte e reconecte o cabo do Warrior.");
}
