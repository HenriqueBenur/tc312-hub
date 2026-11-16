import { useEffect, useMemo, useState } from "react";
import { api, type Lighting } from "../api";
import { hexToRgb, Keyboard, rgbToHex, Toggle } from "../components";
import { MODES } from "../keys";
import { LAYOUT } from "../layout";

// A tabela tem 170 entradas, mas só as 128 primeiras são cores (LED = posição na matriz).
// Da 128 em diante é outra estrutura do firmware: sempre zeros, como o MK1 Elite faz.
const COLORS_LEN = 170;
const LED_SLOTS = 128;
const blankColors = (hex = "#19b6ff") => Array.from({ length: LED_SLOTS }, () => hex);

function colorsFromHex(h: string | null): string[] {
  if (!h || h.length < LED_SLOTS * 6) return blankColors();
  return Array.from({ length: LED_SLOTS }, (_, i) => "#" + h.slice(i * 6, i * 6 + 6));
}
const colorsToHex = (c: string[]) =>
  Array.from({ length: COLORS_LEN }, (_, i) => (i < LED_SLOTS ? (c[i] ?? "#000000").replace("#", "") : "000000")).join("");

const SWATCHES = ["#ff0000", "#ff7200", "#fff005", "#00d70f", "#0099ff", "#3153ff", "#5e01d2", "#ff16a9", "#ffffff", "#000000"];

export function LightingPage({
  initial,
  initialColorsHex,
  connected,
  busy,
  onWrite,
}: {
  initial: Lighting;
  initialColorsHex: string | null;
  connected: boolean;
  busy: boolean;
  onWrite: (label: string, fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [l, setL] = useState<Lighting>(initial);
  const [colors, setColors] = useState<string[]>(() => colorsFromHex(initialColorsHex));
  const [brush, setBrush] = useState("#19b6ff");
  useEffect(() => setL(initial), [initial]);
  useEffect(() => setColors(colorsFromHex(initialColorsHex)), [initialColorsHex]);

  const isCustom = l.mode === 0x14;
  const dirty = useMemo(
    () => JSON.stringify(l) !== JSON.stringify(initial) || (isCustom && colorsToHex(colors) !== (initialColorsHex ?? "")),
    [l, initial, colors, initialColorsHex, isCustom],
  );
  const set = <K extends keyof Lighting>(k: K, v: Lighting[K]) => setL((x) => ({ ...x, [k]: v }));
  const mode = MODES.find((m) => m.id === l.mode);

  return (
    <section className="content">
      <div className="section-head">
        <h2>Iluminação</h2>
        <div className="spacer" />
        <button
          className="primary"
          disabled={!connected || busy || !dirty}
          onClick={() =>
            onWrite("Iluminação gravada no teclado", () => api.writeLighting(l, isCustom ? colorsToHex(colors) : null))
          }
        >
          Aplicar no teclado
        </button>
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Efeito</h3>
          <div className="form">
            <label>Efeito</label>
            <select value={l.mode} onChange={(e) => set("mode", Number(e.target.value))}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.verified ? "" : " (não testado)"}</option>
              ))}
            </select>

            <label>Brilho</label>
            <div className="slider-row">
              <input type="range" min={0} max={4} value={l.brightness} onChange={(e) => set("brightness", Number(e.target.value))} />
              <span>{l.brightness === 0 ? "apagado" : `${l.brightness}/4`}</span>
            </div>

            <label>Velocidade</label>
            <div className="slider-row">
              <input type="range" min={0} max={5} value={5 - l.speed} onChange={(e) => set("speed", 5 - Number(e.target.value))} disabled={l.mode === 0x06 || isCustom} />
              <span>{l.mode === 0x06 || isCustom ? "—" : `${6 - l.speed}/6`}</span>
            </div>

            {!isCustom && (
              <>
                <label>Cor</label>
                <div className="color-row">
                  <Toggle on={l.multicolor} onChange={(v) => set("multicolor", v)} label="Multicolor" />
                  {!l.multicolor && (
                    <input type="color" value={rgbToHex(l.rgb)} onChange={(e) => set("rgb", hexToRgb(e.target.value))} />
                  )}
                </div>
              </>
            )}
          </div>
          {mode && !mode.verified && <div className="hint">Este efeito vem da documentação do OpenRGB para placas EVision e ainda não foi visto neste teclado.</div>}
        </div>

        <div className="panel">
          <h3>Tecla Windows</h3>
          <p className="muted">Bloqueia a tecla Win (útil em jogos). É o mesmo que Fn+Win no teclado.</p>
          <div className="win-lock">
            <span className={`pill ${initial.winLock ? "warn" : "ok"}`}>{initial.winLock ? "Bloqueada" : "Liberada"}</span>
            <button
              className="ghost"
              disabled={!connected || busy}
              onClick={() =>
                onWrite(initial.winLock ? "Tecla Win liberada" : "Tecla Win bloqueada", () => api.setWinLock(!initial.winLock))
              }
            >
              {initial.winLock ? "Liberar tecla Win" : "Bloquear tecla Win"}
            </button>
          </div>
        </div>
      </div>

      {isCustom && (
        <div className="panel wide">
          <h3>Cor por tecla</h3>
          <div className="paint-tools">
            <input type="color" value={brush} onChange={(e) => setBrush(e.target.value)} />
            {SWATCHES.map((s) => (
              <button key={s} className={`swatch-btn${brush === s ? " active" : ""}`} style={{ background: s }} onClick={() => setBrush(s)} aria-label={s} />
            ))}
            <div className="spacer" />
            <button className="ghost" onClick={() => setColors(blankColors(brush))}>Pintar todas</button>
          </div>
          <div className="keyboard-wrap">
            <Keyboard
              unit={46}
              visual={(k) => ({ label: k.label, color: colors[k.m] })}
              onKey={(k) => setColors((c) => c.map((x, i) => (i === k.m ? brush : x)))}
            />
          </div>
          <div className="hint">Clique nas teclas para pintar com a cor escolhida e depois em “Aplicar no teclado”.</div>
        </div>
      )}
      {!isCustom && <div className="hint standalone">Escolha “Personalizado” para pintar cada tecla de uma cor. {LAYOUT.length} teclas com LED.</div>}
    </section>
  );
}
