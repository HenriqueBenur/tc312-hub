import { useEffect, useState } from "react";
import { api, type Macro, type SlotStatus, type Step } from "../api";
import { CODE_TO_VK, vkName } from "../keys";

const SLOTS = Array.from({ length: 12 }, (_, i) => i);
const emptyMacro = (slot: number): Macro => ({ slot, name: "", steps: [], repeat: 1 });

function stepLabel(s: Step): string {
  if (s.type === "combo") return s.vks.map(vkName).join(" + ");
  if (s.type === "text") {
    const t = s.text.replace(/\n/g, " ⏎ ");
    return `“${t.length > 48 ? t.slice(0, 48) + "…" : t}”`;
  }
  return `esperar ${s.ms} ms`;
}

function ComboRecorder({ onDone }: { onDone: (vks: number[]) => void }) {
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
      <span className="rec-dot" /> {vks.length ? vks.map(vkName).join(" + ") : "Pressione o atalho (ex.: Ctrl + Shift + S)…"}
      <div className="spacer" />
      <button className="ghost" onClick={() => setVks([])}>Limpar</button>
      <button className="primary" disabled={!vks.length} onClick={() => onDone(vks)}>Adicionar</button>
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
  const dirty = JSON.stringify(list.filter((m) => m.steps.length || m.name)) !== JSON.stringify(macros);

  const save = async () => {
    const keep = list.filter((m) => m.steps.length || m.name);
    try {
      await api.setMacros(keep);
      onSaved(keep);
      notify("Macros salvas");
    } catch (e) {
      notify(String(e), true);
    }
  };

  const test = async () => {
    if (dirty) await save();
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);
    api.testMacro(sel);
  };

  const st = (slot: number) => status.find((s) => s.slot === slot);

  return (
    <section className="content">
      <div className="section-head">
        <h2>Macros</h2>
        <span className="muted">M1–M12 · atribua a uma tecla do Warrior na página Teclas</span>
        <div className="spacer" />
        <button className="primary" disabled={!dirty} onClick={save}>Salvar macros</button>
      </div>

      <div className="macro-layout">
        <div className="panel slot-list">
          {list.map((m) => (
            <button key={m.slot} className={`slot${sel === m.slot ? " active" : ""}`} onClick={() => setSel(m.slot)}>
              <b>M{m.slot + 1}</b>
              <span>{m.name || (m.steps.length ? `${m.steps.length} passo(s)` : "vazia")}</span>
              {st(m.slot) && <i className={st(m.slot)!.registered ? "ok" : "bad"} title={st(m.slot)!.registered ? "Ativa" : "Não registrada"} />}
            </button>
          ))}
        </div>

        <div className="panel">
          <div className="form">
            <label>Nome</label>
            <input value={cur.name} placeholder={`Macro M${sel + 1}`} onChange={(e) => update({ name: e.target.value })} />
            <label>Repetir</label>
            <input type="number" min={1} max={100} value={cur.repeat} onChange={(e) => update({ repeat: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
          </div>

          <h3 className="mt">Passos</h3>
          {cur.steps.length === 0 && <p className="muted">Nenhum passo ainda.</p>}
          <ol className="steps">
            {cur.steps.map((s, i) => (
              <li key={i}>
                <span className={`step-kind ${s.type}`}>{s.type === "combo" ? "Atalho" : s.type === "text" ? "Texto" : "Espera"}</span>
                <span className="step-label">{stepLabel(s)}</span>
                <button className="icon" onClick={() => moveStep(i, -1)} aria-label="Subir">↑</button>
                <button className="icon" onClick={() => moveStep(i, 1)} aria-label="Descer">↓</button>
                <button className="icon" onClick={() => update({ steps: cur.steps.filter((_, j) => j !== i) })} aria-label="Remover">✕</button>
              </li>
            ))}
          </ol>

          {recording ? (
            <ComboRecorder onDone={(vks) => { addStep({ type: "combo", vks }); setRecording(false); }} />
          ) : (
            <div className="add-steps">
              <button className="ghost" onClick={() => setRecording(true)}>+ Atalho</button>
              <div className="inline">
                <textarea rows={2} value={text} placeholder="Texto a digitar (Enter quebra linha)" onChange={(e) => setText(e.target.value)} />
                <button className="ghost" disabled={!text} onClick={() => { addStep({ type: "text", text }); setText(""); }}>+ Texto</button>
              </div>
              <div className="inline">
                <input type="number" min={10} max={10000} step={10} value={delay} onChange={(e) => setDelay(Number(e.target.value) || 100)} />
                <button className="ghost" onClick={() => addStep({ type: "delay", ms: delay })}>+ Espera (ms)</button>
              </div>
            </div>
          )}

          <div className="row-actions mt">
            <button className="ghost" disabled={!cur.steps.length || countdown !== null} onClick={test}>
              {countdown !== null ? `Executando em ${countdown}… (clique onde quer digitar)` : "Testar agora"}
            </button>
            <button className="ghost" onClick={() => update({ name: "", steps: [], repeat: 1 })}>Limpar macro</button>
          </div>
          <div className="hint">
            Como funciona: a tecla escolhida no Warrior passa a enviar F{13 + sel} (que o seu Logitech não tem) e o TC312 Hub,
            aberto ou na bandeja, executa a macro. Feche pelo menu da bandeja para desligar.
          </div>
        </div>
      </div>
    </section>
  );
}
