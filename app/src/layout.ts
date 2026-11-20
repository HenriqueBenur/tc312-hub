// Layout físico do Warrior TC312 (TKL ABNT2) em unidades de tecla (1u).
// `m` = índice na matriz do firmware (coluna * 8 + linha), verificado no keymap de fábrica.
// A tabela fica em layout.json para o motor de efeitos em Rust usar a mesma fonte.
import data from "./layout.json";

export interface PhysKey {
  m: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export const LAYOUT: PhysKey[] = data as PhysKey[];
export const LAYOUT_WIDTH = 18.25;
export const LAYOUT_HEIGHT = 6.25;
