# Incidente v1.0.0: letras abrindo atalhos do Windows

## Sintoma (relatado em 16/11/2026)
Depois de usar o TC312 Hub 1.0.0 (iluminação "Personalizado" e depois Caps Lock → B), algumas letras passaram a disparar funções do
Windows: W abre os Widgets (atalho **Win+W**), às vezes abre a Xbox Game Bar (**Win+G**). O defeito continuou depois de reconectar o
cabo, ligar e desligar o bloqueio da tecla Win e restaurar o padrão de fábrica.

## O que a investigação mostrou
1. **Não é a tecla Win presa no Windows.** Com `GetAsyncKeyState` nenhum modificador aparecia pressionado. Quem manda o lixo é o próprio teclado.
2. **O mesmo defeito já tinha acontecido com o software oficial.** Na captura USB da sessão com o MK1 Elite, a partir de ~117 s **todos**
   os relatórios do teclado vieram com duas "teclas fantasma" (`ff` nos bytes 3 e 7) e com relatórios estranhos do mouse interno.
   Foi quando você anotou "as teclas ficaram realizando funções como minimizar e tela cheia".
3. **A v1.0.0 escreveu numa área proibida.** A tabela de cores do modo Personalizado tem 510 bytes, mas só os 384 primeiros
   (128 LEDs) são cores. O MK1 Elite **nunca** escreveu nada diferente de zero depois disso: foram 15 mil quadros analisados.
   A v1.0.0 preencheu as 170 entradas com cor (`19 b6 ff …`), sobrescrevendo outra estrutura do firmware que fica salva no teclado.
   Por isso o defeito sobreviveu ao reconectar e ao "restaurar padrão", que na v1.0.0 não mexia na tabela de cores.
4. Na sua sessão, o modo Personalizado foi aplicado às 03:55 e o Caps → B às 03:56, o que bate com o início do problema.

## Correção na v1.0.1
- As cores ficam limitadas às 128 primeiras entradas; o resto vai sempre zerado, como no software oficial. Isso é imposto no Rust e coberto por teste.
- O mapa de teclas é gravado no mesmo formato do software oficial, e teclas novas só aceitam códigos até 0x84.
- **Reparar teclado** (aviso na tela inicial e em Ajustes): zera a tabela de cores inteira, regrava o mapa de fábrica e a iluminação padrão.
- O "Testar teclas" agora mostra também eventos de mídia, sistema e mouse vindos do Warrior e acusa quando o teclado manda lixo.

## O que ainda não foi verificado
- Se o reparo limpa o defeito: a correção foi feita com o Warrior desconectado.
- O gatilho exato do defeito na sessão do MK1 Elite (lá não houve gravação de cor fora do limite).

## Se o reparo não resolver
1. Desconecte o Warrior por 30 s e conecte de novo.
2. Teste a combinação de reset de fábrica das placas EVision (segurar **Fn + Esc** por ~5 s). Ela não é confirmada para o TC312.
3. Me mande o que aparece em "Testar teclas" ao apertar W, G e "/" para eu analisar.
