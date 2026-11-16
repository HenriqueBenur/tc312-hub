# TC312 Hub

Configurador no estilo G HUB para o teclado **Warrior TC312 Royal Cross** (placa EVision `320F:5078`), no Windows.
Substitui o software oficial (MK1 Elite) com remapeamento de teclas, macros, iluminação RGB, perfis e backups automáticos.

## Download
Baixe o instalador mais recente em **[Releases](https://github.com/HenriqueBenur/tc312-hub/releases/latest)**.
A partir da 1.1.0, o próprio app avisa e instala as novas versões com um clique (**Ajustes → Atualizações**).

## O que ele faz
- **Teclas:** remapeia qualquer tecla (letras, símbolos, modificadores, mídia, macros M1–M12). A tecla Fn é protegida.
- **Iluminação:** efeitos do próprio teclado, paletas de 1, 2 ou 3 cores, gradiente e cor por tecla.
- **Macros:** atalhos, textos e esperas, disparados por uma tecla do Warrior.
- **Perfis e backups:** cada gravação guarda antes o estado do teclado. O botão "Reparar" volta tudo ao padrão de fábrica.
- **Testar teclas:** mostra ao vivo o que o Warrior envia ao Windows.

## Segurança
O protocolo foi levantado por engenharia reversa do tráfego USB do software oficial.
- O app só envia comandos vistos nessa captura.
- Nunca grava firmware e nunca abre outro dispositivo além do Warrior.
- Nunca escreve além das áreas que o software oficial usa.

Os detalhes estão em [`.claude/skills/tc312-protocolo`](.claude/skills/tc312-protocolo/references/protocolo.md) e o histórico em [`docs/`](docs/).

## Desenvolvimento
Requisitos: Windows 10/11, Node 20+, Rust (stable-msvc) e Visual Studio Build Tools (C++).

```bash
cd app
npm install
npm run tauri dev
```

- Testes: `cd app/src-tauri && cargo test --lib`.
- Publicar uma versão: `scripts/release.ps1` (precisa da chave de assinatura do atualizador, que **não** fica no repositório).

## Créditos
O formato básico dos pacotes de iluminação foi confirmado com a documentação do [OpenRGB](https://gitlab.com/CalcProgrammer1/OpenRGB) (EVisionKeyboardController).
Nenhum código do OpenRGB foi copiado.
