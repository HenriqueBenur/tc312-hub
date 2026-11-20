// Cor de cada LED para a prévia na tela, a partir do que está (ou vai ser) aplicado.
import type { Lighting } from "./api";
import type { LedFn } from "./components";
import {
  colorAt,
  CUSTOM_ID,
  effectById,
  effectForMode,
  KEY_CENTERS,
  staticGradient,
  type RGB,
  type SoftEffect,
} from "./effects";

const centers = new Map(KEY_CENTERS.map((k) => [k.m, k]));
const dim = (c: RGB, b: number): RGB => c.map((x) => Math.round((x * Math.min(4, b)) / 4)) as RGB;

export function colorsFromHex(h: string | null): RGB[] {
  return Array.from({ length: 128 }, (_, i) => {
    if (!h || h.length < (i + 1) * 6) return [0, 0, 0] as RGB;
    const n = parseInt(h.slice(i * 6, i * 6 + 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as RGB;
  });
}

/** Efeito desenhado pelo app (o mesmo cálculo do motor em Rust). */
export function softLed(e: SoftEffect): LedFn {
  return (m, t) => {
    const k = centers.get(m);
    return k ? colorAt(e, m, k.cx, k.cy, t) : [0, 0, 0];
  };
}

/** Cores fixas por índice da matriz. */
export function staticLed(colors: RGB[], brightness = 4): LedFn {
  const c = colors.map((x) => dim(x, brightness));
  return (m) => c[m] ?? [0, 0, 0];
}

/** Prévia aproximada de um modo do firmware (arco-íris ou uma cor). */
export function firmwareLed(effectId: string, rainbow: boolean, color: RGB, speed: number, brightness: number): LedFn {
  const def = effectById(effectId);
  if (!def || def.preview === "static") {
    return staticLed(rainbow ? staticGradient(true, []) : Array.from({ length: 128 }, () => color), brightness);
  }
  return softLed({ kind: def.preview, rainbow, colors: [color], speed, direction: 0, brightness });
}

/** O que o teclado mostra agora, segundo o que o app gravou. */
export function currentLed(lighting: Lighting, colorsHex: string | null, appEffect: SoftEffect | null): LedFn {
  if (appEffect) return softLed(appEffect);
  if (lighting.mode === 0x14) return staticLed(colorsFromHex(colorsHex), lighting.brightness);
  // Estático do firmware: mostra a cor gravada (o efeito exato do "multicolor" nele não foi verificado).
  if (lighting.mode === 0x06) return staticLed(Array.from({ length: 128 }, () => lighting.rgb as RGB), lighting.brightness);
  const id = effectForMode(lighting.mode);
  if (id === CUSTOM_ID) return staticLed(colorsFromHex(colorsHex), lighting.brightness);
  return firmwareLed(id, lighting.multicolor, lighting.rgb as RGB, lighting.speed, lighting.brightness);
}
