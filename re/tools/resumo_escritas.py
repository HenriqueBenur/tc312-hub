"""Resumo das ESCRITAS e mudanças de estado numa sessão capturada (análise offline).

Uso: python -I resumo_escritas.py <pasta_da_sessao>
Lê packets.txt e grava resumo_escritas.txt contendo, em ordem cronológica:
  - mudanças na configuração lida por 0x05 (só quando muda, com diff byte a byte)
  - cada comando que não seja leitura repetida (0x01/0x02/0x05/0x12 omitidos),
    com rajadas do mesmo comando colapsadas (primeiro, último e contagem)
  - leituras 0x07 (keymap) completas quando mudam
  - eventos da interface 1 com report ID 3/8/1 (não registra digitação da interface 0)
"""
from __future__ import annotations

import sys
from pathlib import Path

SKIP = {0x01, 0x02, 0x05, 0x12}


def diff(a: bytes, b: bytes) -> str:
    return " ".join(f"[{i:02X}]{a[i]:02X}->{b[i]:02X}" for i in range(min(len(a), len(b))) if a[i] != b[i])


def main(folder_arg: str) -> None:
    folder = Path(folder_arg)
    out: list[str] = []
    last_cfg = None
    burst: list[tuple[float, bytes]] = []
    last_out = None
    keymap_cur: dict[int, bytes] = {}
    keymap_prev: bytes | None = None

    def flush_burst() -> None:
        nonlocal burst
        if not burst:
            return
        t0, b0 = burst[0]
        if len(burst) == 1:
            out.append(f"{t0:9.3f} OUT 0x{b0[3]:02X} len={b0[4]:02X} off={b0[5] | b0[6] << 8:04X} | {b0[8:8 + b0[4]].hex()}")
        else:
            t1, b1 = burst[-1]
            offs = sorted({b[5] | b[6] << 8 for _, b in burst})
            out.append(f"{t0:9.3f}..{t1:.3f} OUT 0x{b0[3]:02X} x{len(burst)} offsets {offs[0]:04X}..{offs[-1]:04X} ({len(offs)} distintos)")
            out.append(f"           primeiro: {b0[:8].hex(' ')} | {b0[8:8 + b0[4]].hex()}")
            out.append(f"           ultimo:   {b1[:8].hex(' ')} | {b1[8:8 + b1[4]].hex()}")
        burst = []

    for line in (folder / "packets.txt").read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            flush_burst()
            out.append(line)
            continue
        _, t, d, h = line.split()
        t = float(t)
        b = bytes.fromhex(h)
        if d == "OUT":
            last_out = b
            cmd = b[3]
            if cmd in SKIP or cmd == 0x07:
                if burst and cmd not in (0x01, 0x02):
                    flush_burst()
                continue
            if burst and burst[-1][1][3] != cmd:
                flush_burst()
            burst.append((t, b))
            continue
        # IN
        if b[0] != 0x04:
            if b[0] in (0x01, 0x03, 0x08):
                flush_burst()
                out.append(f"{t:9.3f} EVT id={b[0]} {b.hex(' ')}")
            continue
        if last_out is None or b[3] != last_out[3]:
            continue
        if b[3] == 0x05 and b[4] == 0x1B:
            cfg = b[8:8 + 0x1B]
            if cfg != last_cfg:
                flush_burst()
                out.append(f"{t:9.3f} CFG {cfg.hex(' ')}" + (f"   mudou: {diff(last_cfg, cfg)}" if last_cfg else "   (inicial)"))
                last_cfg = cfg
        elif b[3] == 0x07:
            off = b[5] | b[6] << 8
            keymap_cur[off] = b[8:8 + b[4]]
            if off == 0x01F8:
                km = b"".join(keymap_cur[k] for k in sorted(keymap_cur))
                flush_burst()
                if keymap_prev is None:
                    out.append(f"{t:9.3f} KEYMAP lido ({len(km)} bytes, inicial)")
                elif km != keymap_prev:
                    out.append(f"{t:9.3f} KEYMAP mudou: {diff(keymap_prev, km)}")
                else:
                    out.append(f"{t:9.3f} KEYMAP lido (igual)")
                keymap_prev = km
                (folder / f"keymap_{t:09.3f}.bin").write_bytes(km)
                keymap_cur = {}
    flush_burst()
    (folder / "resumo_escritas.txt").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"{len(out)} linhas -> resumo_escritas.txt")


if __name__ == "__main__":
    main(sys.argv[1])
