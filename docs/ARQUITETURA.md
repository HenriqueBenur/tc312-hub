# Arquitetura do TC312 Hub 1.0

```
app/
├── src/                        Interface (React + TypeScript, Vite)
│   ├── App.tsx                 shell: barra lateral, status, avisos, toasts; orquestra leituras e gravações
│   ├── api.ts                  tipos e chamadas aos comandos Rust
│   ├── components.tsx          Keyboard (desenho do TKL), Modal, Toggle, cores
│   ├── layout.ts               layout físico TKL ABNT2 → índice da matriz (coluna*8+linha)
│   ├── keys.ts                 legendas ABNT2, catálogo de funções, códigos do keymap, VKs, efeitos
│   ├── pages/                  Teclas, Iluminação, Macros, Perfis, Ajustes
│   └── devMock.ts              backend simulado (só em `npm run dev` fora do Tauri; não entra no build)
└── src-tauri/
    ├── assets/factory_keymap.bin   keymap de fábrica lido do teclado
    ├── examples/hwtest.rs          teste de gravação no teclado real (restaura no fim)
    └── src/
        ├── protocol.rs   pacotes EVision: enum fechado de comandos, checksum, encode/decode, validação
        ├── device.rs     hidapi: abre só 320F:5078/0xFF1C; sequências iguais às do software oficial; confere eco
        ├── storage.rs    settings.json, perfis, backups (40), log
        ├── macros.rs     macros por software: RegisterHotKey(F13–F24) + SendInput
        ├── keytest.rs    "Testar teclas": Raw Input numa janela invisível, filtrado pelo VID do Warrior
        └── lib.rs        comandos Tauri, bandeja, fechar = esconder
```

## Garantias de segurança
1. Comandos fora da lista branca não podem ser montados (`enum Command`).
2. Os pacotes de leitura, de keymap e de config são testados contra a captura do software oficial (`cargo test`).
3. Toda gravação: lê o estado → **backup** → valida (Fn protegido, só códigos conhecidos) → grava → confere o eco.
4. Nunca abre VID 0x046D (Logitech). Nenhum comando de firmware ou bootloader existe no código.
5. Recusa falar com o teclado enquanto o MK1 Elite estiver aberto.

## Macros
A tecla do Warrior recebe F13–F24 no firmware, que só o Warrior envia. O app registra F13–F24 como atalhos globais e reproduz a sequência
com SendInput. Não há gancho global de teclado. O app precisa estar aberto ou na bandeja.

## Build
- Desenvolvimento: `cd app && npm run tauri dev`.
- Testes: `cd app/src-tauri && cargo test --lib`.
- Teste no hardware: `cargo run --example hwtest`.
- Instalador: `cd app && npm run tauri build` → `src-tauri/target/release/bundle/nsis/TC312 Hub_<versão>_x64-setup.exe`.
