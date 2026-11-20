import { useEffect, useMemo, useState } from "react";
import { api, type EffectStatus, type Lighting } from "../api";
import { PageHead, type OnWrite } from "../App";
import { ColorSwatch, KeyboardStage, Segmented, Slider, type LedFn } from "../components";
import {
  CUSTOM_ID,
  EFFECTS,
  effectById,
  effectForMode,
  fromHex,
  hsv,
  PRESETS,
  staticGradient,
  toHex,
  type EffectKind,
  type Engine,
  type PaletteKind,
  type RGB,
  type SoftEffect,
} from "../effects";
import { IconDown, IconLeft, IconRight, IconStop, IconUp } from "../icons";
import { colorsFromHex, currentLed, firmwareLed, softLed, staticLed } from "../preview";

interface Draft {
  effectId: string;
  palette: PaletteKind;
  colors: [RGB, RGB, RGB];
  speed: number;
  direction: number;
  brightness: number;
}

const UI_KEY = "tc312.lighting.ui";
const DEFAULT_COLORS: [RGB, RGB, RGB] = [[255, 90, 0], [0, 200, 255], [255, 0, 120]];
const SWATCHES = ["#ff0000", "#ff7a00", "#ffe600", "#00e05a", "#00c8ff", "#1f4bff", "#ff1aa8", "#ffffff"];
const PALETTES: PaletteKind[] = ["rainbow", 1, 2, 3];
const paletteLabel = (p: PaletteKind) => (p === "rainbow" ? "Arco-íris" : p === 1 ? "1 cor" : `${p} cores`);
const KIND_TO_ID: Record<EffectKind, string> = { wave: "wave", breathing: "breathing", cycle: "cycle", starlight: "starlight", ripple: "ripple" };

/** Assinatura do que está aplicado (para saber se há mudança pendente). */
function signature(l: Lighting, colorsHex: string | null, effect: SoftEffect | null) {
  if (effect) return JSON.stringify({ effect });
  // No estático (0x06) o "multicolor" de fábrica não muda o que a tela oferece: não conta como diferença.
  const multi = l.mode === 0x06 ? false : l.multicolor;
  return JSON.stringify({ l: [l.mode, l.brightness, l.speed, l.direction, multi, l.rgb], c: l.mode === 0x14 ? colorsHex : null });
}

function draftFrom(l: Lighting, effect: SoftEffect | null): Draft {
  if (effect) {
    const colors = [...DEFAULT_COLORS] as [RGB, RGB, RGB];
    effect.colors.forEach((c, i) => (colors[i] = c));
    return {
      effectId: KIND_TO_ID[effect.kind],
      palette: effect.rainbow ? "rainbow" : (effect.colors.length as 1 | 2 | 3),
      colors,
      speed: effect.speed,
      direction: effect.direction,
      brightness: effect.brightness,
    };
  }
  const colors = [...DEFAULT_COLORS] as [RGB, RGB, RGB];
  colors[0] = [...l.rgb] as RGB;
  return {
    effectId: effectForMode(l.mode),
    palette: l.multicolor && l.mode !== 0x06 ? "rainbow" : 1,
    colors,
    speed: l.speed,
    direction: l.direction,
    brightness: l.brightness,
  };
}

function loadUi(sig: string): Draft | null {
  try {
    const v = JSON.parse(localStorage.getItem(UI_KEY) ?? "null");
    return v && v.sig === sig ? (v.draft as Draft) : null;
  } catch {
    return null;
  }
}
function saveUi(sig: string, draft: Draft) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ sig, draft }));
  } catch {
    /* armazenamento indisponível: só perde a lembrança da tela */
  }
}

/** Faixa de amostra de cada efeito na lista. */
function stripStyle(kind: string, rainbow: boolean, colors: RGB[]): React.CSSProperties {
  const cs = rainbow ? [0, 60, 120, 180, 240, 300].map((h) => toHex(hsv(h, 1, 1))) : colors.map(toHex);
  const grad = cs.length > 1 ? cs.join(", ") : `${cs[0]}, ${cs[0]}`;
  switch (kind) {
    case "wave":
      return { background: `repeating-linear-gradient(90deg, ${grad}, ${cs[0]} 44px)` };
    case "breathing":
      return { background: `radial-gradient(circle at 50% 50%, ${cs[0]} 0%, transparent 85%)` };
    case "starlight":
      return { background: `radial-gradient(circle at 20% 40%, ${cs[0]} 0 2px, transparent 3px), radial-gradient(circle at 60% 70%, ${cs[cs.length > 1 ? 1 : 0]} 0 2px, transparent 3px), radial-gradient(circle at 85% 30%, ${cs[cs.length - 1]} 0 2px, transparent 3px), #0b1216` };
    case "ripple":
      return { background: `repeating-radial-gradient(circle at 50% 50%, ${grad}, ${cs[0]} 16px)` };
    case "cycle":
      return { background: `linear-gradient(90deg, ${grad})`, filter: "saturate(0.9)" };
    case "custom":
      return { background: "linear-gradient(90deg, #ff3b3b 0 25%, #20d4ff 25% 50%, #ffd400 50% 75%, #3dff8a 75%)" };
    default:
      return { background: cs.length > 1 ? `linear-gradient(90deg, ${grad})` : cs[0] };
  }
}

function tagFor(engine: Engine) {
  if (engine.at === "firmware" || engine.at === "keys") return <span className="tag hw">teclado</span>;
  if (engine.at === "app") return <span className="tag app">app</span>;
  return <span className="tag no">—</span>;
}

export function LightingPage({
  initial,
  initialColorsHex,
  appEffect,
  effectStatus,
  connected,
  busy,
  onWrite,
}: {
  initial: Lighting;
  initialColorsHex: string | null;
  appEffect: SoftEffect | null;
  effectStatus: EffectStatus | null;
  connected: boolean;
  busy: boolean;
  onWrite: OnWrite;
}) {
  const appliedSig = signature(initial, initialColorsHex, appEffect);
  const [d, setD] = useState<Draft>(() => loadUi(appliedSig) ?? draftFrom(initial, appEffect));
  const [paint, setPaint] = useState<RGB[]>(() =>
    initialColorsHex ? colorsFromHex(initialColorsHex) : Array.from({ length: 128 }, () => [255, 90, 0] as RGB),
  );
  const [brush, setBrush] = useState("#ff7a00");

  // Quando o estado aplicado muda por fora (perfil, reparo, outra tela), a tela acompanha.
  useEffect(() => {
    setD(loadUi(appliedSig) ?? draftFrom(initial, appEffect));
    if (initialColorsHex) setPaint(colorsFromHex(initialColorsHex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSig]);

  const isCustom = d.effectId === CUSTOM_ID;
  const def = effectById(d.effectId);
  const engine: Engine = isCustom ? { at: "keys" } : def ? def.engine(d.palette) : { at: "none", why: "" };
  const n = d.palette === "rainbow" ? 0 : d.palette;
  const activeColors = d.colors.slice(0, Math.max(1, n)) as RGB[];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  // Se o efeito escolhido não aceita a paleta atual, cai na primeira que ele aceita.
  useEffect(() => {
    if (isCustom || !def) return;
    if (def.engine(d.palette).at === "none") {
      const ok = PALETTES.find((p) => def.engine(p).at !== "none");
      if (ok !== undefined) set("palette", ok);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.effectId]);

  /** O que "Aplicar" vai fazer. */
  const plan = useMemo(() => {
    const base: Lighting = { ...initial, brightness: d.brightness, speed: d.speed, direction: d.direction };
    if (engine.at === "firmware") {
      const l: Lighting = { ...base, mode: engine.mode, multicolor: d.palette === "rainbow", rgb: [...d.colors[0]] as RGB, direction: def?.direction === "firmware" || def?.direction === "wave" ? d.direction : 0 };
      return { kind: "write" as const, lighting: l, colorsHex: null as string | null, sig: signature(l, initialColorsHex, null) };
    }
    if (engine.at === "keys") {
      const colors = isCustom ? paint : staticGradient(d.palette === "rainbow", activeColors);
      const hex = Array.from({ length: 170 }, (_, i) => (i < 128 ? toHex(colors[i] ?? [0, 0, 0]).slice(1) : "000000")).join("");
      const l: Lighting = { ...base, mode: 0x14, multicolor: false, rgb: [...d.colors[0]] as RGB, speed: initial.speed, direction: 0 };
      return { kind: "write" as const, lighting: l, colorsHex: hex, sig: signature(l, hex, null) };
    }
    if (engine.at === "app") {
      const effect: SoftEffect = {
        kind: engine.kind,
        rainbow: d.palette === "rainbow",
        colors: d.palette === "rainbow" ? [] : activeColors,
        speed: d.speed,
        direction: def?.direction === "wave" ? d.direction : 0,
        brightness: d.brightness,
      };
      return { kind: "app" as const, effect, sig: signature(initial, initialColorsHex, effect) };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, paint, engine.at, initial, initialColorsHex]);

  const dirty = !!plan && plan.sig !== appliedSig;

  const led: LedFn | null = useMemo(() => {
    if (!plan) return currentLed(initial, initialColorsHex, appEffect);
    if (plan.kind === "app") return softLed(plan.effect);
    if (engine.at === "keys") return staticLed(colorsFromHex(plan.colorsHex), d.brightness);
    return firmwareLed(d.effectId, d.palette === "rainbow", d.colors[0], d.speed, d.brightness);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, engine.at, d.effectId]);

  const apply = async () => {
    if (!plan) return;
    let ok = false;
    if (plan.kind === "write") {
      ok = await onWrite("Iluminação gravada no teclado", () => api.writeLighting(plan.lighting, plan.colorsHex));
    } else {
      ok = await onWrite("Efeito do app ligado", () => api.startEffect(plan.effect));
    }
    if (ok) saveUi(plan.sig, d);
  };

  const appRunning = !!appEffect;
  const whereNow = appEffect
    ? `Efeito do app: ${effectById(KIND_TO_ID[appEffect.kind])?.name ?? appEffect.kind}`
    : `No teclado: ${effectById(effectForMode(initial.mode))?.name ?? "Personalizado"}`;
  const directionUi = !isCustom && def?.direction;

  return (
    <>
      <PageHead title="Iluminação" sub={whereNow}>
        {appRunning && (
          <button className="btn quiet" disabled={busy} onClick={() => onWrite("Efeito do app desligado", () => api.stopEffect())}>
            <IconStop size={16} /> Desligar efeito do app
          </button>
        )}
        {dirty && (
          <button className="btn" disabled={busy} onClick={() => setD(loadUi(appliedSig) ?? draftFrom(initial, appEffect))}>
            Descartar
          </button>
        )}
        <button className="btn primary" disabled={!connected || busy || !dirty || !plan} onClick={apply}>
          {plan?.kind === "app" ? "Ligar efeito do app" : "Aplicar no teclado"}
        </button>
      </PageHead>

      <div className="page">
        <KeyboardStage
          visual={(k) => ({ label: k.label })}
          led={led}
          live={!isCustom}
          glow={isCustom ? 1 : 0.85}
          paint={isCustom ? (k) => setPaint((c) => c.map((x, i) => (i === k.m ? fromHex(brush) : x))) : undefined}
        />

        <div className="dock three">
          <section className="panel">
            <div className="panel-head"><h2>Efeito</h2></div>
            <div className="panel-body flush">
              <div className="fx-list" role="listbox" aria-label="Efeitos">
                {EFFECTS.filter((e) => !e.id.startsWith("fw-")).map((e) => (
                  <button key={e.id} role="option" aria-selected={d.effectId === e.id} className={`fx${d.effectId === e.id ? " on" : ""}`} onClick={() => set("effectId", e.id)}>
                    <span className="fx-strip" style={stripStyle(e.preview, d.palette === "rainbow" || e.engine(d.palette).at === "none", activeColors)} />
                    <span className="fx-name">{e.name}</span>
                    {tagFor(e.engine(d.palette))}
                  </button>
                ))}
                <button className={`fx${isCustom ? " on" : ""}`} role="option" aria-selected={isCustom} onClick={() => set("effectId", CUSTOM_ID)}>
                  <span className="fx-strip" style={stripStyle("custom", false, activeColors)} />
                  <span className="fx-name">Pintar teclas</span>
                  <span className="tag hw">teclado</span>
                </button>
                <div className="fx-group">Outros efeitos do firmware</div>
                {EFFECTS.filter((e) => e.id.startsWith("fw-")).map((e) => (
                  <button key={e.id} role="option" aria-selected={d.effectId === e.id} className={`fx${d.effectId === e.id ? " on" : ""}`} onClick={() => set("effectId", e.id)}>
                    <span className="fx-strip" style={stripStyle(e.preview, true, activeColors)} />
                    <span className="fx-name">{e.name}</span>
                    {tagFor(e.engine(d.palette))}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{isCustom ? "Pincel" : "Cores e ajustes"}</h2>
            </div>
            <div className="panel-body">
              {isCustom ? (
                <div className="stack">
                  <div className="field-row">
                    <ColorSwatch value={brush} onChange={setBrush} label="Cor do pincel" />
                    {SWATCHES.map((s) => (
                      <button key={s} className={`swatch-mini${brush === s ? " on" : ""}`} style={{ background: s }} onClick={() => setBrush(s)} aria-label={`Cor ${s}`} />
                    ))}
                  </div>
                  <div className="field-row">
                    <button className="btn small" onClick={() => setPaint(Array.from({ length: 128 }, () => fromHex(brush)))}>Pintar todas</button>
                    <span className="faint small">ou degradê com</span>
                    {d.colors.map((c, i) => (
                      <ColorSwatch key={i} value={toHex(c)} onChange={(h) => set("colors", d.colors.map((x, j) => (j === i ? fromHex(h) : x)) as Draft["colors"])} label={`Cor ${i + 1} do degradê`} />
                    ))}
                    <button className="btn small" onClick={() => setPaint(staticGradient(false, d.colors))}>Aplicar degradê</button>
                  </div>
                  <Slider label="Brilho" value={d.brightness} min={0} max={4} onChange={(v) => set("brightness", v)} display={d.brightness === 0 ? "apagado" : `${d.brightness}/4`} />
                  <p className="note" style={{ marginTop: 0 }}>Clique ou arraste sobre as teclas para pintar.</p>
                </div>
              ) : (
                <div className="stack">
                  <Segmented
                    label="Paleta"
                    value={d.palette}
                    onChange={(p) => set("palette", p)}
                    options={PALETTES.map((p) => {
                      const e = def?.engine(p);
                      return { value: p, label: paletteLabel(p), disabled: !e || e.at === "none", title: e && e.at === "none" ? e.why : undefined };
                    })}
                  />
                  {d.palette !== "rainbow" && (
                    <div className="field-row">
                      {activeColors.map((c, i) => (
                        <ColorSwatch key={i} value={toHex(c)} onChange={(h) => set("colors", d.colors.map((x, j) => (j === i ? fromHex(h) : x)) as Draft["colors"])} label={`Cor ${i + 1}`} />
                      ))}
                      {n >= 2 && (
                        <div className="presets">
                          {PRESETS.map((p) => (
                            <button
                              key={p.name}
                              className="preset"
                              title={`Paleta ${p.name}`}
                              aria-label={`Paleta ${p.name}`}
                              onClick={() => set("colors", [...p.colors] as Draft["colors"])}
                              style={{ background: `linear-gradient(90deg, ${p.colors.slice(0, n).map(toHex).join(", ")})` }}
                            />
                          ))}
                        </div>
                      )}
                      {n === 1 && SWATCHES.map((s) => (
                        <button key={s} className="swatch-mini" style={{ background: s }} onClick={() => set("colors", [fromHex(s), d.colors[1], d.colors[2]])} aria-label={`Cor ${s}`} />
                      ))}
                    </div>
                  )}
                  <Slider label="Brilho" value={d.brightness} min={0} max={4} onChange={(v) => set("brightness", v)} display={d.brightness === 0 ? "apagado" : `${d.brightness}/4`} />
                  <Slider
                    label="Velocidade"
                    value={5 - d.speed}
                    min={0}
                    max={5}
                    onChange={(v) => set("speed", 5 - v)}
                    display={def?.speed ? `${6 - d.speed}/6` : "—"}
                    disabled={!def?.speed}
                  />
                  {directionUi === "wave" && (
                    <div className="field-row">
                      <span className="slider-label" style={{ width: 84 }}>Direção</span>
                      <Segmented
                        label="Direção"
                        value={d.direction}
                        onChange={(v) => set("direction", v)}
                        options={[
                          { value: 0, label: <IconRight size={15} />, title: "Para a direita" },
                          { value: 1, label: <IconLeft size={15} />, title: "Para a esquerda" },
                          { value: 2, label: <IconDown size={15} />, title: "Para baixo" },
                          { value: 3, label: <IconUp size={15} />, title: "Para cima" },
                        ]}
                      />
                      {engine.at === "firmware" && <span className="faint small">no firmware, o sentido de cada valor ainda não foi confirmado</span>}
                    </div>
                  )}
                  {directionUi === "firmware" && (
                    <div className="field-row">
                      <span className="slider-label" style={{ width: 84 }}>Variação</span>
                      <Segmented label="Variação" value={d.direction} onChange={(v) => set("direction", v)} options={[0, 1, 2, 3].map((v) => ({ value: v, label: String(v + 1) }))} />
                      <span className="faint small">byte de direção do firmware (efeito a confirmar)</span>
                    </div>
                  )}
                </div>
              )}
              {def && !isCustom && <p className="note">{def.hint}</p>}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Onde roda</h2></div>
            <div className="panel-body">
              <div className="stack">
                {engine.at === "firmware" && (
                  <div className="where hw">
                    <h3>No teclado</h3>
                    <p>Fica gravado no Warrior e funciona sem o app aberto.</p>
                  </div>
                )}
                {engine.at === "keys" && (
                  <div className="where hw">
                    <h3>No teclado (cor por tecla)</h3>
                    <p>{isCustom ? "As cores ficam gravadas no Warrior." : "O degradê é gravado tecla por tecla no Warrior e funciona sem o app."}</p>
                  </div>
                )}
                {engine.at === "app" && (
                  <div className="where app">
                    <h3>Pelo app</h3>
                    <p>
                      O firmware não tem esta combinação: o app desenha a animação (~18 quadros/s). Precisa do TC312 Hub aberto ou na
                      bandeja; ao sair, o teclado volta ao efeito gravado nele.
                    </p>
                  </div>
                )}
                {engine.at === "none" && (
                  <div className="where no">
                    <h3>Indisponível</h3>
                    <p>{engine.why}</p>
                  </div>
                )}
                {!isCustom && engine.at === "firmware" && !def?.verified && (
                  <p className="note" style={{ marginTop: 0 }}>
                    <span className="pill">prévia aproximada</span> Modo tirado da documentação do OpenRGB para placas EVision, ainda não visto
                    neste teclado: cor, velocidade e direção podem não ser respeitadas.
                  </p>
                )}
                {dirty && <p className="note" style={{ marginTop: 0 }}><span className="pill accent">não aplicado</span> A tela mostra a prévia; aplique para mandar ao teclado.</p>}
                {appEffect && effectStatus && (
                  <div className="dev-state" style={{ marginTop: 0 }}>
                    <span className={`dot ${effectStatus.state === "rodando" ? "live" : effectStatus.state === "parado" ? "" : "warn"}`} />
                    {effectStatus.state === "rodando"
                      ? <span>Efeito do app rodando <span className="faint num">· {Math.round(effectStatus.fps)} quadros/s</span></span>
                      : <span>{effectStatus.message ?? "Efeito do app em espera"}</span>}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
