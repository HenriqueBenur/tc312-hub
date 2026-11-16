"""Decodifica pacotes HID do protocolo EVision (teclado Warrior TC312, 320F:5078).

Entrada: um arquivo de texto com uma linha por pacote no formato
    <seq> <direcao: OUT|IN> <hex do pacote de 64 bytes, com report ID 0x04 no byte 0>
(é o formato gerado por pcap_to_packets.py). Saída: tabela legível com o comando,
checksum conferido e campos conhecidos (layout do OpenRGB EVisionKeyboardController).

Somente análise offline: este script NÃO abre o dispositivo.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass

COMMANDS = {
    0x01: "BEGIN",
    0x02: "END",
    0x03: "READ_CAPABILITIES?",   # visto só no firmware V2 (OpenRGB)
    0x05: "READ_CONFIG?",         # visto só no firmware V2 (OpenRGB)
    0x06: "WRITE_PARAMETER",
    0x10: "READ_CUSTOM_COLOR",
    0x11: "WRITE_CUSTOM_COLOR",
}

PARAMETERS = {
    0x00: "mode", 0x01: "brightness", 0x02: "speed", 0x03: "direction",
    0x04: "random_color", 0x05: "mode_color", 0x0F: "polling_rate", 0x11: "surmount_color",
}


@dataclass
class Packet:
    seq: str
    direction: str
    data: bytes

    @property
    def command(self) -> int:
        return self.data[3] if len(self.data) > 3 else -1

    def checksum_ok(self) -> bool | None:
        if len(self.data) < 64:
            return None
        if self.command in (0x01, 0x02) and self.data[1] == self.command:
            return True  # BEGIN/END usam bytes fixos (OpenRGB não calcula checksum)
        s = sum(self.data[3:64]) & 0xFFFF
        return self.data[1] == (s & 0xFF) and self.data[2] == (s >> 8)


def describe(p: Packet) -> str:
    d = p.data
    if not d or d[0] != 0x04:
        return f"(report id 0x{d[0]:02X} — fora do canal EVision)" if d else "(vazio)"
    name = COMMANDS.get(p.command, f"CMD_0x{p.command:02X}?")
    size, off = (d[4], d[5] | (d[6] << 8)) if len(d) > 6 else (0, 0)
    payload = d[8:8 + size] if size else b""
    extra = ""
    if p.command == 0x06:
        extra = f" param={PARAMETERS.get(d[5], f'0x{d[5]:02X}')}"
    elif p.command in (0x10, 0x11):
        extra = f" offset=0x{off:04X}"
    ck = {True: "ok", False: "ERRO", None: "-"}[p.checksum_ok()]
    return f"{name:<20} size={size:<3}{extra} ck={ck} payload={payload.hex(' ')}"


def main(path: str) -> None:
    with open(path, encoding="utf-8-sig") as fh:
        for line in fh:
            if line.startswith("#"):
                print(f"\n{line.strip()}")
                continue
            parts = line.split(maxsplit=2)
            if len(parts) < 3:
                continue
            pkt = Packet(parts[0], parts[1], bytes.fromhex(parts[2].replace(" ", "").strip()))
            print(f"{pkt.seq:>6} {pkt.direction:<3} {describe(pkt)}")


if __name__ == "__main__":
    main(sys.argv[1])
