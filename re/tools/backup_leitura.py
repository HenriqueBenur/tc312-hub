"""Backup da configuração do Warrior TC312 usando SOMENTE pedidos de leitura capturados.

Uso:
    python -I backup_leitura.py <packets.txt da captura>            (simulação: mostra o que enviaria)
    python -I backup_leitura.py <packets.txt da captura> --executar (envia e salva o backup)

Segurança:
  - Os pacotes enviados são copiados byte a byte da captura do software oficial
    (sequência de abertura: 01, 03, 07 x10, 1B x4, 02 e uma leitura 05).
  - Cada pacote é conferido contra a lista branca de LEITURA {01, 02, 03, 05, 07, 1B};
    qualquer outro comando aborta antes de abrir o dispositivo.
  - Só abre o caminho HID com VID 0x320F, PID 0x5078 e usage page 0xFF1C.
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime
from pathlib import Path

READ_ONLY = {0x01, 0x02, 0x03, 0x05, 0x07, 0x1B}
VID, PID, USAGE_PAGE = 0x320F, 0x5078, 0xFF1C
ROOT = Path(__file__).resolve().parents[2]


def captured_read_sequence(packets_txt: Path) -> list[bytes]:
    outs = []
    for line in packets_txt.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            continue
        _, _, d, h = line.split()
        if d == "OUT":
            outs.append(bytes.fromhex(h))
    # 1) sequência de abertura: do primeiro BEGIN até o END seguinte
    start = next(i for i, b in enumerate(outs) if b[3] == 0x01)
    end = next(i for i in range(start, len(outs)) if outs[i][3] == 0x02)
    seq = [b for b in outs[start:end + 1] if b[3] != 0x12]
    # 2) uma leitura de configuração (0x05 len 1 e 0x05 len 0x1B), como o software faz
    i5 = next(i for i in range(end, len(outs)) if outs[i][3] == 0x05 and outs[i][4] == 0x01)
    seq += [outs[i5], outs[i5 + 1]]
    for b in seq:
        if b[3] not in READ_ONLY:
            raise SystemExit(f"ABORTADO: comando 0x{b[3]:02X} fora da lista de leitura")
        if len(b) != 64 or b[0] != 0x04:
            raise SystemExit("ABORTADO: pacote com formato inesperado")
    return seq


def main() -> None:
    packets_txt = Path(sys.argv[1])
    execute = "--executar" in sys.argv
    seq = captured_read_sequence(packets_txt)
    print(f"{len(seq)} pacotes de leitura: " + " ".join(f"{b[3]:02X}" for b in seq))
    if not execute:
        print("Simulação: nada foi enviado. Use --executar para rodar.")
        return

    import hid  # pacote hidapi do venv

    paths = [d for d in hid.enumerate(VID, PID) if d["usage_page"] == USAGE_PAGE]
    if len(paths) != 1:
        raise SystemExit(f"ABORTADO: esperava 1 coleção 0xFF1C do Warrior, achei {len(paths)}")
    dev = hid.device()
    dev.open_path(paths[0]["path"])
    responses = []
    try:
        for b in seq:
            dev.write(b)
            r = bytes(dev.read(64, timeout_ms=500))
            if len(r) != 64 or r[:8] != b[:8]:
                raise SystemExit(f"ABORTADO: resposta inesperada ao comando 0x{b[3]:02X}: {r[:8].hex(' ')}")
            responses.append(r)
            time.sleep(0.002)
    finally:
        dev.close()

    def collect(cmd: int) -> bytes:
        return b"".join(r[8:8 + r[4]] for r in responses if r[3] == cmd)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = ROOT / "re" / "backups" / f"backup_{stamp}"
    out.mkdir(parents=True, exist_ok=True)
    keymap, ledmap, info = collect(0x07), collect(0x1B), collect(0x03)
    cfg = [r for r in responses if r[3] == 0x05 and r[4] == 0x1B][0][8:8 + 0x1B]
    (out / "keymap.bin").write_bytes(keymap)
    (out / "ledmap.bin").write_bytes(ledmap)
    (out / "info.bin").write_bytes(info)
    (out / "config.bin").write_bytes(cfg)
    (out / "respostas_brutas.txt").write_text("\n".join(r.hex() for r in responses) + "\n", encoding="utf-8")
    (out / "backup.json").write_text(json.dumps({
        "data": stamp, "vid": "0x320F", "pid": "0x5078",
        "info_hex": info.hex(), "config_hex": cfg.hex(), "win_lock": cfg[0x15],
        "keymap_bytes": len(keymap), "ledmap_bytes": len(ledmap),
    }, indent=2), encoding="utf-8")
    print(f"Backup salvo em {out}")
    print(f"config: {cfg.hex(' ')}")
    print(f"Win-lock (byte 0x15): {cfg[0x15]}")


if __name__ == "__main__":
    main()
