# Arquitetura do TC312 Hub 1.1

```
app/
├── src/                        Interface (React + TypeScript, Vite)
│   ├── App.tsx                 shell: barra lateral, status, avisos, toasts; orquestra leituras e gravações
│   ├── App.css                 linguagem visual (tokens, componentes, teclado)
│   ├── api.ts                  tipos e chamadas aos comandos Rust
│   ├── components.tsx          KeyboardStage (teclado que se ajusta ao espaço + LEDs ao vivo), Modal, Toggle, Segmented, Slider
│   ├── effects.ts              catálogo efeito × paleta e a matemática da prévia (espelho de effects.rs)
│   ├── preview.ts              cor de cada LED para a prévia
│   ├── updater.ts              atualização pelo GitHub Releases (tauri-plugin-updater)
│   ├── icons.tsx               ícones desenhados para o app
│   ├── layout.json / layout.ts layout físico TKL ABNT2 → índice da matriz (fonte única: o Rust também lê)
│   ├── keys.ts                 legendas ABNT2, catálogo de funções, códigos do keymap, VKs
│   ├── pages/                  Teclas, Iluminação, Macros, Perfis, Ajustes
│   └── devMock.ts              backend simulado (só em `npm run dev` fora do Tauri; não entra no build)
└── src-tauri/
    ├── assets/factory_keymap.bin   keymap de fábrica lido do teclado
    ├── examples/                   hwtest, keymap_diag, repair, stream_test (teste do modo direto 0x12)
    └── src/
        ├── protocol.rs   pacotes EVision: enum fechado de comandos, checksum, encode/decode, validação, sanitize
        ├── device.rs     hidapi: abre só 320F:5078/0xFF1C; sequências do software oficial; confere eco; esvazia a fila antes de cada pedido
        ├── effects.rs    motor de efeitos do app: paletas, quadros 0x12 (~18/s), cão de guarda, pausa com o MK1 Elite
        ├── storage.rs    settings.json (gravação atômica e com trava), perfis, backups (40), log
        ├── macros.rs     macros por software: RegisterHotKey(F13–F24, também com Shift/Ctrl/Alt) + SendInput
        ├── keytest.rs    Raw Input numa janela invisível, filtrado pelo VID do Warrior; conta eventos estranhos
        └── lib.rs        comandos Tauri, bandeja, instância única, plugins de atualização
```

## Garantias de segurança
1. Comandos fora da lista branca não podem ser montados (`enum Command`).
2. Os pacotes de leitura, de keymap e de config são testados contra a captura do software oficial (`cargo test`).
3. Toda gravação segue: lê o estado → **backup** → valida (Fn protegido, só códigos conhecidos) → grava → confere o eco.
4. As tabelas de cor (`0x0B` e cada quadro `0x12`) passam por `sanitize_colors`: nada depois da entrada 127.
   - Há teste para cada efeito e paleta.
5. Nunca abre VID 0x046D (Logitech). Nenhum comando de firmware ou bootloader existe no código.
6. Recusa falar com o teclado enquanto o MK1 Elite estiver aberto. O motor de efeitos pausa.

## Efeitos do app (paletas)
O firmware só guarda modo, cor e "multicolor". Paletas de 2 e 3 cores (e algumas variações) são desenhadas em Rust (`effects.rs`).

- **Envio:** cada quadro vai pelo modo direto (`0x12`, 10 pacotes, sem BEGIN/END, como na captura).
- **Concorrência:** uma trava (`hid`) serializa o motor e as gravações. Gravações de configuração param o motor antes.
  - Se a gravação não escolhe efeito (ex.: Bloquear Win), o motor volta depois.
- **Ao parar:** regrava a configuração salva (ou a lida do teclado, no formato canônico) para o firmware retomar o efeito dele.
- **Cão de guarda:** enquanto o motor roda, o keytest conta eventos estranhos do Warrior (tecla 0xFF/0x00, mouse, sistema).
  Qualquer um faz o motor parar e mostrar o aviso.
- **Prévia:** `effects.ts` reproduz a mesma fórmula na tela (conferido: diferença máxima de 1 nível de cor).

## Atualização
- `tauri-plugin-updater` lê `https://github.com/HenriqueBenur/tc312-hub/releases/latest/download/latest.json`.
- **Assinatura:** o instalador é assinado com minisign. A chave privada fica em `%USERPROFILE%\.tauri\tc312hub.key`, fora do repositório.
  A pública está em `tauri.conf.json`, e o app recusa instalador com assinatura errada.
- **Instalação:** o NSIS roda em modo `passive` (só barra de progresso) e por usuário (sem UAC).
  - O app fecha antes; o próprio instalador o reabre no fim.
  - Antes de instalar, `prepare_update` para o efeito do app e devolve o teclado ao efeito do firmware.
- **Instância única:** `tauri-plugin-single-instance` impede duas cópias disputando F13–F24 e o teclado.

## Macros
- A tecla do Warrior recebe F13–F24 no firmware, que só o Warrior envia.
- O app registra F13–F24 como atalhos globais, sozinhos e com Shift/Ctrl/Alt, e reproduz a sequência com SendInput.
- Não há gancho global de teclado. O app precisa estar aberto ou na bandeja.

## Build e release
- Desenvolvimento: `cd app && npm run tauri dev`. Só a interface com backend simulado: `npm run dev` e abrir `http://localhost:1420`.
- Testes: `cd app/src-tauri && cargo test --lib`.
- Teste no hardware: `cargo run --example hwtest` e `cargo run --example stream_test`.
- Release: `powershell -ExecutionPolicy Bypass -File scripts\release.ps1 -Publish`.
  - Compila assinado e gera `latest.json` com as notas do `CHANGELOG.md`.
  - Publica `TC312-Hub_<versão>_x64-setup.exe`, `.sig` e `latest.json` no GitHub.
