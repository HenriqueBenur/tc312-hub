# TC312 Hub 1.1 — manual rápido

## Instalar
1. Baixe o instalador `TC312-Hub_<versão>_x64-setup.exe` em [Releases](https://github.com/HenriqueBenur/tc312-hub/releases/latest) e execute.
   - A instalação é só para o seu usuário e não pede administrador.
2. Antes de abrir, **feche o MK1 Elite**, inclusive o ícone na bandeja.
   - Ele disputa o teclado e liga o bloqueio da tecla Win sozinho. O ideal é desinstalá-lo.
3. Abra o TC312 Hub. Ele detecta o Warrior e lê o teclado sozinho.

## Atualizar
- **Da 1.1.0 em diante:** o app procura versão nova ao abrir e a cada 6 horas.
  - Quando houver, aparece um aviso laranja na barra lateral.
  - Em **Ajustes → Atualizar agora** ele baixa do GitHub, confere a assinatura e instala.
  - A instalação mostra só uma barra de progresso, sem o assistente do Windows, e o app reabre sozinho.
- **Vindo da 1.0.x:** instale a 1.1.0 manualmente uma vez. A 1.0.x não tem o botão.

## Páginas
- **Teclas**: clique numa tecla, escolha a nova função embaixo e clique em **Aplicar no teclado**.
  - Funções disponíveis: letras, símbolos, modificadores, mídia, macros M1–M12 ou "Desativar tecla".
  - Traço verde-água: tecla diferente do padrão de fábrica. Ponto laranja: alteração ainda não aplicada.
  - A tecla **Fn** é protegida.
  - **Testar teclas** mostra ao vivo o que o Warrior envia ao Windows. O Logitech é ignorado.
  - **Bloquear Win** é o mesmo que Fn+Win.
  - O brilho embaixo das teclas mostra a iluminação atual.
- **Iluminação**:
  1. escolha o efeito à esquerda;
  2. escolha a paleta: Arco-íris, 1, 2 ou 3 cores;
  3. ajuste brilho, velocidade e direção;
  4. clique em **Aplicar no teclado** ou **Ligar efeito do app**.
  - A prévia aparece no desenho do teclado.
  - Cada efeito mostra onde roda:
    - **teclado**: fica gravado no Warrior;
    - **app**: precisa do TC312 Hub aberto ou na bandeja.
  - A tabela completa está em `ILUMINACAO.md`.
  - **Pintar teclas**: clique ou arraste sobre as teclas para pintar, ou use "Aplicar degradê".
  - Modos marcados "prévia aproximada" vêm da documentação de teclados da mesma família e ainda não foram vistos neste teclado.
- **Macros**: até 12 macros (M1–M12), com passos de **Atalho** (ex.: Ctrl+Shift+S), **Texto** e **Espera**.
  - Para usar, atribua M1…M12 a uma tecla do Warrior na página Teclas.
  - Funcionam também com Shift, Ctrl ou Alt segurados.
  - Apertar a tecla de novo durante a execução interrompe.
- **Perfis**: salve a configuração atual com um nome e aplique com um clique.
  - Inclui teclas, iluminação, efeito do app, cores e macros.
- **Ajustes**:
  - atualizações;
  - **Reparar teclado**;
  - backups automáticos: os 40 mais recentes, e dá para restaurar as teclas de qualquer um;
  - pasta de dados.

## Bandeja
- Fechar a janela só esconde o app: macros e efeitos do app continuam.
- Para sair de vez, use **Sair** no menu do ícone da bandeja. O teclado volta ao efeito gravado nele.

## Onde ficam os arquivos
`%APPDATA%\com.tc312hub.app\`:
- `settings.json`: mapa aplicado, iluminação, cores, efeito do app e macros;
- `profiles\`: perfis salvos;
- `backups\`: backups automáticos;
- `tc312hub.log`: registro de leituras e gravações.

## Se as letras começarem a abrir atalhos do Windows
- Use **Ajustes → Reparar teclado** e depois desconecte e reconecte o cabo. Detalhes em `INCIDENTE-v1.0.0.md`.
- Se um efeito do app estiver ligado, ele para sozinho quando o teclado manda eventos estranhos (cão de guarda).

## Limitações conhecidas
- O teclado não informa o mapa de teclas ativo: o comando de leitura devolve só a tabela de fábrica.
  - Por isso o app mostra o último mapa que **ele mesmo** aplicou.
- Macros e efeitos do app funcionam só com o TC312 Hub aberto (janela ou bandeja).
- Se o app for fechado à força, o teclado pode ficar no último quadro do efeito até a próxima gravação ou até reconectar o cabo.
- O app nunca atualiza nem altera o firmware do teclado.
