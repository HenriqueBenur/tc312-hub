# Iluminação no TC312 Hub 1.1 — efeitos × paletas

Cada efeito pode usar **Arco-íris**, **1 cor**, **2 cores** ou **3 cores**. Quem desenha depende do que o firmware aceita:

- **Teclado**: fica gravado no Warrior e funciona sem o app.
  - modo do firmware com "multicolor" (arco-íris) ou com uma cor;
  - ou cor por tecla (modo personalizado `0x14` + tabela `0x0B`).
- **App**: o firmware não tem a combinação.
  - O TC312 Hub calcula cada quadro e manda pelo modo direto (`0x12`), ~18 quadros/s.
  - Só funciona com o app aberto ou na bandeja.
  - Ao sair pelo menu da bandeja, o app regrava a configuração salva e o teclado volta ao efeito do firmware.

## Tabela

Legenda: ✅ verificado neste teclado · ⚠️ modo do firmware ainda **não visto** neste teclado (vem do OpenRGB) · — indisponível.

| Efeito | Arco-íris | 1 cor | 2 cores | 3 cores |
|---|---|---|---|---|
| Cor fixa | Teclado: degradê do espectro, tecla por tecla (`0x14`) | Teclado: modo `0x06` + cor ✅ | Teclado: degradê tecla por tecla (`0x14`) | Teclado: degradê tecla por tecla (`0x14`) |
| Onda | Teclado: `0x01` multicolor ⚠️ | Teclado: `0x01` + cor ⚠️ | App | App |
| Respiração | Teclado: `0x05` multicolor (modo ✅, efeito do multicolor não verificado) | Teclado: `0x05` + cor ✅ | App (cada respiração usa a próxima cor) | App |
| Ciclo de cores | Teclado: `0x04` ⚠️ | App (passeia pelos tons vizinhos) | App | App |
| Estrelas | Teclado: `0x0A` multicolor ⚠️ | Teclado: `0x0A` + cor ⚠️ | App | App |
| Círculos | Teclado: `0x12` arco-íris circular ⚠️ | App | App | App |
| Reativo | Teclado: `0x07` multicolor ⚠️ | Teclado: `0x07` + cor ⚠️ | — | — |
| 11 outros modos do firmware | Teclado ⚠️ | Teclado ⚠️ | — | — |
| Pintar teclas | Cor por tecla, gravada no teclado (`0x14`), com atalho para degradê de até 3 cores | | | |

### Os 11 outros modos do firmware

Onda longa, Roda de cores, Ondulação, Linha reativa, Florescer, Arco-íris vertical, Furacão, Acumular, Estrelas lentas, Visor e Surmount.

### Por que alguns ficam indisponíveis

- **Reativo e os 11 outros modos com 2 ou 3 cores**: o firmware só guarda uma cor e a opção multicolor.
- **Reativo pelo app**: a animação depende de onde se tocou, e isso exigiria mapear as teclas apertadas para os LEDs.
  - Fica para uma próxima versão.
- **Os 11 outros modos pelo app**: o desenho deles só existe dentro do firmware.

### Limitações dos efeitos feitos pelo app

- Precisam do app rodando (janela ou bandeja). Fechar a janela não para o efeito: ele continua na bandeja.
- Se o app fechar à força (ex.: Gerenciador de Tarefas), o teclado pode ficar parado no último quadro até a próxima gravação ou até reconectar o cabo.
  - A atualização pelo botão para o efeito antes de instalar.
- **Cão de guarda:** o motor para sozinho se o teclado mandar eventos estranhos, o mesmo sinal do defeito de firmware visto em 16/11 (tecla sem código, eventos de mouse ou de sistema).
- O efeito pausa enquanto o MK1 Elite estiver aberto.
- Cada quadro só escreve as entradas 0..127, a mesma regra que evita o defeito da v1.0.0 (veja `INCIDENTE-v1.0.0.md`).

### O que foi e o que não foi verificado

- ✅ O comando `0x12` é aceito: em 20/11/2026, `examples/stream_test.rs` mandou ~300 quadros em 18 s.
  - Cada pacote voltou com o eco dos dados.
  - A configuração foi regravada igual no fim.
- ❓ **Se as cores aparecem de fato no teclado só a pessoa pode confirmar olhando.** Isso vale para o modo direto e para cada modo marcado ⚠️.
- ✅ A prévia na tela usa a mesma fórmula do motor.
  - Conferido em 160 combinações × 89 teclas, com diferença máxima de 1 nível por arredondamento.

## Pesquisa nos aplicativos de referência

Só entra aqui o que foi lido nos documentos oficiais. A última seção separa o que é inferência nossa.

### Corsair

**[CUE — Quick Start Guide](http://softwaredownloads.corsair.com/Files/Gaming-Keyboards/CUE-QSG.pdf), págs. 8–11 do guia:**
- **Rainbow Wave:** arco-íris de 7 cores.
  - 3 velocidades: lenta ≈ 7 s, média ≈ 4 s e rápida ≈ 2 s para atravessar o teclado.
  - Direção esquerda, direita, cima ou baixo.
- **Color Shift:** transição de uma cor para outra, com duas opções de cor:
  - "Random";
  - "Alternating", que alterna entre a cor 1 e a cor 2.
  - 3 velocidades.
- **Color Pulse:** como o Color Shift, mas pulsando numa curva senoidal. Mesmas opções Random/Alternating.
- **Color Ripple:** Random/Alternating, 3 velocidades e 4 direções.
- **Type Lighting (Ripple):** dispara ao apertar uma tecla, com cor escolhida ou "Random".

**[Manual do K70 CORE](https://www.corsair.com/us/en/explorer/gamer/keyboards/k70-core/), efeitos gravados no teclado:**
- Color Shift, Color Pulse e Color Wave aparecem como "random color order".
- Static Color percorre 8 cores fixas.
- Fn+−/= muda a velocidade e Fn+[/] gira a direção.

**[Tipos de iluminação (ventoinhas)](https://www.corsair.com/us/en/explorer/diy-builder/fans/explaining-lighting-types-for-corsair-rgb-fans/):**
- Os efeitos prontos têm "animation speed, direction, and color(s)" ajustáveis.
- A categoria Custom inclui **Gradient**.

### Razer

**[BlackWidow V4 Master Guide](https://dl.razerzone.com/master-guides/RazerSynapse3/BLACKWIDOWV4-00000647-en.pdf), pág. 18 do PDF:**
- **Breathing:** "Select up to 2 colors or randomize colors".
- **Starlight:** até 2 cores ou aleatório, mais a duração.
- **Spectrum cycling:** "No further customization required".
- **Wave:** esquerda para direita ou direita para esquerda.
- **Wheel:** sentido horário ou anti-horário.
- **Reactive:** cor e duração.
- **Static:** uma cor.

### Logitech

**[Guia do G915 TKL](https://www.logitech.com/assets/65920/g915-g913-tkl-qsg.pdf), pág. 7:**
- Efeitos gravados no teclado: Colorwave (esquerda→direita, direita→esquerda, centro para fora, de baixo para cima), Color cycle, Ripple e Breathing.
- Velocidade em Brightness + −/+.

### ASUS (Aura Sync)

- **O Aura Sync é da ASUS, não da MSI.** A [página oficial](https://www.asus.com/campaign/aura/global/) é da ASUSTeK.
- Efeitos listados:
  - Static, Breathing, Strobing, Rainbow, Starry night, Music, Smart, Adaptive Color e Dark;
  - Color cycle, descrito como "Fades between the colors of rainbow".
- Só no Aura Creator: Comet, Star e Tide ("single or multi-color").
- A página não informa velocidade nem direção.

### MSI

- O software da MSI é o **Mystic Light**.
- As páginas oficiais recusaram o acesso automático (HTTP 403), então **nada da MSI foi usado** neste trabalho.

### Inferências nossas (não estão nos manuais)

- **Paletas de 3 cores** para Onda, Respiração, Estrelas e Círculos são uma extensão pedida para o TC312 Hub.
  - Os manuais lidos confirmam 2 cores (Corsair "Alternating", Razer "up to 2 colors") e cor aleatória.
  - A ASUS fala em "multi-color" no Tide, sem dizer quantas.
- **Ciclo de cores com 1 cor = passear pelos tons vizinhos (±28°)** é escolha nossa.
  - Com uma cor só, o ciclo viraria cor fixa.
- **Os nomes dos modos do firmware** vêm do OpenRGB (EVisionKeyboardController).
  - Só `0x05`, `0x06` e `0x14` foram vistos neste teclado.
