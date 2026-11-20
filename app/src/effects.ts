// Catálogo de efeitos de iluminação e a matemática da prévia.
// `colorAt` é o espelho exato de `color_at` em src-tauri/src/effects.rs: o que a tela mostra
// é o que o motor manda ao teclado nos efeitos feitos pelo app.
import { LAYOUT, LAYOUT_HEIGHT, LAYOUT_WIDTH } from "./layout";

export type RGB = [number, number, number];
export type EffectKind = "wave" | "breathing" | "cycle" | "starlight" | "ripple";
export type PaletteKind = "rainbow" | 1 | 2 | 3;

export interface SoftEffect {
  kind: EffectKind;
  rainbow: boolean;
  colors: RGB[];
  speed: number;
  direction: number;
  brightness: number;
}

/** Onde cada combinação roda. */
export type Engine =
  | { at: "firmware"; mode: number } // modo do firmware (multicolor ou 1 cor); fica salvo no teclado
  | { at: "keys" } // cor por tecla gravada no teclado (modo personalizado 0x14); fica salvo
  | { at: "app"; kind: EffectKind } // desenhado pelo app quadro a quadro (0x12); precisa do app aberto
  | { at: "none"; why: string };

export interface EffectDef {
  id: string;
  name: string;
  hint: string;
  /** Prévia usada para os modos do firmware (aproximada). */
  preview: EffectKind | "static";
  speed: boolean;
  direction: "wave" | "firmware" | false;
  /** modo do firmware já visto funcionando neste teclado */
  verified: boolean;
  engine: (p: PaletteKind) => Engine;
}

const fw = (mode: number): Engine => ({ at: "firmware", mode });
const app = (kind: EffectKind): Engine => ({ at: "app", kind });
const NO_23 = "O firmware deste efeito só aceita arco-íris ou uma cor, e o app não tem como desenhá-lo (depende do firmware).";

export const EFFECTS: EffectDef[] = [
  {
    id: "static",
    name: "Cor fixa",
    hint: "Luz parada. Com 2 ou 3 cores vira um degradê da esquerda para a direita.",
    preview: "static",
    speed: false,
    direction: false,
    verified: true,
    engine: (p) => (p === 1 ? fw(0x06) : { at: "keys" }),
  },
  {
    id: "wave",
    name: "Onda",
    hint: "As cores correm pelo teclado.",
    preview: "wave",
    speed: true,
    direction: "wave",
    verified: false,
    engine: (p) => (p === "rainbow" || p === 1 ? fw(0x01) : app("wave")),
  },
  {
    id: "breathing",
    name: "Respiração",
    hint: "Acende e apaga devagar. Com várias cores, cada respiração usa a próxima.",
    preview: "breathing",
    speed: true,
    direction: false,
    verified: true,
    engine: (p) => (p === "rainbow" || p === 1 ? fw(0x05) : app("breathing")),
  },
  {
    id: "cycle",
    name: "Ciclo de cores",
    hint: "O teclado inteiro passa de uma cor para outra. Com uma cor, passeia pelos tons vizinhos.",
    preview: "cycle",
    speed: true,
    direction: false,
    verified: false,
    engine: (p) => (p === "rainbow" ? fw(0x04) : app("cycle")),
  },
  {
    id: "starlight",
    name: "Estrelas",
    hint: "Teclas acendem e apagam em momentos aleatórios.",
    preview: "starlight",
    speed: true,
    direction: false,
    verified: false,
    engine: (p) => (p === "rainbow" || p === 1 ? fw(0x0a) : app("starlight")),
  },
  {
    id: "ripple",
    name: "Círculos",
    hint: "Anéis de cor saem do centro do teclado.",
    preview: "ripple",
    speed: true,
    direction: false,
    verified: false,
    engine: (p) => (p === "rainbow" ? fw(0x12) : app("ripple")),
  },
  {
    id: "reactive",
    name: "Reativo",
    hint: "A tecla acende quando é pressionada (efeito do firmware).",
    preview: "static",
    speed: true,
    direction: false,
    verified: false,
    engine: (p) => (p === "rainbow" || p === 1 ? fw(0x07) : { at: "none", why: NO_23 }),
  },
];

/** Outros modos do firmware (nomes da documentação do OpenRGB para placas EVision; não vistos neste teclado). */
export const FIRMWARE_EXTRAS: { mode: number; name: string; preview: EffectKind | "static" }[] = [
  { mode: 0x02, name: "Onda longa", preview: "wave" },
  { mode: 0x03, name: "Roda de cores", preview: "ripple" },
  { mode: 0x08, name: "Ondulação", preview: "ripple" },
  { mode: 0x09, name: "Linha reativa", preview: "static" },
  { mode: 0x0b, name: "Florescer", preview: "starlight" },
  { mode: 0x0c, name: "Arco-íris vertical", preview: "wave" },
  { mode: 0x0d, name: "Furacão", preview: "ripple" },
  { mode: 0x0e, name: "Acumular", preview: "static" },
  { mode: 0x0f, name: "Estrelas lentas", preview: "starlight" },
  { mode: 0x10, name: "Visor", preview: "wave" },
  { mode: 0x11, name: "Surmount", preview: "wave" },
];

for (const x of FIRMWARE_EXTRAS) {
  EFFECTS.push({
    id: `fw-${x.mode}`,
    name: x.name,
    hint: "Efeito do firmware. O desenho exato só dá para ver no teclado.",
    preview: x.preview,
    speed: true,
    direction: "firmware",
    verified: false,
    engine: (p) => (p === "rainbow" || p === 1 ? fw(x.mode) : { at: "none", why: NO_23 }),
  });
}

export const CUSTOM_ID = "custom";

export const effectById = (id: string) => EFFECTS.find((e) => e.id === id);

/** Efeito da interface que corresponde a um modo do firmware gravado. */
export function effectForMode(mode: number): string {
  if (mode === 0x14) return CUSTOM_ID;
  const hit = EFFECTS.find((e) => {
    const a = e.engine("rainbow");
    const b = e.engine(1);
    return (a.at === "firmware" && a.mode === mode) || (b.at === "firmware" && b.mode === mode);
  });
  return hit?.id ?? "static";
}

export const PRESETS: { name: string; colors: RGB[] }[] = [
  { name: "Brasa", colors: [[255, 40, 0], [255, 140, 0], [255, 214, 0]] },
  { name: "Oceano", colors: [[0, 60, 255], [0, 190, 255], [0, 255, 170]] },
  { name: "Floresta", colors: [[10, 255, 60], [170, 255, 0], [0, 140, 60]] },
  { name: "Neon", colors: [[255, 0, 130], [0, 220, 255], [255, 230, 0]] },
  { name: "Gelo", colors: [[255, 255, 255], [120, 210, 255], [0, 90, 255]] },
  { name: "Sangue", colors: [[255, 0, 0], [120, 0, 10], [255, 60, 60]] },
];

// ---------------------------------------------------------------------------
// Matemática (espelho do Rust)
// ---------------------------------------------------------------------------
const PERIODS = [2.0, 3.0, 4.5, 6.0, 8.5, 12.0];
const TAU = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function hsv(h: number, s: number, v: number): RGB {
  const hh = frac(h / 360) * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][Math.min(i, 5)];
  return [r * 255, g * 255, b * 255];
}

function rgbToHsv([r8, g8, b8]: RGB): [number, number, number] {
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((((g - b) / d) % 6) + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function sample(e: SoftEffect, u: number): RGB {
  if (e.rainbow) return hsv(frac(u) * 360, 1, 1);
  const n = e.colors.length;
  if (n === 1) return [...e.colors[0]] as RGB;
  const seg = frac(u) * n;
  const i = Math.min(Math.floor(seg), n - 1);
  return lerp(e.colors[i], e.colors[(i + 1) % n], smooth(seg - i));
}

/** Igual ao hash do Rust (aritmética de 32 bits sem sinal). */
function hash(i: number, k: number): number {
  let h = (Math.imul(i, 73856093) ^ Math.imul(k, 19349663)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return (h % 10000) / 10000;
}

const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export function colorAt(e: SoftEffect, index: number, cx: number, cy: number, t: number): RGB {
  const period = PERIODS[Math.min(e.speed, 5)];
  const nx = cx / LAYOUT_WIDTH;
  const ny = cy / LAYOUT_HEIGHT;
  const single = !e.rainbow && e.colors.length === 1;
  let c: RGB;
  switch (e.kind) {
    case "wave": {
      const pos = e.direction === 1 ? 1 - nx : e.direction === 2 ? ny : e.direction === 3 ? 1 - ny : nx;
      const u = pos - t / period;
      if (single) {
        const band = 0.5 + 0.5 * Math.cos(TAU * u);
        c = scale(sample(e, 0), 0.18 + 0.82 * band * band);
      } else c = sample(e, -u);
      break;
    }
    case "breathing": {
      const cycles = t / period;
      const b = 0.5 - 0.5 * Math.cos(TAU * cycles);
      const k = Math.floor(cycles);
      const base = e.rainbow ? hsv(frac(k * 0.13) * 360, 1, 1) : ([...e.colors[k % e.colors.length]] as RGB);
      c = scale(base, b * b);
      break;
    }
    case "cycle": {
      const u = t / (period * 2);
      if (single) {
        const [h, s, v] = rgbToHsv(e.colors[0]);
        c = hsv(h + 28 * Math.sin(TAU * u), s, v);
      } else c = sample(e, u);
      break;
    }
    case "starlight": {
      const rate = 0.6 + hash(index, 7) * 0.9;
      const phase = hash(index, 3);
      const cyc = (t / period) * rate + phase;
      const tw = Math.pow(Math.max(0, Math.sin(Math.PI * frac(cyc))), 3);
      const k = Math.floor(cyc);
      const base = e.rainbow
        ? hsv(hash(index, k + 11) * 360, 1, 1)
        : ([...e.colors[Math.floor(hash(index, k + 11) * 1000) % e.colors.length]] as RGB);
      c = scale(base, tw);
      break;
    }
    case "ripple": {
      const dx = cx - LAYOUT_WIDTH / 2;
      const dy = (cy - LAYOUT_HEIGHT / 2) * 1.4;
      const d = Math.sqrt(dx * dx + dy * dy) / 9.5;
      const u = d - t / period;
      if (single) {
        const band = 0.5 + 0.5 * Math.cos(TAU * u);
        c = scale(sample(e, 0), 0.15 + 0.85 * band * band);
      } else c = sample(e, -u);
      break;
    }
  }
  const k = Math.min(e.brightness, 4) / 4;
  return c.map((x) => Math.max(0, Math.min(255, Math.round(x * k)))) as RGB;
}

/** Degradê parado (cor fixa com 2/3 cores ou arco-íris): 128 cores por índice da matriz. */
export function staticGradient(rainbow: boolean, colors: RGB[]): RGB[] {
  const out: RGB[] = Array.from({ length: 128 }, () => [0, 0, 0]);
  for (const k of LAYOUT) {
    const u = Math.min(1, Math.max(0, (k.x + k.w / 2) / LAYOUT_WIDTH));
    let c: RGB;
    if (rainbow) c = hsv(u * 300, 1, 1);
    else if (colors.length === 1) c = colors[0];
    else {
      const seg = u * (colors.length - 1);
      const i = Math.min(Math.floor(seg), colors.length - 2);
      c = lerp(colors[i], colors[i + 1], seg - i);
    }
    out[k.m] = c.map((x) => Math.round(x)) as RGB;
  }
  return out;
}

export const toHex = (c: RGB | number[]) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
export const fromHex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Centro de cada tecla, para a prévia. */
export const KEY_CENTERS = LAYOUT.map((k) => ({ m: k.m, cx: k.x + k.w / 2, cy: k.y + k.h / 2 }));
