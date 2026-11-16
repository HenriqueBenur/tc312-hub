import type { KeyAction } from "./api";

// ---------------------------------------------------------------------------
// Legendas (layout ABNT2) para os usos HID da página Keyboard/Keypad
// ---------------------------------------------------------------------------
export const HID: Record<number, string> = {
  0x28: "Enter", 0x29: "Esc", 0x2a: "Backspace", 0x2b: "Tab", 0x2c: "Espaço",
  0x2d: "-", 0x2e: "=", 0x2f: "´", 0x30: "[", 0x31: "\\ (ANSI)", 0x32: "]", 0x33: "Ç",
  0x34: "~", 0x35: "'", 0x36: ",", 0x37: ".", 0x38: ";", 0x39: "Caps Lock",
  0x46: "PrtSc", 0x47: "ScrLk", 0x48: "Pause", 0x49: "Ins", 0x4a: "Home", 0x4b: "PgUp",
  0x4c: "Del", 0x4d: "End", 0x4e: "PgDn", 0x4f: "→", 0x50: "←", 0x51: "↓", 0x52: "↑",
  0x53: "Num Lock", 0x54: "Num /", 0x55: "Num *", 0x56: "Num -", 0x57: "Num +", 0x58: "Num Enter",
  0x59: "Num 1", 0x5a: "Num 2", 0x5b: "Num 3", 0x5c: "Num 4", 0x5d: "Num 5", 0x5e: "Num 6",
  0x5f: "Num 7", 0x60: "Num 8", 0x61: "Num 9", 0x62: "Num 0", 0x63: "Num .", 0x64: "\\",
  0x65: "Menu", 0x85: "Num ,", 0x87: "/", 0x88: "Intl2", 0x89: "Intl3", 0x8a: "Intl4",
  0x8b: "Intl5", 0x90: "Lang1", 0x91: "Lang2",
};
for (let i = 0; i < 26; i++) HID[0x04 + i] = String.fromCharCode(65 + i);
for (let i = 0; i < 10; i++) HID[0x1e + i] = String((i + 1) % 10);
for (let i = 0; i < 12; i++) HID[0x3a + i] = `F${i + 1}`;
for (let i = 0; i < 12; i++) HID[0x68 + i] = `F${i + 13}`;

export const MOD: Record<number, string> = {
  0x01: "Ctrl", 0x02: "Shift", 0x04: "Alt", 0x08: "Win",
  0x10: "Ctrl Dir.", 0x20: "Shift Dir.", 0x40: "AltGr", 0x80: "Win Dir.",
};

export const CONSUMER: Record<number, string> = {
  0x00e9: "Volume +", 0x00ea: "Volume −", 0x00e2: "Mudo", 0x00cd: "Play/Pausa",
  0x00b5: "Próxima faixa", 0x00b6: "Faixa anterior", 0x00b7: "Parar", 0x0183: "Player de mídia",
  0x018a: "E-mail", 0x0192: "Calculadora", 0x0194: "Meu computador", 0x0223: "Navegador",
  0x0221: "Pesquisar", 0x022a: "Favoritos", 0x006f: "Brilho da tela +", 0x0070: "Brilho da tela −",
};

/** Primeira tecla de macro: F13 (HID 0x68). M1..M12 = F13..F24. */
export const MACRO_HID_BASE = 0x68;

export function macroSlotOfAction(a: KeyAction): number | null {
  return a.kind === "key" && a.usage >= MACRO_HID_BASE && a.usage < MACRO_HID_BASE + 12 ? a.usage - MACRO_HID_BASE : null;
}

export function actionLabel(a: KeyAction): string {
  const slot = macroSlotOfAction(a);
  if (slot !== null) return `M${slot + 1}`;
  switch (a.kind) {
    case "key":
      return HID[a.usage] ?? `HID 0x${a.usage.toString(16).padStart(2, "0")}`;
    case "modifier":
      return MOD[a.mask] ?? `Mod 0x${a.mask.toString(16)}`;
    case "consumer":
      return CONSUMER[a.usage] ?? `Mídia 0x${a.usage.toString(16).padStart(4, "0")}`;
    case "fn":
      return "Fn";
    case "empty":
      return "—";
    default:
      return "?";
  }
}

export function actionKindLabel(a: KeyAction): string {
  if (macroSlotOfAction(a) !== null) return "Macro";
  return {
    key: "Tecla",
    modifier: "Modificador",
    consumer: "Mídia",
    fn: "Função (Fn)",
    empty: "Desativada",
    unknown: "Não identificado",
  }[a.kind];
}

// ---------------------------------------------------------------------------
// Codificação das entradas de 3 bytes do keymap
// ---------------------------------------------------------------------------
const h2 = (n: number) => n.toString(16).padStart(2, "0");
export const rawKey = (usage: number) => `2000${h2(usage)}`;
export const rawMod = (mask: number) => `20${h2(mask)}00`;
export const rawConsumer = (usage: number) => `30${h2(usage & 0xff)}${h2(usage >> 8)}`;
export const RAW_DISABLED = "000000";

export function decodeRaw(raw: string): KeyAction {
  const [t, a, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16));
  if ((t === 0 || t === 0x20) && a === 0 && b === 0) return { kind: "empty" };
  if (t === 0x20 && a === 0) return { kind: "key", usage: b };
  if (t === 0x20 && b === 0) return { kind: "modifier", mask: a };
  if (t === 0x30) return { kind: "consumer", usage: a | (b << 8) };
  if (t === 0xa0 && a === 0x01 && b === 0) return { kind: "fn" };
  return { kind: "unknown" };
}

export interface PickerItem {
  raw: string;
  label: string;
}
export interface PickerGroup {
  name: string;
  items: PickerItem[];
}

const keyItems = (usages: number[]) => usages.map((u) => ({ raw: rawKey(u), label: HID[u] }));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const PICKER: PickerGroup[] = [
  { name: "Letras", items: keyItems(range(0x04, 0x1d)) },
  { name: "Números", items: keyItems(range(0x1e, 0x27)) },
  { name: "Funções", items: keyItems([...range(0x3a, 0x45)]) },
  // "/ ?" (0x87) fica de fora: o MK1 Elite nunca grava usos acima de 0x84 em teclas novas.
  { name: "Símbolos", items: keyItems([0x35, 0x2d, 0x2e, 0x2f, 0x30, 0x32, 0x33, 0x34, 0x36, 0x37, 0x38, 0x64]) },
  {
    name: "Edição e navegação",
    items: keyItems([0x29, 0x2b, 0x39, 0x2a, 0x28, 0x2c, 0x49, 0x4c, 0x4a, 0x4d, 0x4b, 0x4e, 0x52, 0x51, 0x50, 0x4f, 0x46, 0x47, 0x48, 0x65]),
  },
  { name: "Teclado numérico", items: keyItems([0x53, ...range(0x54, 0x63)]) },
  { name: "Modificadores", items: [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80].map((m) => ({ raw: rawMod(m), label: MOD[m] })) },
  {
    name: "Mídia",
    items: [0x00cd, 0x00b5, 0x00b6, 0x00b7, 0x00e9, 0x00ea, 0x00e2, 0x0192, 0x0194, 0x0223, 0x018a].map((u) => ({
      raw: rawConsumer(u),
      label: CONSUMER[u],
    })),
  },
  { name: "Macros", items: range(0, 11).map((i) => ({ raw: rawKey(MACRO_HID_BASE + i), label: `M${i + 1}` })) },
  { name: "Outros", items: [{ raw: RAW_DISABLED, label: "Desativar tecla" }] },
];

// Modos de iluminação (byte 0x01 da configuração). Verificados no teclado: 05, 06 e 14.
export const MODES: { id: number; name: string; verified?: boolean }[] = [
  { id: 0x06, name: "Estático", verified: true },
  { id: 0x05, name: "Respiração", verified: true },
  { id: 0x14, name: "Personalizado (cor por tecla)", verified: true },
  { id: 0x01, name: "Onda curta" },
  { id: 0x02, name: "Onda longa" },
  { id: 0x03, name: "Roda de cores" },
  { id: 0x04, name: "Ciclo de espectro" },
  { id: 0x07, name: "Reativo" },
  { id: 0x08, name: "Ondulação" },
  { id: 0x09, name: "Linha reativa" },
  { id: 0x0a, name: "Estrelas rápidas" },
  { id: 0x0b, name: "Florescer" },
  { id: 0x0c, name: "Arco-íris vertical" },
  { id: 0x0d, name: "Furacão" },
  { id: 0x0e, name: "Acumular" },
  { id: 0x0f, name: "Estrelas lentas" },
  { id: 0x10, name: "Visor" },
  { id: 0x11, name: "Surmount" },
  { id: 0x12, name: "Arco-íris circular" },
];
export const modeName = (id: number) => MODES.find((m) => m.id === id)?.name ?? `Modo 0x${id.toString(16)}`;

// ---------------------------------------------------------------------------
// Teclas virtuais do Windows (macros e teste de teclas)
// ---------------------------------------------------------------------------
export const CODE_TO_VK: Record<string, number> = {
  Backspace: 0x08, Tab: 0x09, Enter: 0x0d, Pause: 0x13, CapsLock: 0x14, Escape: 0x1b, Space: 0x20,
  PageUp: 0x21, PageDown: 0x22, End: 0x23, Home: 0x24, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27,
  ArrowDown: 0x28, PrintScreen: 0x2c, Insert: 0x2d, Delete: 0x2e, MetaLeft: 0x5b, MetaRight: 0x5c,
  ContextMenu: 0x5d, NumpadMultiply: 0x6a, NumpadAdd: 0x6b, NumpadSubtract: 0x6d, NumpadDecimal: 0x6e,
  NumpadDivide: 0x6f, NumLock: 0x90, ScrollLock: 0x91, ShiftLeft: 0xa0, ShiftRight: 0xa1,
  ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5, Semicolon: 0xba, Equal: 0xbb,
  Comma: 0xbc, Minus: 0xbd, Period: 0xbe, Slash: 0xbf, Backquote: 0xc0, IntlRo: 0xc1, BracketLeft: 0xdb,
  Backslash: 0xdc, BracketRight: 0xdd, Quote: 0xde, IntlBackslash: 0xe2, NumpadEnter: 0x0d,
};
for (let i = 0; i < 26; i++) CODE_TO_VK[`Key${String.fromCharCode(65 + i)}`] = 0x41 + i;
for (let i = 0; i < 10; i++) CODE_TO_VK[`Digit${i}`] = 0x30 + i;
for (let i = 0; i < 10; i++) CODE_TO_VK[`Numpad${i}`] = 0x60 + i;
for (let i = 1; i <= 24; i++) CODE_TO_VK[`F${i}`] = 0x6f + i;

export const VK_NAME: Record<number, string> = {
  0x08: "Backspace", 0x09: "Tab", 0x0d: "Enter", 0x10: "Shift", 0x11: "Ctrl", 0x12: "Alt", 0x13: "Pause",
  0x14: "Caps Lock", 0x1b: "Esc", 0x20: "Espaço", 0x21: "PgUp", 0x22: "PgDn", 0x23: "End", 0x24: "Home",
  0x25: "←", 0x26: "↑", 0x27: "→", 0x28: "↓", 0x2c: "PrtSc", 0x2d: "Ins", 0x2e: "Del", 0x5b: "Win",
  0x5c: "Win Dir.", 0x5d: "Menu", 0x6a: "Num *", 0x6b: "Num +", 0x6d: "Num -", 0x6e: "Num .", 0x6f: "Num /",
  0x90: "Num Lock", 0x91: "ScrLk", 0xa0: "Shift", 0xa1: "Shift Dir.", 0xa2: "Ctrl", 0xa3: "Ctrl Dir.",
  0xa4: "Alt", 0xa5: "AltGr", 0xba: "Ç", 0xbb: "=", 0xbc: ",", 0xbd: "-", 0xbe: ".", 0xbf: ";",
  0xc0: "'", 0xc1: "/", 0xdb: "´", 0xdc: "]", 0xdd: "[", 0xde: "~", 0xe2: "\\",
  0xad: "Mudo", 0xae: "Volume −", 0xaf: "Volume +", 0xb0: "Próxima", 0xb1: "Anterior", 0xb2: "Parar", 0xb3: "Play/Pausa",
};
for (let i = 0; i < 26; i++) VK_NAME[0x41 + i] = String.fromCharCode(65 + i);
for (let i = 0; i < 10; i++) VK_NAME[0x30 + i] = String(i);
for (let i = 0; i < 10; i++) VK_NAME[0x60 + i] = `Num ${i}`;
for (let i = 1; i <= 24; i++) VK_NAME[0x6f + i] = `F${i}`;

export const vkName = (vk: number) => VK_NAME[vk] ?? `VK 0x${vk.toString(16).padStart(2, "0")}`;

/** Converte um uso HID (função atribuída) na tecla virtual que o Windows gera, para destacar no teste. */
export function hidToVk(a: KeyAction): number | null {
  if (a.kind === "modifier") {
    return { 0x01: 0x11, 0x02: 0x10, 0x04: 0x12, 0x08: 0x5b, 0x10: 0x11, 0x20: 0x10, 0x40: 0x12, 0x80: 0x5c }[a.mask] ?? null;
  }
  if (a.kind !== "key") return null;
  const u = a.usage;
  if (u >= 0x04 && u <= 0x1d) return 0x41 + (u - 0x04);
  if (u >= 0x1e && u <= 0x26) return 0x31 + (u - 0x1e);
  if (u === 0x27) return 0x30;
  if (u >= 0x3a && u <= 0x45) return 0x70 + (u - 0x3a);
  if (u >= 0x68 && u <= 0x73) return 0x7c + (u - 0x68);
  const t: Record<number, number> = {
    0x28: 0x0d, 0x29: 0x1b, 0x2a: 0x08, 0x2b: 0x09, 0x2c: 0x20, 0x2d: 0xbd, 0x2e: 0xbb, 0x2f: 0xdb, 0x30: 0xdd,
    0x32: 0xdc, 0x33: 0xba, 0x34: 0xde, 0x35: 0xc0, 0x36: 0xbc, 0x37: 0xbe, 0x38: 0xbf, 0x39: 0x14, 0x46: 0x2c,
    0x47: 0x91, 0x48: 0x13, 0x49: 0x2d, 0x4a: 0x24, 0x4b: 0x21, 0x4c: 0x2e, 0x4d: 0x23, 0x4e: 0x22, 0x4f: 0x27,
    0x50: 0x25, 0x51: 0x28, 0x52: 0x26, 0x64: 0xe2, 0x65: 0x5d, 0x87: 0xc1,
  };
  return t[u] ?? null;
}
