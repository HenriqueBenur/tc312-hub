//! Teste do modo direto (0x12) no Warrior TC312 — só para conferir a olho.
//! Uso: cargo run --example stream_test   (feche o TC312 Hub e o MK1 Elite antes)
//!
//! 4 s vermelho, 4 s verde, 4 s azul e 6 s de gradiente roxo→ciano andando.
//! Só as entradas 0..127 recebem cor (o resto vai zerado, ver `protocol::sanitize_colors`).
//! No fim regrava a configuração lida no começo (o efeito do firmware deve voltar).

use std::time::{Duration, Instant};

use tc312_hub_lib::device::Warrior;
use tc312_hub_lib::protocol::{self, LightingInput, LED_SLOTS};

fn solid(rgb: [u8; 3]) -> Vec<u8> {
    let mut v = vec![0u8; protocol::COLORS_LEN];
    for i in 0..LED_SLOTS {
        v[i * 3..i * 3 + 3].copy_from_slice(&rgb);
    }
    v
}

fn lerp(a: [u8; 3], b: [u8; 3], t: f32) -> [u8; 3] {
    let m = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t).round() as u8;
    [m(a[0], b[0]), m(a[1], b[1]), m(a[2], b[2])]
}

fn main() {
    let w = Warrior::open().expect("abrir Warrior (feche o TC312 Hub e o MK1 Elite)");
    let cfg = w.read_config().expect("ler config");
    println!("config antes: {}", protocol::hex(&cfg));

    let frame = Duration::from_millis(50);
    for (nome, cor) in [("vermelho", [255, 0, 0]), ("verde", [0, 255, 0]), ("azul", [0, 0, 255])] {
        println!("{nome} por 4 s");
        let t0 = Instant::now();
        let data = solid(cor);
        while t0.elapsed() < Duration::from_secs(4) {
            w.stream_frame(&data).expect("quadro 0x12");
            std::thread::sleep(frame);
        }
    }

    println!("gradiente roxo→ciano por 6 s");
    let (a, b) = ([140, 0, 255], [0, 220, 255]);
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(6) {
        let phase = t0.elapsed().as_secs_f32() * 0.5;
        let mut v = vec![0u8; protocol::COLORS_LEN];
        for i in 0..LED_SLOTS {
            // índice da matriz = coluna*8 + linha: a coluna dá a posição horizontal
            let x = (i / 8) as f32 / 21.0;
            let t = ((x + phase) * std::f32::consts::TAU).sin() * 0.5 + 0.5;
            v[i * 3..i * 3 + 3].copy_from_slice(&lerp(a, b, t));
        }
        w.stream_frame(&v).expect("quadro 0x12");
        std::thread::sleep(frame);
    }

    // regrava no formato canônico do software oficial (não os bytes crus da leitura)
    let lighting = LightingInput::from(&protocol::decode_config(&cfg).expect("config com 27 bytes"));
    let block = protocol::encode_config(&lighting).expect("config válida");
    w.write_config(&block).expect("regravar config");
    println!("config regravada; o efeito do firmware deve ter voltado.");
}
