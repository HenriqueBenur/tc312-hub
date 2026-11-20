---
name: tc312-protocolo
description: Protocolo USB/HID do teclado Warrior TC312 (placa EVision 320F:5078, a mesma da Phoenix MK1 Elite) e as regras de segurança para falar com ele. Use sempre que for ler, capturar, decodificar ou enviar pacotes ao Warrior, mexer na camada HID do TC312 Hub (remapeamento, macros, RGB, perfis, Win-lock) ou atualizar o que se sabe do protocolo, mesmo que a pessoa só diga "o teclado", "o Warrior" ou "a captura".
---

# Protocolo do Warrior TC312

Esta skill é viva: tudo o que for confirmado em captura ou teste entra em
`references/protocolo.md`, marcado como **[verificado]** (visto no aparelho desta
máquina) ou **[hipótese]** (vindo do OpenRGB, de outro modelo ou de dedução).
Nunca promova uma hipótese a verificado sem evidência (captura, resposta do teclado).

## Identificação (verificado)

| Campo | Valor |
|---|---|
| VID:PID | `0x320F:0x5078` |
| Fabricante / produto (strings USB) | `Evision` / `RGB Keyboard` |
| Chip (declarado pelo software oficial) | `VS11K09A` (SONiX rebatizado) |
| Canal de configuração | interface 1, coleção 4: usage page `0xFF1C`, usage `0x92`, In 64 / Out 64 bytes |
| Outro canal possível | interface 0 (teclado boot) tem Feature report de 65 bytes — **não investigado** |
| Software oficial | `C:\Program Files (x86)\MK1 Elite` (Phoenix MK1 Elite; perfis em `%LOCALAPPDATA%\Phoenix MK1 Elite`) |

Nesta máquina também estão o teclado Logitech G413 (`046D:C33A`) e o mouse G502
(`046D:C08B`), que estão em uso. **Nunca abra nem envie nada a VID `0x046D`.**
Abra o Warrior por VID + PID + usage page `0xFF1C`; nunca só por VID.

## Regras de segurança (obrigatórias)

1. **Autorização**: a pessoa quer autorização explícita antes de instalar algo, enviar
   qualquer pacote ao teclado ou gravar nele. Leituras já autorizadas: só os pedidos de
   leitura que o MK1 Elite mandou na captura.
2. **Lista branca**: envie apenas comandos que aparecem byte a byte em capturas do
   software oficial. Não teste códigos de comando às cegas (sem fuzzing): placas
   SONiX/EVision têm comandos de bootloader/ISP, e o OpenRGB já brickou teclados
   Redragon por protocolo errado em VID/PID reaproveitado.
   Lista branca atual (captura `20261116_022340`): leituras `0x01 0x02 0x03 0x05 0x07 0x1B`;
   escritas `0x06` (config), `0x09` (keymap), `0x0B` (cores custom), `0x12` (cores dinâmicas).
   Qualquer outro código de comando está proibido até aparecer numa captura.
   O 0x12 (modo direto) já foi aceito pelo nosso código (seção 12); a confirmação visual ainda falta.
   **Tabelas de cor (0x0B/0x12): nunca escreva byte ≠ 0 depois do byte 383 (entrada 127).** Isso corrompeu
   o teclado na v1.0.0 (letras abrindo atalhos do Windows). Ver a seção 10 de `references/protocolo.md`.
3. **Nunca** envie comandos de firmware, atualização, ISP ou bootloader, nem reproduza
   tráfego da tela de "atualizar firmware" do software oficial.
4. **Backup antes de gravar**: leia e salve o estado em `re/backups/` antes de
   qualquer gravação de configuração; a primeira gravação de cada tipo é confirmada
   com a pessoa na hora.
5. O Logitech é a rede de segurança: se o Warrior travar, a pessoa ainda digita.

## Fluxo de engenharia reversa

Ferramentas no projeto (`E:\CLAUDE CODE\TC312Hub`; até 19/11/2026 era `D:\CLAUDE\TC312Hub`, perdido):

- `re/capturar.ps1`: se reabre como admin, acha o Warrior pelos descritores (VID/PID)
  com uma sondagem de 1,5 s que é apagada na hora, e captura **só o endereço do
  Warrior** com o USBPcap enquanto guia a pessoa por ações no MK1 Elite, gravando
  marcas de horário (`marcas.csv`). `-SoDetectar` só testa a detecção.
  Observação: o USBPcapCMD só escreve a saída quando redirecionada para arquivo.
- `re/tools/pcap_to_packets.py <pasta_da_sessao>`: tshark → `packets.txt`
  (pacotes com report ID 0x04, separados por ação).
- `re/tools/evision_decode.py <packets.txt>`: decodifica comando, parâmetro, offset
  e confere o checksum.
- Rode Python com `.venv\Scripts\python.exe -I` na raiz do projeto, com o pacote `hidapi`.
  O venv antigo ficou no D: e precisa ser recriado se for usar as ferramentas de `re/`.

Para cada função nova: capture uma ação isolada → compare com a ação vizinha (diff de
bytes) → documente em `references/protocolo.md` com o nome da sessão de captura
como evidência → só então implemente.

## Onde está o detalhe

- `references/protocolo.md`: formato dos pacotes, comandos, parâmetros, checksum,
  keymap/macro (à medida que forem descobertos) e o histórico de evidências.
