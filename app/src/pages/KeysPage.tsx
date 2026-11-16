import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type DeviceState, type HidEvent, type Macro, type WarriorKey } from "../api";

type LogItem = { t: "key"; k: WarriorKey } | { t: "hid"; h: HidEvent };
import { Keyboard, Modal, Toggle } from "../components";
import { actionKindLabel, actionLabel, CONSUMER, decodeRaw, hidToVk, PICKER, vkName } from "../keys";
import { LAYOUT } from "../layout";

const FN_SLOT = 85;
const slotRaw = (hex: string, m: number) => hex.slice(m * 6, m * 6 + 6);
const setSlot = (hex: string, m: number, raw: string) => hex.slice(0, m * 6) + raw + hex.slice(m * 6 + 6);

export function KeysPage({
  device,
  factoryHex,
  macros,
  busy,
  onWrite,
}: {
  device: DeviceState | null;
  factoryHex: string;
  macros: Macro[];
  busy: boolean;
  onWrite: (label: string, fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const applied = device?.keymapHex ?? "";
  const [draft, setDraft] = useState(applied);
  const [selected, setSelected] = useState<number>(3);
  const [group, setGroup] = useState(PICKER[0].name);
  const [confirm, setConfirm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [log, setLog] = useState<LogItem[]>([]);
  const [anomalies, setAnomalies] = useState(0);
  const [litVks, setLitVks] = useState<Set<number>>(new Set());

  useEffect(() => setDraft(applied), [applied]);

  useEffect(() => {
    api.setKeyTest(testing);
    if (!testing) {
      setLitVks(new Set());
      return;
    }
    const un = listen<WarriorKey>("warrior-key", (e) => {
      const k = e.payload;
      if (k.vk === 0xff || k.vk === 0) setAnomalies((n) => n + 1);
      setLog((l) => [{ t: "key", k } as LogItem, ...l].slice(0, 18));
      setLitVks((s) => {
        const n = new Set(s);
        if (k.down) n.add(k.vk);
        else n.delete(k.vk);
        return n;
      });
    });
    const unHid = listen<HidEvent>("warrior-hid", (e) => {
      const h = e.payload;
      if (h.data === "030204") return; // sinal periódico do firmware, ignorado
      // teclas de mídia legítimas (Fn + F1…F12) e o "soltar" não contam como defeito
      const usage = h.data.length >= 6 && h.data.startsWith("03") ? parseInt(h.data.slice(4, 6) + h.data.slice(2, 4), 16) : -1;
      const legit = usage === 0 || (usage > 0 && usage in CONSUMER);
      if (!legit) setAnomalies((n) => n + 1);
      setLog((l) => [{ t: "hid", h } as LogItem, ...l].slice(0, 18));
    });
    return () => {
      un.then((f) => f());
      unHid.then((f) => f());
      api.setKeyTest(false);
    };
  }, [testing]);

  const changes = useMemo(
    () => (draft && applied ? LAYOUT.filter((k) => slotRaw(draft, k.m) !== slotRaw(applied, k.m)) : []),
    [draft, applied],
  );
  const customCount = useMemo(
    () => (applied && factoryHex ? LAYOUT.filter((k) => slotRaw(applied, k.m) !== slotRaw(factoryHex, k.m)).length : 0),
    [applied, factoryHex],
  );

  const macroName = (label: string) => {
    const m = /^M(\d+)$/.exec(label);
    if (!m) return label;
    const mac = macros.find((x) => x.slot === Number(m[1]) - 1);
    return mac?.name ? `${label} · ${mac.name}` : label;
  };

  const phys = LAYOUT.find((k) => k.m === selected);
  const curRaw = draft ? slotRaw(draft, selected) : "";
  const curAction = curRaw ? decodeRaw(curRaw) : null;
  const isFn = selected === FN_SLOT;

  if (!device) {
    return (
      <section className="content">
        <div className="section-head"><h2>Teclas</h2></div>
        <div className="panel"><p className="muted">Conecte o Warrior e clique em “Ler teclado”.</p></div>
      </section>
    );
  }

  return (
    <section className="content">
      <div className="section-head">
        <h2>Teclas</h2>
        <span className="muted">
          {customCount === 0 ? "Todas no padrão de fábrica" : `${customCount} tecla(s) personalizada(s)`}
        </span>
        <div className="spacer" />
        <Toggle on={testing} onChange={setTesting} label="Testar teclas" />
      </div>

      <div className="keyboard-wrap">
        <Keyboard
          visual={(k) => {
            const raw = slotRaw(draft, k.m);
            const a = decodeRaw(raw);
            const vk = hidToVk(a);
            return {
              label: a.kind === "unknown" ? k.label : actionLabel(a),
              changed: raw !== slotRaw(factoryHex, k.m),
              pending: raw !== slotRaw(applied, k.m),
              lit: testing && vk !== null && litVks.has(vk),
              disabled: k.m === FN_SLOT,
            };
          }}
          selected={selected}
          onKey={(k) => setSelected(k.m)}
        />
      </div>

      {changes.length > 0 && (
        <div className="pending-bar">
          <span>{changes.length} alteração(ões) não aplicada(s)</span>
          <div className="spacer" />
          <button className="ghost" onClick={() => setDraft(applied)} disabled={busy}>Descartar</button>
          <button className="primary" onClick={() => setConfirm(true)} disabled={busy}>Aplicar no teclado</button>
        </div>
      )}

      <div className="two-col">
        <div className="panel">
          <h3>{phys?.label ?? `Posição ${selected}`}</h3>
          {curAction && (
            <dl className="facts">
              <dt>Função</dt><dd>{macroName(actionLabel(curAction))}</dd>
              <dt>Tipo</dt><dd>{actionKindLabel(curAction)}</dd>
              <dt>Padrão de fábrica</dt><dd>{actionLabel(decodeRaw(slotRaw(factoryHex, selected)))}</dd>
              <dt>Código</dt><dd className="mono small">{curRaw} · matriz #{selected}</dd>
            </dl>
          )}
          {isFn ? (
            <div className="hint">A tecla Fn é protegida: remapeá-la desligaria as combinações Fn (ex.: Fn+Win).</div>
          ) : (
            <div className="row-actions">
              <button
                className="ghost"
                disabled={curRaw === slotRaw(factoryHex, selected)}
                onClick={() => setDraft(setSlot(draft, selected, slotRaw(factoryHex, selected)))}
              >
                Voltar ao padrão desta tecla
              </button>
            </div>
          )}
        </div>

        <div className={`panel picker${isFn ? " disabled" : ""}`}>
          <h3>Atribuir função</h3>
          <div className="tabs">
            {PICKER.map((g) => (
              <button key={g.name} className={group === g.name ? "active" : ""} onClick={() => setGroup(g.name)}>
                {g.name}
              </button>
            ))}
          </div>
          <div className="chips">
            {PICKER.find((g) => g.name === group)!.items.map((it) => (
              <button
                key={it.raw}
                className={`chip${curRaw === it.raw ? " active" : ""}`}
                disabled={isFn}
                onClick={() => setDraft(setSlot(draft, selected, it.raw))}
              >
                {group === "Macros" ? macroName(it.label) : it.label}
              </button>
            ))}
          </div>
          {group === "Macros" && <div className="hint">As macros são editadas na página Macros e rodam com o TC312 Hub aberto (pode ficar na bandeja).</div>}
        </div>
      </div>

      {testing && (
        <div className="panel">
          <h3>O que o Warrior está enviando</h3>
          {log.length === 0 ? (
            <p className="muted">Aperte teclas no Warrior. O teclado Logitech é ignorado.</p>
          ) : (
            <div className="keylog">
              {log.map((it, i) =>
                it.t === "key" ? (
                  <span key={i} className={`keylog-item ${it.k.down ? "down" : "up"}${it.k.vk === 0xff || it.k.vk === 0 ? " bad" : ""}`}>
                    {it.k.down ? "▼" : "▲"} {vkName(it.k.vk)}
                  </span>
                ) : (
                  <span key={i} className="keylog-item bad">⚠ {it.h.kind} {it.h.data}</span>
                ),
              )}
            </div>
          )}
          {anomalies > 0 && (
            <div className="hint">
              ⚠ O Warrior enviou {anomalies} evento(s) estranho(s) (mídia, sistema, mouse ou tecla sem código). Isso indica o
              defeito do firmware: use <b>Ajustes → Reparar teclado</b>.
            </div>
          )}
        </div>
      )}

      {confirm && (
        <Modal
          title="Gravar teclas no Warrior?"
          confirmLabel="Gravar"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            await onWrite("Teclas gravadas no teclado", () => api.writeKeymap(draft));
          }}
        >
          <p>Um backup do estado atual é salvo antes. Mudanças:</p>
          <ul className="change-list">
            {changes.map((k) => (
              <li key={k.m}>
                <b>{k.label}</b>: {actionLabel(decodeRaw(slotRaw(applied, k.m)))} → {macroName(actionLabel(decodeRaw(slotRaw(draft, k.m))))}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  );
}
