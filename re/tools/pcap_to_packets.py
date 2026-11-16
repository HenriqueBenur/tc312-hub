"""Extrai o diálogo HID com o Warrior TC312 de uma captura USBPcap.

Uso:
    python -I pcap_to_packets.py <pasta_da_sessao>
Lê <pasta>/tc312.pcap e <pasta>/marcas.csv e grava:
  packets.txt   todos os pacotes: <frame> <t_rel> <OUT|IN> <hex>   + linhas "# acao ..."
  dialogo.txt   versão compacta: cada par pedido->resposta, com repetições consecutivas
                idênticas colapsadas ("x123")

Formato observado (sessão 20261116_022340):
  OUT = SET_REPORT (bmRequestType 0x21, Output, report ID 4) pelo endpoint de controle;
        os 64 bytes ficam em usb.data_fragment.
  IN  = interrupção no endpoint 0x82 (interface 1); dados em usbhid.data.
Somente análise offline: não abre o dispositivo.
"""
from __future__ import annotations

import csv
import subprocess
import sys
from datetime import datetime
from pathlib import Path

TSHARK = r"C:\Program Files\Wireshark\tshark.exe"
FIELDS = ["frame.number", "frame.time_epoch", "usb.endpoint_address", "usb.irp_info.direction",
          "usb.bmRequestType", "usb.data_fragment", "usbhid.data", "usb.capdata"]


def load_marks(folder: Path) -> list[tuple[str, float, float]]:
    f = folder / "marcas.csv"
    if not f.exists():
        return []
    out = []
    with f.open(encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            ts = lambda s: datetime.fromisoformat(s[:26] + "+00:00").timestamp()  # noqa: E731
            out.append((row["acao"], ts(row["inicio_utc"]), ts(row["fim_utc"])))
    return out


def action_for(t: float, marks: list[tuple[str, float, float]]) -> str:
    for a, ini, fim in marks:
        if ini - 1.0 <= t <= fim + 3.0:
            return a
    prev = [a for a, ini, _ in marks if ini <= t]
    return f"depois_de_{prev[-1]}" if prev else "antes_do_roteiro"


def main(folder_arg: str) -> None:
    folder = Path(folder_arg)
    cmd = [TSHARK, "-r", str(folder / "tc312.pcap"), "-T", "fields", "-E", "separator=\t",
           "-Y", "usb.data_fragment || usbhid.data || usb.capdata"]
    for f in FIELDS:
        cmd += ["-e", f]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    marks = load_marks(folder)

    packets = []  # (frame, t, dir, bytes, action)
    for line in proc.stdout.splitlines():
        v = dict(zip(FIELDS, (line.split("\t") + [""] * len(FIELDS))[: len(FIELDS)]))
        t = float(v["frame.time_epoch"])
        if v["usb.bmRequestType"] == "0x21" and v["usb.data_fragment"]:
            d, direction = v["usb.data_fragment"], "OUT"
        elif v["usb.irp_info.direction"] == "0x01" and (v["usbhid.data"] or v["usb.capdata"]):
            d, direction = v["usbhid.data"] or v["usb.capdata"], "IN"
        else:
            continue
        packets.append((v["frame.number"], t, direction, bytes.fromhex(d.replace(":", "")), action_for(t, marks)))

    t0 = packets[0][1] if packets else 0.0
    full, compact = [], []
    cur_action = None
    last_key, run = None, 0

    def flush() -> None:
        nonlocal run
        if last_key and run:
            compact.append(f"{last_key[0]} {last_key[1]}" + (f"   x{run}" if run > 1 else ""))
        run = 0

    for frame, t, direction, data, action in packets:
        if action != cur_action:
            flush()
            last_key = None
            header = f"# acao {action}"
            full.append(header)
            compact.append(header)
            cur_action = action
        full.append(f"{frame} {t - t0:.6f} {direction} {data.hex()}")
        key = (direction, data.hex())
        if key == last_key:
            run += 1
        else:
            flush()
            last_key, run = key, 1
    flush()

    (folder / "packets.txt").write_text("\n".join(full) + "\n", encoding="utf-8")
    (folder / "dialogo.txt").write_text("\n".join(compact) + "\n", encoding="utf-8")
    print(f"{len(packets)} pacotes -> packets.txt ; {len(compact)} linhas -> dialogo.txt")


if __name__ == "__main__":
    main(sys.argv[1])
