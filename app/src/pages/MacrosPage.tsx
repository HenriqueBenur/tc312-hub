import { useEffect, useState } from "react";
import { api, type Macro, type SlotStatus, type Step } from "../api";
import { PageHead } from "../App";
import { IconClose, IconDown, IconPlay, IconPlus, IconRecord, IconTrash, IconUp } from "../icons";
import { CODE_TO_VK, vkName } from "../keys";

const SLOTS = Array.from({ length: 12 }, (_, i) => i);
const emptyMacro = (slot: number): Macro => ({ slot, name: "", steps: [], repeat: 1 });

function stepLabel(s: Step): string {
  if (s.type === "combo") return s.vks.map(vkName).join(" + ");
  if (s.type === "text") {
    const t = s.text.replace(/\n/g, " ⏎ ");
    return `“${t.length > 60 ? t.slice(0, 60) + "…" : t}”`;
  }
  return `${s.ms} ms`;
}

function ComboRecorder({ onDone, onCancel }: { onDone: (vks: number[]) => void; onCancel: () => void }) {
  const [vks, setVks] = useState<number[]>([]);
  useEffect(() => {
    const MODS = new Set([0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0x5b, 0x5c]);
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const vk = CODE_TO_VK[e.code];
      if (vk === undefined) return;
      if (MODS.has(vk)) {
        setVks((v) => (v.includes(vk) ? v : [...v, vk]));
        return;
      }
      // tecla principal: monta o atalho com os modificadores ativos neste momento
      const mods: number[] = [];
      if (e.ctrlKey) mods.push(0xa2);
      if (e.shiftKey) mods.push(0xa0);
      if (e.altKey) mods.push(0xa4);
      if (e.metaKey) mods.push(0x5b);
      setVks((v) => {
        const keepMods = v.filter((x) => MODS.has(x));
        const allMods = [...new Set([...keepMods, ...mods])];
        return [...allMods, vk];
      });
    };
    const block = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", block, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", block, true);
    };
  }, []);
  return (
    <div className="recorder">
      <IconRecord size={14} />
      <span style={{ flex: 1 }}>{vks.length ? vks.map(vkName).join(" + ") : "Pressione o atalho (ex.: Ctrl + Shift + S)…"}</span>
      <button className="btn quiet small" onClick={() => (vks.length ? setVks([]) : onCancel())}>{vks.length ? "Limpar" : "Cancelar"}</button>
      <button className="btn primary small" disabled={!vks.length} onClick={() => onDone(vks)}>Adicionar</button>
    </div>
  );
}

export function MacrosPage({
  macros,
  onSaved,
  notify,
}: {
  macros: Macro[];
  onSaved: (m: Macro[]) => void;
  notify: (msg: string, error?: boolean) => void;
}) {
  const [list, setList] = useState<Macro[]>(() => SLOTS.map((s) => macros.find((m) => m.slot === s) ?? emptyMacro(s)));
  const [sel, setSel] = useState(0);
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState("");
  const [delay, setDelay] = useState(100);
  const [status, setStatus] = useState<SlotStatus[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => setList(SLOTS.map((s) => macros.find((m) => m.slot === s) ?? emptyMacro(s))), [macros]);
  useEffect(() => {
    api.macroStatus().then(setStatus).catch(() => {});
  }, [macros]);

  const cur = list[sel];
  const update = (m: Partial<Macro>) => setList((l) => l.map((x) => (x.slot === sel ? { ...x, ...m } : x)));
  const addStep = (s: Step) => update({ steps: [...cur.steps, s] });
  const moveStep = (i: number, d: number) => {
    const s = [...cur.steps];
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    update({ steps: s });
  };
  const keep = list.filter((m) => m.steps.length || m.name);
  const dirty = JSON.stringify(keep) !== JSON.stringify(macros);

  const save = async () => {
    try {
      await api.setMacros(keep);
      onSaved(keep);
      notify("Macros salvas");
      return true;
    } catch (e) {
      notify(String(e), true);
      return false;
    }
  };

  const test = async () => {
    if (dirty && !(await save())) return;
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);
    api.testMacro(sel).catch(() => {});
  };

  const st = (slot: number) => status.find((s) => s.slot === slot);

  return (
    <>
      <PageHead title="Macros" sub="M1–M12 · atribua a uma tecla do Warrior na página Teclas">
        {dirty && <button className="btn" onClick={() => setList(SLOTS.map((s) => macros.find((m) => m.slot === s) ?? emptyMacro(s)))}>Descartar</button>}
        <button className="btn primary" disabled={!dirty} onClick={save}>Salvar macros</button>
      </PageHead>

      <div className="page">
        <div className="macro-grid">
          <section className="panel">
            <div className="panel-head"><h2>Macros</h2></div>
            <div className="panel-body flush">
              <div className="slots">
                {list.map((m) => {
                  const s = st(m.slot);
                  return (
                    <button key={m.slot} className={`slot${sel === m.slot ? " on" : ""}`} onClick={() => { setSel(m.slot); setRecording(false); }}>
                      <b>M{m.slot + 1}</b>
                      <span>{m.name || (m.steps.length ? `${m.steps.length} passo${m.steps.length > 1 ? "s" : ""}` : "vazia")}</span>
                      {s && <i className={`dot ${s.registered ? "ok" : "err"}`} title={s.registered ? "Ativa" : `F${13 + m.slot} já está em uso por outro programa`} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <input
                value={cur.name}
                placeholder={`Nome da macro M${sel + 1}`}
                onChange={(e) => update({ name: e.target.value })}
                style={{ flex: 1, fontWeight: 600 }}
                aria-label="Nome da macro"
              />
              <label className="field-row faint small" style={{ gap: 8 }}>
                Repetir
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={cur.repeat}
                  style={{ width: 70 }}
                  onChange={(e) => update({ repeat: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                />
              </label>
            </div>
            <div className="panel-body">
              {cur.steps.length === 0 ? (
                <div className="empty"><b>Nenhum passo ainda</b>Grave um atalho, digite um texto ou adicione uma espera.</div>
              ) : (
                <ol className="steps">
                  {cur.steps.map((s, i) => (
                    <li key={i}>
                      <span className="step-n">{i + 1}</span>
                      <span className={`step-kind ${s.type}`}>{s.type === "combo" ? "Atalho" : s.type === "text" ? "Texto" : "Espera"}</span>
                      <span className="step-label">{stepLabel(s)}</span>
                      <button className="icon-btn" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Subir"><IconUp size={15} /></button>
                      <button className="icon-btn" onClick={() => moveStep(i, 1)} disabled={i === cur.steps.length - 1} aria-label="Descer"><IconDown size={15} /></button>
                      <button className="icon-btn" onClick={() => update({ steps: cur.steps.filter((_, j) => j !== i) })} aria-label="Remover"><IconClose size={15} /></button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div style={{ padding: "0 16px 16px" }} className="stack">
              {recording ? (
                <ComboRecorder onDone={(vks) => { addStep({ type: "combo", vks }); setRecording(false); }} onCancel={() => setRecording(false)} />
              ) : (
                <>
                  <div className="add-row">
                    <textarea rows={1} value={text} placeholder="Texto a digitar (Enter quebra linha)" onChange={(e) => setText(e.target.value)} style={{ minWidth: 0, height: 34 }} aria-label="Texto a digitar" />
                    <button className="btn" disabled={!text} onClick={() => { addStep({ type: "text", text }); setText(""); }}><IconPlus size={15} /> Texto</button>
                  </div>
                  <div className="field-row">
                    <button className="btn" onClick={() => setRecording(true)}><IconRecord size={12} /> Gravar atalho</button>
                    <div className="grow" style={{ flex: 1 }} />
                    <input type="number" min={10} max={10000} step={10} value={delay} style={{ width: 90 }} onChange={(e) => setDelay(Number(e.target.value) || 100)} aria-label="Espera em milissegundos" />
                    <span className="faint small">ms</span>
                    <button className="btn" onClick={() => addStep({ type: "delay", ms: delay })}><IconPlus size={15} /> Espera</button>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Testar</h2></div>
            <div className="panel-body">
              <div className="stack">
                <button className="btn primary" disabled={!cur.steps.length || countdown !== null} onClick={test}>
                  <IconPlay size={15} /> {countdown !== null ? `Executando em ${countdown}…` : "Testar agora"}
                </button>
                {countdown !== null && <p className="note" style={{ marginTop: 0 }}>Clique onde a macro deve digitar.</p>}
                <button className="btn" disabled={!cur.steps.length && !cur.name} onClick={() => update({ name: "", steps: [], repeat: 1 })}>
                  <IconTrash size={15} /> Limpar esta macro
                </button>
                <p className="note">
                  A tecla escolhida no Warrior passa a enviar F{13 + sel} (que o seu Logitech não tem) e o TC312 Hub, aberto ou na bandeja,
                  executa a macro. Funciona também com Shift, Ctrl ou Alt segurados. Apertar a tecla de novo durante a execução interrompe.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
