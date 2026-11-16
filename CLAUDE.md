# TC312 Hub

Configurador no estilo G HUB (remapeamento, macros, RGB, perfis) para o teclado **Warrior TC312**
(placa EVision `320F:5078`, a mesma da Phoenix MK1 Elite), no Windows 11.

## Regras do projeto
- Antes de mexer no teclado, carregue a skill `tc312-protocolo` (`.claude/skills/tc312-protocolo`).
  Ela tem o protocolo e as regras de segurança: lista branca de comandos, nada de firmware,
  backup antes de gravar e nunca tocar em VID `0x046D` (o Logitech G413/G502 em uso).
- A pessoa quer **autorização explícita** antes de instalar algo, enviar pacotes novos ao teclado ou gravar nele.
  A primeira gravação de cada tipo é confirmada na hora.
- Separe fato verificado de hipótese, no código e nos docs.
- O MK1 Elite (software oficial) precisa estar encerrado quando o nosso código fala com o teclado
  (roda como admin e fica na bandeja). A pessoa não quer mais usá-lo.
- Comunicação em português do Brasil.

## Estrutura
- `re/`: engenharia reversa (captura USBPcap, decodificadores Python, backups do teclado em `re/backups/`).
- `app/`: o aplicativo Tauri 2 (Rust no backend + interface web).
- `docs/`: arquitetura, keymap decodificado e notas.
- Python das ferramentas: `.venv\Scripts\python.exe -I` (tem o `hidapi`).

## Estado
- v1.0.0 entregue em 16/11/2026: instalador em `release/`. Arquitetura em `docs/ARQUITETURA.md`, manual em `docs/MANUAL.md`.
- O 0x07 só devolve o keymap de fábrica; o mapa ativo fica em `%APPDATA%\com.tc312hub.app\settings.json`.

## Backup de referência
`re/backups/backup_20261116_025220`: keymap, mapa de LED, config e info de fábrica, lidos do próprio teclado.
