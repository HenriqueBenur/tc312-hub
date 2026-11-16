"""Gera um diálogo cronológico pedido->resposta do canal EVision, sem o "ruído".

Uso: python -I dialogo_filtrado.py <pasta_da_sessao> [cmds_ignorados_hex ...]
Por padrão ignora 0x12 (fluxo contínuo de cores do MK1 Elite). Também ignora os
relatórios de teclado da interface 0 (o que a pessoa digitou), para não registrar teclas.
Lê packets.txt e grava dialogo_filtrado.txt.
"""
from __future__ import annotations

import sys
from pathlib import Path


def main(folder_arg: str, ignore: set[int]) -> None:
    folder = Path(folder_arg)
    lines = (folder / "packets.txt").read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    pending_out = None
    skip_next_in = False
    for line in lines:
        if line.startswith("#"):
            out.append(line)
            continue
        frame, t, direction, h = line.split()
        b = bytes.fromhex(h)
        if direction == "OUT":
            if b[3] in ignore:
                skip_next_in = True
                continue
            skip_next_in = False
            pending_out = (t, b)
            out.append(f"{float(t):10.3f} OUT cmd=0x{b[3]:02X} len=0x{b[4]:02X} off=0x{b[5] | b[6] << 8:04X}  {b[:8].hex(' ')} | {b[8:8 + max(b[4], 1)].hex()}")
        else:
            if b[0] != 0x04 or len(b) != 64:
                if b[0] in (0x03, 0x01, 0x08):  # consumer / NKRO / outros da interface 1
                    out.append(f"{float(t):10.3f} IN  id={b[0]} {b.hex(' ')}")
                continue  # id0 = teclado boot (digitação) -> não registrar
            if skip_next_in:
                skip_next_in = False
                continue
            out.append(f"{float(t):10.3f} IN  cmd=0x{b[3]:02X}  {b[:8].hex(' ')} | {b[8:].hex()}")
    (folder / "dialogo_filtrado.txt").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"{len(out)} linhas -> {folder / 'dialogo_filtrado.txt'}")


if __name__ == "__main__":
    ign = {int(x, 16) for x in sys.argv[2:]} or {0x12}
    main(sys.argv[1], ign)
