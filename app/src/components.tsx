import type { ReactNode } from "react";
import { LAYOUT, LAYOUT_HEIGHT, LAYOUT_WIDTH, type PhysKey } from "./layout";

export interface KeyVisual {
  label: string;
  /** borda laranja: diferente do padrão / pendente */
  changed?: boolean;
  /** ponto azul: alteração ainda não aplicada */
  pending?: boolean;
  /** cor de fundo (modo de pintura) */
  color?: string;
  /** destaque do teste de teclas */
  lit?: boolean;
  disabled?: boolean;
}

export function Keyboard({
  unit = 52,
  visual,
  selected,
  onKey,
}: {
  unit?: number;
  visual: (k: PhysKey) => KeyVisual;
  selected?: number | null;
  onKey?: (k: PhysKey) => void;
}) {
  return (
    <div className="keyboard" style={{ width: LAYOUT_WIDTH * unit, height: LAYOUT_HEIGHT * unit }}>
      {LAYOUT.map((k) => {
        const v = visual(k);
        const cls = [
          "key",
          selected === k.m && "selected",
          v.changed && "changed",
          v.lit && "lit",
          v.disabled && "locked",
          v.color && "painted",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={k.m}
            className={cls}
            style={{
              left: k.x * unit,
              top: k.y * unit,
              width: (k.w ?? 1) * unit - 6,
              height: (k.h ?? 1) * unit - 6,
              ...(v.color ? { background: v.color, color: contrast(v.color) } : {}),
            }}
            onClick={() => onKey?.(k)}
            title={k.label === v.label ? k.label : `${k.label} → ${v.label}`}
          >
            <span className="key-label">{v.label}</span>
            {v.pending && <span className="key-dot" />}
          </button>
        );
      })}
    </div>
  );
}

function contrast(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? "#0b0d11" : "#f2f4f8";
}

export function Modal({
  title,
  children,
  confirmLabel = "Confirmar",
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Cancelar</button>
          <button className={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      {label}
    </label>
  );
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = ([r, g, b]: [number, number, number] | number[]) =>
  "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
