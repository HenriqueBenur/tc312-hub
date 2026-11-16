// Layout físico do Warrior TC312 (TKL ABNT2) em unidades de tecla (1u).
// `m` = índice na matriz do firmware (coluna * 8 + linha), verificado no keymap de fábrica.

export interface PhysKey {
  m: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
}

const row = (y: number, keys: [number, number, string, number?][]): PhysKey[] =>
  keys.map(([m, x, label, w]) => ({ m, x, y, label, w }));

const letters = (y: number, x0: number, idx0: number, chars: string): PhysKey[] =>
  [...chars].map((c, i) => ({ m: idx0 + i * 8, x: x0 + i, y, label: c }));

export const LAYOUT: PhysKey[] = [
  // Linha de funções
  ...row(0, [
    [0, 0, "Esc"], [8, 2, "F1"], [16, 3, "F2"], [24, 4, "F3"], [32, 5, "F4"],
    [40, 6.5, "F5"], [48, 7.5, "F6"], [56, 8.5, "F7"], [64, 9.5, "F8"],
    [72, 11, "F9"], [80, 12, "F10"], [88, 13, "F11"], [96, 14, "F12"],
    [104, 15.25, "PrtSc"], [112, 16.25, "ScrLk"], [120, 17.25, "Pause"],
  ]),
  // Números
  { m: 1, x: 0, y: 1.25, label: "'" },
  ...letters(1.25, 1, 9, "1234567890"),
  ...row(1.25, [[89, 11, "-"], [97, 12, "="], [105, 13, "Backspace", 2], [113, 15.25, "Ins"], [121, 16.25, "Home"], [115, 17.25, "PgUp"]]),
  // QWERTY
  { m: 2, x: 0, y: 2.25, w: 1.5, label: "Tab" },
  ...letters(2.25, 1.5, 10, "QWERTYUIOP"),
  ...row(2.25, [[90, 11.5, "´"], [98, 12.5, "["], [114, 15.25, "Del"], [122, 16.25, "End"], [123, 17.25, "PgDn"]]),
  { m: 107, x: 13.75, y: 2.25, w: 1.25, h: 2, label: "Enter" },
  // ASDF
  { m: 3, x: 0, y: 3.25, w: 1.75, label: "Caps Lock" },
  ...letters(3.25, 1.75, 11, "ASDFGHJKL"),
  ...row(3.25, [[83, 10.75, "Ç"], [91, 11.75, "~"], [99, 12.75, "]"]]),
  // ZXCV
  { m: 4, x: 0, y: 4.25, w: 1.25, label: "Shift" },
  { m: 12, x: 1.25, y: 4.25, label: "\\" },
  ...letters(4.25, 2.25, 20, "ZXCVBNM"),
  ...row(4.25, [[76, 9.25, ","], [84, 10.25, "."], [92, 11.25, ";"], [100, 12.25, "/"], [108, 13.25, "Shift", 1.75], [116, 16.25, "↑"]]),
  // Linha de baixo
  ...row(5.25, [
    [5, 0, "Ctrl", 1.25], [13, 1.25, "Win", 1.25], [21, 2.5, "Alt", 1.25], [45, 3.75, "Espaço", 6.25],
    [77, 10, "AltGr", 1.25], [85, 11.25, "Fn", 1.25], [93, 12.5, "Menu?", 1.25], [101, 13.75, "Ctrl", 1.25],
    [109, 15.25, "←"], [117, 16.25, "↓"], [125, 17.25, "→"],
  ]),
];

export const LAYOUT_WIDTH = 18.25;
export const LAYOUT_HEIGHT = 6.25;
