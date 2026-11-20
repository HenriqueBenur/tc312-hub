# Protocolo EVision — Warrior TC312 (320F:5078)

Legenda: **[verificado]** visto neste aparelho (sessão de captura citada) · **[hipótese]** OpenRGB, outro modelo ou dedução.
Sessão principal de evidência: `re/captures/20261116_022340` (MK1 Elite, 14 min, ~306 mil pacotes HID).
Ver `resumo_escritas.txt` dessa pasta para a cronologia das escritas.

## 1. Transporte — [verificado]

- **Pedido (OUT):** `SET_REPORT` pelo endpoint de controle (bmRequestType `0x21`, bRequest `0x09`,
  tipo Output, report ID `4`, wIndex = interface 1), 64 bytes. É o `HidD_SetOutputReport` do Windows;
  com hidapi, `hid_write` na coleção `0xFF1C` com o primeiro byte `0x04`.
- **Resposta (IN):** relatório de entrada de 64 bytes no endpoint de interrupção `0x82` (interface 1),
  ~1 ms depois. A resposta **ecoa o cabeçalho** (bytes 0–7) e traz os dados a partir do byte 8.
- Toda escrita de configuração vem entre `BEGIN (0x01)` e `END (0x02)`. Exceções vistas: `0x0B` e `0x12` são
  enviados sem moldura.

## 2. Formato do pacote (64 bytes) — [verificado]

| Byte | Conteúdo |
|---|---|
| 0 | report ID `0x04` |
| 1–2 | checksum LE = soma de 16 bits dos bytes 3..63 (BEGIN/END: `01 00` / `02 00`, o que equivale à mesma soma) |
| 3 | comando |
| 4 | tamanho dos dados (máx. `0x38` = 56) |
| 5–6 | offset LE (blocos de 56 bytes: 0x0000, 0x0038, … 0x01F8) |
| 7 | 0 |
| 8.. | dados |

## 3. Comandos

| Cmd | Função | Dir. | Evidência |
|---|---|---|---|
| 0x01 | BEGIN | — | [verificado] |
| 0x02 | END | — | [verificado] |
| 0x03 | Ler informações do aparelho (34 bytes) | leitura | [verificado] resposta `aa 55 00 00 0d aa 50 00 02 00 … 0f 32 01 50 00 02 00 00 00 00 01 02 03` |
| 0x05 | Ler configuração (27 bytes, offset 0) | leitura | [verificado] o software lê a cada ~3,5 s |
| 0x06 | Gravar configuração (27 bytes, offset 0) | **escrita** | [verificado] |
| 0x07 | Ler keymap **de fábrica** (510 bytes = 170 entradas × 3) | leitura | [verificado] 9 blocos de 0x38 + 1 de 0x06; não reflete o 0x09 (seção 9) |
| 0x09 | Gravar keymap (mesmo formato do 0x07) | **escrita** | [verificado] remap CapsLock→B mudou só a entrada 3: `200039`→`200005` |
| 0x0B | Gravar cores do modo personalizado (510 bytes = 170 × RGB) | **escrita** | [verificado] sem BEGIN/END |
| 0x12 | Cores dinâmicas ("direct mode"), 510 bytes por quadro | **escrita** | [verificado] o MK1 Elite manda ~17 quadros/s sem parar (≈175 pacotes/s) |
| 0x1B | Ler mapa tecla→LED (170 bytes; `ff` = sem LED) | leitura | [verificado] |

Antes de gravar keymap, o software repete `0x03` duas vezes. Ao abrir: `01, 03, 07×10, 1B×4, 02`.
**Não apareceu nenhum comando de macro** na captura (a gravação de macro no MK1 Elite falhou e
deixou o teclado emitindo funções de sistema). Macros do TC312 Hub devem ser feitas por software.

## 4. Bloco de configuração (0x05/0x06, 27 bytes)

| Offset | Campo | Evidência |
|---|---|---|
| 0x00 | sempre 0 (perfil?) | [hipótese] |
| 0x01 | modo de iluminação (tabela 5) | [verificado] 06 estático, 05 respiração, 14 personalizado, 01/03/04/0E… |
| 0x02 | brilho 0–4 | [verificado] 04→03 ao baixar um nível |
| 0x03 | velocidade (0 = mais rápida … 5) | [hipótese] sempre 02 na captura |
| 0x04 | direção | [hipótese] sempre 00 |
| 0x05 | cor aleatória/multicolor (01 = sim) | [verificado] 01 com cor `ff ff ff`; 00 com cor escolhida |
| 0x06–0x08 | cor R, G, B | [verificado] azul = `00 00 ff` |
| 0x09 | ? (08 no estado lido, 00 nas escritas) | desconhecido |
| 0x13 | ? (o software liga e desliga) | desconhecido |
| 0x14 | ? (normalmente `ff`; o software grava 00/01) | desconhecido |
| **0x15** | **Win-lock (01 = tecla Windows bloqueada)** | [verificado] muda sozinho a cada Fn+Win no teclado (evento `03 01 04` e, logo depois, nova leitura) |

Observações [verificado]:
- **O MK1 Elite grava `0x15 = 01` (Win-lock ligado) ao abrir.** Isso explica a tecla Win parar de funcionar toda vez que o software era usado.
- A leitura 0x05 quase sempre devolve `00 06 04 02 00 ff ff ff ff 08 … ff 00` mesmo depois das escritas de cor; só refletiu a escrita uma vez. O comportamento leitura × escrita (RAM × flash?) precisa de teste controlado.

## 5. Modos (byte 0x01) — [hipótese, OpenRGB; 05, 06 e 14 verificados]

`0x01` onda curta · `0x02` onda longa · `0x03` roda de cores · `0x04` ciclo de espectro · `0x05` respiração ·
`0x06` estático · `0x07` reativo · `0x08` ondulação · `0x09` linha reativa · `0x0A` estrelas rápidas ·
`0x0B` florescer · `0x0C` arco-íris vertical · `0x0D` furacão · `0x0E` acumular · `0x0F` estrelas lentas ·
`0x10` visor · `0x11` surmount · `0x12` arco-íris circular · `0x14` personalizado (usa as cores do 0x0B).

## 6. Keymap (0x07/0x09) — [verificado]

170 entradas de 3 bytes; a matriz usa **16 colunas × 8 linhas** (índice = coluna × 8 + linha), entradas 128–169 vazias.
Decodificador: `re/tools/keymap_decode.py`. Padrão de fábrica salvo em `re/backups/keymap_padrao_20261116.bin`
e decodificado em `docs/keymap_padrao_decodificado.txt`.

| Tipo | Formato | Exemplo |
|---|---|---|
| tecla | `20 00 uu` (uso HID) | `20 00 29` Esc |
| modificador | `20 mm 00` (bitmask) | `20 08 00` LWin, `20 40 00` AltGr |
| mídia | `30 lo hi` (uso consumer) | `30 e9 00` volume + |
| Fn | `a0 01 00` | posição à direita do AltGr |
| ? | `a0 11 00`, `d0 a2 nn` | [hipótese] Fn2/menu e funções de LED da camada Fn |

Linhas da matriz (colunas 0→15): 0 = Esc, F1…F12, PrtSc, ScrLk, Pause · 1 = aspas, 1…0, -, =, Backspace, Insert, Home ·
2 = Tab, Q…P, acento agudo, [, ], Delete, End · 3 = Caps, A…Ç, ~, ], Enter, PgUp, PgDn · 4 = LShift, \|, Z…;, /?, RShift, ↑ ·
5 = LCtrl, LWin, LAlt, (Lang2, Intl5), Espaço, (Intl4, Intl2, Lang1), AltGr, Fn, a0-11, RCtrl, ←, ↓, → · 6–7 = teclado
numérico e funções de mídia (posições que não existem no TKL).

## 7. Eventos espontâneos do teclado (interface 1, report ID 3) — [verificado]

- `03 02 04` a cada ~3,5 s (o software reage lendo 0x05).
- `03 01 04` quando o estado muda pelo teclado (ex.: Fn+Win → byte 0x15 alterna).
- Durante o defeito da macro apareceram usos consumer reais (`03 92 01` = Calculadora etc.) e relatórios de mouse (ID 8).

## 8. Evidências

| Sessão | O que mostrou |
|---|---|
| `re/captures/teste_deteccao` | Warrior no `\\.\USBPcap1`, endereço USB 6 (G502 = 3, G413 = 4) |
| `re/captures/20261116_022340` | Todo o mapa acima. Marcas de ação imprecisas (as ações aparecem defasadas das marcas); usar a cronologia |
| `re/backups/backup_20261116_025220` | Primeiro contato do nosso código (`re/tools/backup_leitura.py`, hidapi `write` + `read` de 64 bytes na coleção 0xFF1C): os 19 pedidos de leitura responderam com o cabeçalho ecoado; keymap e mapa de LED idênticos aos da captura; Win-lock = 0. Com o MK1 Elite fechado |

## 9. Testes de escrita feitos pelo nosso código (16/11/2026, `app/src-tauri/examples/hwtest.rs`)

- [verificado] **0x06** grava e a leitura 0x05 seguinte **reflete na hora**: Win-lock 1→0 e brilho 4→2→4 confirmados.
  (Na captura do MK1 Elite a leitura parecia atrasada; com o nosso código não.)
- [verificado] **0x09** é aceito: cada pacote volta com eco idêntico (cabeçalho e dados), ~10–19 ms por pacote.
- [verificado] **0x07 sempre devolve a tabela de fábrica**, mesmo logo após gravar 0x09 (testado com +0, 300, 1000 e 3000 ms
  e também pela sequência de abertura). Ou seja, o 0x07 lê os padrões, não o mapa ativo. O MK1 Elite guarda o mapa
  ativo no próprio JSON; o TC312 Hub guarda em `settings.json` (`keymapHex`).
- [verificado na captura] o efeito físico do 0x09 (Caps→B funcionou para a pessoa usando o MK1 Elite com essa mesma sequência).
- [hipótese] As cores do 0x0B são indexadas pela posição na matriz (a entrada 0 = Esc ficou verde quando a pessoa pintou o Esc).
- Ao final dos testes o teclado ficou com o keymap de fábrica e a configuração padrão `000604020001ffffff…ff00…`.

## 10. LIMITE CRÍTICO das tabelas de cor e de keymap (incidente da v1.0.0)

- [verificado na captura] Em 81 tabelas 0x0B e 15.167 quadros 0x12, o MK1 Elite **nunca** escreveu byte ≠ 0 depois do byte 383
  (entrada 127). Só as entradas 0..127 são cores, e o índice é o LED, que é igual à posição na matriz para 0..127 (ledmap identidade).
- [verificado] O ledmap (0x1B) depois da posição 128 contém outra tabela (`ff ff ff ff 04 05 00 01 02 03 0c 0d 57 09 …`).
  A área 384..509 das tabelas de 510 bytes é **outra estrutura do firmware**.
- [verificado] Incidente: a v1.0.0 gravou 0x0B com cor (`19 b6 ff`) nas 170 entradas. Depois disso, letras passaram a abrir
  atalhos do Windows (W → Widgets, Game Bar). O defeito persiste ao reconectar e não sai com keymap/config de fábrica.
- [verificado na captura] O mesmo sintoma aconteceu na sessão do MK1 Elite: a partir de t≈117 s **todos** os relatórios do teclado
  boot passaram a ter `ff` nos bytes 3 e 7 (`00 00 kk ff 00 00 00 ff`), e o "mouse interno" (ID 8) mandou `08 00 00 ff 00 00 00 ff`.
  Gatilho naquela sessão: desconhecido (nenhum comando do host na janela; fluxo 0x12 contínuo em andamento).
- [verificado na captura] O MK1 Elite grava o keymap com `20 00 00` nas posições 29, 37, 53, 61, 69, 100, 119, 127 (usos ≥ 0x85).
  O TC312 Hub 1.0.1 faz o mesmo, exceto na 100 (tecla "/ ?" do ABNT2, 0x87), que fica como na tabela de fábrica.
- **Regras (v1.0.1):** 0x0B/0x12 sempre com zeros depois do byte 383 (`sanitize_colors`). Keymap sempre por `sanitize_keymap`.
  Teclas novas só com usos ≤ 0x84. Reparo = 0x0B todo zero + keymap de fábrica sanitizado + config padrão (`examples/repair.rs`).
- [verificado pela pessoa] O reparo da v1.0.1 limpou o defeito (letras voltaram ao normal depois de reparar e reconectar).

## 11. Notas de implementação — [verificado]

- Com hidapi no Windows, `write()` de 64 bytes (byte 0 = `0x04`) na coleção `0xFF1C` e depois `read(64, timeout)` funciona; a resposta chega em ~1 ms.
- O MK1 Elite roda como administrador e fica escondido na bandeja depois de "fechado". Ele precisa estar **encerrado** antes de o nosso código falar com o teclado (ele manda o fluxo 0x12 e regrava o Win-lock).

## 12. Modo direto (0x12) e efeitos do app — v1.1.0

- [verificado] **0x12 é aceito pelo nosso código**: `examples/stream_test.rs` (20/11/2026) mandou ~300 quadros em 18 s.
  - Cada quadro tem 10 pacotes, sem BEGIN/END, 50 ms entre quadros, só entradas 0..127.
  - Todo pacote voltou com o eco dos dados.
  - Config antes: `000404020001ffffff…ff00…`. Foi regravada no fim no formato canônico e ficou idêntica.
- [não verificado] **Se as cores aparecem no teclado.** A pessoa não estava olhando durante o teste.
  - Precisa de confirmação visual: vermelho → verde → azul → degradê roxo/ciano.
- [hipótese, OpenRGB EVision V2] Ao parar de receber 0x12, o firmware volta ao efeito gravado.
  - O TC312 Hub não depende disso: ao parar o motor, regrava a configuração com 0x06.
- Regras do motor (`effects.rs`):
  - cada quadro passa por `sanitize_colors`;
  - ~18 quadros/s;
  - pausa com o MK1 Elite aberto;
  - para sozinho se o keytest vir evento estranho do Warrior (tecla 0xFF/0x00, mouse, sistema);
  - gravações de configuração param o motor antes de escrever.
- Leitura de respostas: cada handle aberto no Windows recebe cópia de todo relatório do teclado.
  - `transact` esvazia a fila antes de cada pedido e ignora relatórios que não são o eco esperado.
  - Isso permite o motor e uma gravação abrirem o teclado ao mesmo tempo, serializados pela trava `hid`.
