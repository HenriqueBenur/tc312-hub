//! Diagnóstico da gravação de keymap: grava Caps->B e mostra o que a releitura devolve,
//! imediatamente e depois de alguns intervalos. Restaura o keymap de fábrica no fim.
use std::{thread, time::Duration};

use tc312_hub_lib::device::Warrior;
use tc312_hub_lib::protocol;

fn diff(a: &[u8], b: &[u8]) -> String {
    let mut out = Vec::new();
    for i in 0..a.len().min(b.len()) / 3 {
        let (x, y) = (&a[i * 3..i * 3 + 3], &b[i * 3..i * 3 + 3]);
        if x != y {
            out.push(format!("#{i}: {}->{}", protocol::hex(x), protocol::hex(y)));
        }
    }
    if out.is_empty() { "nenhuma".into() } else { out.join(", ") }
}

fn main() {
    let w = Warrior::open().expect("abrir");
    let factory = protocol::FACTORY_KEYMAP.to_vec();
    let mut km = factory.clone();
    km[9..12].copy_from_slice(&[0x20, 0x00, 0x05]);

    // grava sem a verificação embutida, para observar a releitura
    let r = w.write_keymap_sanitized(&km);
    println!("write_keymap: {:?}", r.as_ref().err());
    for ms in [0u64, 300, 1000, 3000] {
        thread::sleep(Duration::from_millis(ms));
        let back = w.read_keymap().expect("ler");
        println!("apos +{ms}ms  diff(gravado -> relido): {}", diff(&km, &back));
        println!("              diff(fabrica -> relido): {}", diff(&factory, &back));
    }
    let st = w.read_state().expect("estado");
    let back = protocol::unhex(&st.keymap_hex).unwrap();
    println!("via read_state (sequencia de abertura): diff(fabrica -> relido): {}", diff(&factory, &back));

    w.write_keymap_sanitized(&factory).map(|_| println!("restaurado")).unwrap_or_else(|e| println!("restauracao: {e}"));
}
