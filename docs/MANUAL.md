# TC312 Hub 1.0 — manual rápido

## Instalar
1. Rode `release\TC312 Hub_1.0.0_x64-setup.exe`. A instalação é só para o seu usuário e não pede administrador.
2. Antes de abrir, **feche o MK1 Elite** (inclusive o ícone na bandeja), porque ele disputa o teclado e liga o bloqueio da tecla Win sozinho.
   O ideal é desinstalá-lo.
3. Abra o TC312 Hub. Ele detecta o Warrior e lê o teclado sozinho.

## Páginas
- **Teclas**: clique numa tecla do desenho, escolha a nova função à direita (letras, símbolos, modificadores, mídia, macros M1–M12 ou "Desativar tecla") e clique em **Aplicar no teclado**.
  - Borda laranja indica tecla diferente do padrão de fábrica. Ponto azul indica alteração ainda não aplicada.
  - A tecla **Fn** é protegida, para não perder as combinações com Fn.
  - **Testar teclas** mostra ao vivo o que o Warrior está enviando ao Windows e acende a tecla no desenho. O Logitech é ignorado.
- **Iluminação**: efeito, brilho, velocidade e cor. Em **Personalizado** você pinta cada tecla de uma cor.
  - Ali também fica o botão para **bloquear ou liberar a tecla Windows**, que é o mesmo que Fn+Win.
  - Os efeitos marcados "(não testado)" vêm da documentação de teclados da mesma família e ainda não foram vistos neste teclado.
- **Macros**: até 12 macros (M1–M12), com passos de **Atalho** (ex.: Ctrl+Shift+S), **Texto** e **Espera**.
  - Para usar uma macro, atribua M1…M12 a uma tecla do Warrior na página Teclas.
  - As macros rodam pelo TC312 Hub. Fechar a janela só esconde o app na bandeja; para desligar, use "Sair" no menu da bandeja.
- **Perfis**: salve a configuração atual (teclas, iluminação, cores e macros) com um nome e aplique com um clique.
- **Ajustes**:
  - **Restaurar padrão de fábrica**;
  - **backups automáticos**: o app guarda o estado antes de cada gravação, mantém os 40 mais recentes, e você pode restaurar as teclas de qualquer um;
  - a pasta de dados e informações do aparelho.

## Onde ficam os arquivos
`%APPDATA%\com.tc312hub.app\`:
- `settings.json`: mapa aplicado, iluminação, cores e macros;
- `profiles\`: perfis salvos;
- `backups\`: backups automáticos;
- `tc312hub.log`: registro de leituras e gravações.

## Se as letras começarem a abrir atalhos do Windows
Use **Ajustes → Reparar teclado** e depois desconecte e reconecte o cabo. Detalhes em `docs/INCIDENTE-v1.0.0.md`.

## Limitações conhecidas
- O teclado não informa o mapa de teclas ativo (o comando de leitura devolve só a tabela de fábrica). Por isso o app mostra o último mapa que **ele mesmo** aplicou.
  Se outro programa mudar as teclas, use "Restaurar padrão de fábrica" ou reaplique um perfil.
- As macros funcionam só com o TC312 Hub aberto (na janela ou na bandeja).
- Não há gravação de firmware: o app nunca atualiza nem altera o firmware do teclado.
