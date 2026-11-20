import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LAYOUT, LAYOUT_HEIGHT, LAYOUT_WIDTH, type PhysKey } from "./layout";
import type { RGB } from "./effects";
import { IconBulb, IconClose } from "./icons";

export interface KeyVisual {
  label: string;
  /** diferente do padrão de fábrica */
  changed?: boolean;
  /** alteração ainda não aplicada */
  pending?: boolean;
  /** destaque do teste de teclas */
  lit?: boolean;
  disabled?: boolean;
  /** desenho no lugar do texto */
  icon?: "bulb";
}

/** Cor do LED de cada tecla: fixa (função de `m`) ou animada (função de `m` e do tempo). */
export type LedFn = (m: number, t: number) => RGB;

const KEY_GAP = 0.09;

/** Mede o palco e escolhe o tamanho da tecla para o teclado inteiro caber sem rolagem. */
function useFitUnit(ref: React.RefObject<HTMLDivElement | null>, min = 26, max = 84) {
  const [unit, setUnit] = useState(48);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // clientWidth/Height = tamanho de layout (não muda com zoom/transform de captura)
      const padX = 48;
      const padY = 40;
      const u = Math.min((el.clientWidth - padX) / LAYOUT_WIDTH, (el.clientHeight - padY) / LAYOUT_HEIGHT);
      setUnit(Math.max(min, Math.min(max, Math.floor(u))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, min, max]);
  return unit;
}

export function KeyboardStage({
  visual,
  selected,
  onKey,
  led,
  live = false,
  glow = 0.35,
  paint,
  footer,
}: {
  visual: (k: PhysKey) => KeyVisual;
  selected?: number | null;
  onKey?: (k: PhysKey) => void;
  led?: LedFn | null;
  /** anima `led` com o tempo (prévia de efeito) */
  live?: boolean;
  /** intensidade do brilho embaixo das teclas (0..1) */
  glow?: number;
  /** modo pintura: clique e arraste pinta as teclas */
  paint?: (k: PhysKey) => void;
  footer?: ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const unit = useFitUnit(stage);
  const painting = useRef(false);
  const ledRef = useRef(led);
  ledRef.current = led;

  // Cores dos LEDs escritas direto no estilo (sem re-renderizar o React a cada quadro).
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const keys = Array.from(el.querySelectorAll<HTMLElement>("[data-m]"));
    const apply = (t: number) => {
      const f = ledRef.current;
      for (const k of keys) {
        const m = Number(k.dataset.m);
        const c = f ? f(m, t) : null;
        k.style.setProperty("--led", c ? `${c[0] | 0} ${c[1] | 0} ${c[2] | 0}` : "0 0 0");
      }
    };
    if (!live) {
      apply(0);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 33) return;
      last = now;
      apply(reduce ? 0 : (now - t0) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, led, unit]);

  useEffect(() => {
    const up = () => (painting.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const gap = Math.max(3, Math.round(unit * KEY_GAP));
  return (
    <div className="stage" ref={stage}>
      <div
        className={`board${paint ? " painting" : ""}`}
        ref={board}
        style={{ width: LAYOUT_WIDTH * unit, height: LAYOUT_HEIGHT * unit, ["--u" as string]: `${unit}px`, ["--glow" as string]: glow }}
      >
        {LAYOUT.map((k) => {
          const v = visual(k);
          const cls = [
            "key",
            selected === k.m && "selected",
            v.changed && "changed",
            v.lit && "lit",
            v.disabled && "locked",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={k.m}
              data-m={k.m}
              className={cls}
              style={{ left: k.x * unit, top: k.y * unit, width: k.w * unit - gap, height: k.h * unit - gap }}
              onClick={() => !paint && onKey?.(k)}
              onPointerDown={(e) => {
                if (!paint) return;
                e.preventDefault();
                painting.current = true;
                paint(k);
              }}
              onPointerEnter={() => paint && painting.current && paint(k)}
              title={k.label === v.label ? k.label : `${k.label} → ${v.label}`}
            >
              {v.icon === "bulb" ? (
                <IconBulb className="key-icon" aria-label={v.label} />
              ) : (
                <span className="key-label">{v.label}</span>
              )}
              {v.pending && <span className="key-dot" />}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><IconClose size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className={danger ? "btn danger" : "btn primary"} onClick={onConfirm} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`toggle${disabled ? " disabled" : ""}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "on" : ""}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  onChange,
  display,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  display: string;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className={`slider${disabled ? " disabled" : ""}`}>
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--pct" as string]: `${pct}%` }}
      />
      <span className="slider-value">{display}</span>
    </label>
  );
}

/** Botão de cor: mostra a amostra e abre o seletor do sistema. */
export function ColorSwatch({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  return (
    <label className="swatch" style={{ ["--c" as string]: value }} title={`${label}: ${value}`}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </label>
  );
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = ([r, g, b]: [number, number, number] | number[]) =>
  "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
