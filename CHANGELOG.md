# Histórico de versões

## [1.1.0] — 2026-11-20

### Novidades
- **Atualização pelo próprio app**:
  - o app procura versão nova no GitHub ao abrir e a cada 6 horas;
  - **Ajustes → Atualizar agora** baixa, confere a assinatura, instala só com uma barra de progresso e reabre o app.
- **Paletas na iluminação**: cada efeito pode usar Arco-íris, 1 cor, 2 cores ou 3 cores.
  - O que o firmware não tem é desenhado pelo app e enviado ao teclado ~18 vezes por segundo.
  - A tela mostra onde cada combinação roda ("teclado" ou "app"). Veja `docs/ILUMINACAO.md`.
- **Prévia ao vivo** do efeito no desenho do teclado, com a mesma fórmula do motor que manda as cores.
- **Cor fixa em degradê** de 2 ou 3 cores, gravada tecla por tecla no Warrior (funciona sem o app).
- **Pintar teclas** arrastando o mouse, com atalho para aplicar um degradê.
- **Nova interface**:
  - o teclado se ajusta ao tamanho da janela;
  - sem barra de rolagem em 4K com escala de 150%;
  - fonte própria embutida e ícones desenhados para o app.
- **Bloquear Win** foi para a página Teclas.
- **Macros**:
  - disparam também com Shift, Ctrl ou Alt segurados;
  - apertar a tecla da macro de novo interrompe a execução.

### Correções
- **Alta**: o aviso "a versão 1.0.0 gravou cor…" voltava depois de qualquer gravação de iluminação, para quem nunca tinha usado o reparo.
  - A checagem agora roda uma vez só.
- **Média**: duas gravações ao mesmo tempo (ex.: salvar macros durante uma gravação no teclado) podiam apagar uma a outra no `settings.json`.
  - Agora há trava e cada gravação muda só o que é dela.
- **Média**: o `settings.json` era gravado direto. Uma queda de energia no meio deixava o arquivo ilegível e o app voltava ao zero em silêncio.
  - Agora grava num arquivo temporário e troca.
  - Se o arquivo estiver ilegível, guarda uma cópia antes de recomeçar.
- **Média**: uma segunda instância do app (ex.: clicar no atalho com o app na bandeja) disputava as teclas F13–F24 e o teclado.
  - Agora só traz a janela de volta.
- **Média**: o "Testar teclas" podia parar de receber eventos se a janela do Tauri registrasse o Raw Input depois dele.
  - Agora registra de novo ao ligar o teste.
- **Baixa**: respostas do teclado de outra conversa (ou relatórios atrasados) eram lidas como resposta do comando atual.
  - Agora a fila é esvaziada antes de cada pedido e relatórios que não são o eco esperado são ignorados.
- **Baixa**: "Bloquear Win" sem iluminação salva gravava a iluminação padrão por cima do efeito que estava no teclado.
  - Agora parte da configuração lida do teclado.
- **Baixa**: a versão exibida no app estava fixa no código. Agora vem do próprio app.

## [1.0.1] — 2026-11-16
- **Correção crítica**: a 1.0.0 gravava cor nas 170 entradas da tabela `0x0B`, corrompendo uma área do firmware.
  - Sintoma: letras abrindo atalhos do Windows.
  - As tabelas de cor agora param na entrada 127.
- Botão **Reparar teclado** e aviso automático para quem gravou iluminação com a 1.0.0. Detalhes em `docs/INCIDENTE-v1.0.0.md`.

## [1.0.0] — 2026-11-16
- Primeira versão: remapeamento, iluminação, cor por tecla, bloqueio da tecla Win, macros (F13–F24), perfis, backups, bandeja e "Testar teclas".
