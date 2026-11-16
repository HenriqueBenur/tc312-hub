"""Decodifica um keymap de 510 bytes (170 entradas de 3 bytes) lido com o comando 0x07.

Uso: python -I keymap_decode.py <keymap.bin> [saida.txt]
Formato da entrada (verificado na captura 20261116_022340):
  20 00 uu  -> tecla HID com uso uu
  20 mm 00  -> modificador (bitmask mm: 01 LCtrl, 02 LShift, 04 LAlt, 08 LWin, 10 RCtrl, 20 RShift, 40 RAlt, 80 RWin)
  30 lo hi  -> consumer control (mídia), uso hi<<8|lo
  outros    -> tipos ainda não identificados (ex.: d0 a2 nn, a0 01 00)
"""
from __future__ import annotations

import sys

HID = {0x04 + i: chr(65 + i) for i in range(26)}
HID.update({0x1E + i: str((i + 1) % 10) for i in range(10)})
HID.update({0x3A + i: f"F{i + 1}" for i in range(12)})
HID.update({
    0x28: "Enter", 0x29: "Esc", 0x2A: "Backspace", 0x2B: "Tab", 0x2C: "Espaco", 0x2D: "-", 0x2E: "=",
    0x2F: "[ (acento agudo)", 0x30: "] ([)", 0x31: "\\ (])", 0x32: "ISO # (])", 0x33: "Ç", 0x34: "~",
    0x35: "' (aspas)", 0x36: ",", 0x37: ".", 0x38: ";", 0x39: "CapsLock", 0x46: "PrintScreen",
    0x47: "ScrollLock", 0x48: "Pause", 0x49: "Insert", 0x4A: "Home", 0x4B: "PageUp", 0x4C: "Delete",
    0x4D: "End", 0x4E: "PageDown", 0x4F: "Direita", 0x50: "Esquerda", 0x51: "Baixo", 0x52: "Cima",
    0x53: "NumLock", 0x54: "KP /", 0x55: "KP *", 0x56: "KP -", 0x57: "KP +", 0x58: "KP Enter",
    0x59: "KP 1", 0x5A: "KP 2", 0x5B: "KP 3", 0x5C: "KP 4", 0x5D: "KP 5", 0x5E: "KP 6", 0x5F: "KP 7",
    0x60: "KP 8", 0x61: "KP 9", 0x62: "KP 0", 0x63: "KP .", 0x64: "ISO \\ (|)", 0x65: "Menu",
    0x85: "KP ,", 0x87: "Intl1 (/ ?)", 0x88: "Intl2", 0x89: "Intl3", 0x8A: "Intl4", 0x8B: "Intl5",
    0x90: "Lang1", 0x91: "Lang2",
})
MOD = {0x01: "LCtrl", 0x02: "LShift", 0x04: "LAlt", 0x08: "LWin", 0x10: "RCtrl", 0x20: "RShift",
       0x40: "RAlt (AltGr)", 0x80: "RWin"}
CONSUMER = {0x00E9: "Volume +", 0x00EA: "Volume -", 0x00E2: "Mudo", 0x00CD: "Play/Pause",
            0x00B5: "Próxima", 0x00B6: "Anterior", 0x00B7: "Stop", 0x0183: "Player de mídia",
            0x018A: "E-mail", 0x0192: "Calculadora", 0x0194: "Meu computador", 0x0223: "Navegador"}


def describe(e: bytes) -> str:
    t, a, b = e
    if t == 0x20 and a == 0 and b:
        return HID.get(b, f"HID 0x{b:02X}")
    if t == 0x20 and b == 0 and a:
        return MOD.get(a, f"modificador 0x{a:02X}")
    if t == 0x30:
        u = a | b << 8
        return f"consumer 0x{u:04X} {CONSUMER.get(u, '')}".strip()
    if e == b"\x00\x00\x00":
        return "-"
    return f"tipo 0x{t:02X} ({a:02X} {b:02X}) ?"


def decode(data: bytes) -> list[str]:
    return [f"{i // 3:3d}  {data[i:i + 3].hex()}  {describe(data[i:i + 3])}" for i in range(0, len(data) - 2, 3)]


if __name__ == "__main__":
    rows = decode(open(sys.argv[1], "rb").read())
    text = "\n".join(rows) + "\n"
    if len(sys.argv) > 2:
        open(sys.argv[2], "w", encoding="utf-8").write(text)
    print(text)
