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
- `re/`: engenharia reversa (captura USBPcap, decodificadores Python, backups do teclado em `re/backups/`, fora do git).
- `scripts/`: `install-skills.ps1` (skills de design e Tauri) e `release.ps1` (instalador assinado + release no GitHub).
- `app/`: o aplicativo Tauri 2 (Rust no backend + interface web).
- `docs/`: arquitetura, keymap decodificado e notas.
- Python das ferramentas: `.venv\Scripts\python.exe -I` (tem o `hidapi`).

## Estado
- v1.0.0 e v1.0.1 em 16/11/2026; v1.1.0 em 20/11/2026.
  - A v1.1.0 traz atualização pelo app, paletas de iluminação, motor de efeitos `0x12` e nova interface.
- Releases em github.com/HenriqueBenur/tc312-hub (repositório público).
- Publicar: `scripts\release.ps1 -Publish`. A chave de assinatura fica em `%USERPROFILE%\.tauri\tc312hub.key` e nunca vai para o git.
- Docs:
  - `docs/ARQUITETURA.md` e `docs/MANUAL.md`;
  - `docs/ILUMINACAO.md`: efeito × paleta e pesquisa com fontes;
  - `CHANGELOG.md`.
- O 0x07 só devolve o keymap de fábrica; o mapa ativo fica em `%APPDATA%\com.tc312hub.app\settings.json`.
- Falta confirmação visual da pessoa:
  - o modo direto `0x12` aparece no teclado?
  - os modos ⚠️ de `docs/ILUMINACAO.md` funcionam?
- Antes de commitar, confira que nada de `re/captures`, `re/backups`, `release/`, logs ou chaves entrou (o `.gitignore` cobre).

## Backup de referência
`re/backups/backup_20261116_025220`: keymap, mapa de LED, config e info de fábrica, lidos do próprio teclado.
