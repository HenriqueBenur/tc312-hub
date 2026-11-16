//! Teste de gravação no teclado real, com restauração ao final.
//! Uso: cargo run --example hwtest
//! Cada passo grava, relê e confere; no fim o teclado volta ao keymap de fábrica
//! e à iluminação padrão (estático, branco multicolor, brilho 4, Win-lock desligado).

use tc312_hub_lib::device::Warrior;
use tc312_hub_lib::protocol::{self, LightingInput};

fn cfg_hex(w: &Warrior) -> String {
    protocol::hex(&w.read_config().expect("ler config"))
}

fn main() {
    let w = Warrior::open().expect("abrir Warrior");
    let start = w.read_state().expect("ler estado");
    let start_km = protocol::unhex(&start.keymap_hex).unwrap();
    println!("inicio: keymap==fabrica? {}  config={}", start_km == protocol::FACTORY_KEYMAP, cfg_hex(&w));

    // 1) Keymap: CapsLock (entrada 3) -> B, como o software oficial fez
    let mut km = start_km.clone();
    km[9..12].copy_from_slice(&[0x20, 0x00, 0x05]);
    protocol::validate_keymap(&km, &start_km).expect("validar");
    match w.write_keymap_sanitized(&km).map(|_| ()) {
        Ok(()) => println!("[1] keymap Caps->B gravado (eco confirmado em todos os pacotes)"),
        Err(e) => println!("[1] FALHOU: {e}"),
    }
    match w.write_keymap_sanitized(protocol::FACTORY_KEYMAP).map(|_| ()) {
        Ok(()) => println!("[1] keymap de fabrica regravado (eco confirmado)"),
        Err(e) => println!("[1] RESTAURACAO FALHOU: {e}"),
    }

    // 2) Config: Win-lock ligado e desligado (o byte 0x15 da leitura reflete o estado ao vivo)
    let base = LightingInput::default();
    let on = protocol::encode_config(&LightingInput { win_lock: true, ..base }).unwrap();
    w.write_config(&on).expect("gravar winlock on");
    println!("[2] winlock=1 gravado; leitura: {}", cfg_hex(&w));
    let off = protocol::encode_config(&base).unwrap();
    w.write_config(&off).expect("gravar winlock off");
    println!("[2] winlock=0 gravado; leitura: {}", cfg_hex(&w));

    // 3) Brilho 2 e de volta a 4
    let dim = protocol::encode_config(&LightingInput { brightness: 2, ..base }).unwrap();
    w.write_config(&dim).expect("gravar brilho 2");
    println!("[3] brilho=2 gravado; leitura: {}", cfg_hex(&w));
    std::thread::sleep(std::time::Duration::from_millis(1500));
    w.write_config(&off).expect("gravar padrao");
    println!("[3] padrao gravado; leitura: {}", cfg_hex(&w));

    let end = w.read_state().expect("ler estado final");
    println!(
        "fim: keymap==fabrica? {}  winlock={:?}",
        protocol::unhex(&end.keymap_hex).unwrap() == protocol::FACTORY_KEYMAP,
        end.config.map(|c| c.win_lock)
    );
}
