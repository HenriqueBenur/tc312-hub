import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type DeviceState, type HidEvent, type Lighting, type Macro, type WarriorKey } from "../api";
import { PageHead, type OnWrite } from "../App";
import { KeyboardStage, Modal, Toggle } from "../components";
import type { SoftEffect } from "../effects";
import { IconAlert, IconDown, IconRefresh, IconUp } from "../icons";
import { actionKindLabel, actionLabel, CONSUMER, decodeRaw, hidToVk, PICKER, vkName } from "../keys";
import { LAYOUT } from "../layout";
import { currentLed } from "../preview";

type LogItem = { t: "key"; k: WarriorKey } | { t: "hid"; h: HidEvent };

const FN_SLOT = 85;
const slotRaw = (hex: string, m: number) => hex.slice(m * 6, m * 6 + 6);
const setSlot = (hex: string, m: number, raw: string) => hex.slice(0, m * 6) + raw + hex.slice(m * 6 + 6);

export function KeysPage({
  device,
  factoryHex,
  macros,
  lighting,
  customColorsHex,
  effect,
  connected,
  busy,
  onWrite,
  onReread,
}: {
  device: DeviceState | null;
  factoryHex: string;
  macros: Macro[];
  lighting: Lighting;
  customColorsHex: string | null;
  effect: SoftEffect | null;
  connected: boolean;
  busy: boolean;
  onWrite: OnWrite;
  onReread: () => void;
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
    api.setKeyTest(testing).catch(() => {});
    if (!testing) {
      setLitVks(new Set());
      return;
    }
    const un = listen<WarriorKey>("warrior-key", (e) => {
      const k = e.payload;
      if (k.vk === 0xff || k.vk === 0) setAnomalies((n) => n + 1);
      setLog((l) => [{ t: "key", k } as LogItem, ...l].slice(0, 24));
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
      setLog((l) => [{ t: "hid", h } as LogItem, ...l].slice(0, 24));
    });
    return () => {
      un.then((f) => f());
      unHid.then((f) => f());
      api.setKeyTest(false).catch(() => {});
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
  const led = useMemo(() => currentLed(lighting, customColorsHex, effect), [lighting, customColorsHex, effect]);

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
  const winLock = lighting.winLock;

  const sub = !device
    ? "Conecte o Warrior para ler o mapa de teclas"
    : customCount === 0
      ? "Todas no padrão de fábrica"
      : `${customCount} tecla${customCount > 1 ? "s" : ""} personalizada${customCount > 1 ? "s" : ""}`;

  return (
    <>
      <PageHead title="Teclas" sub={sub}>
        <Toggle on={testing} onChange={setTesting} label="Testar teclas" />
        <Toggle
          on={winLock}
          disabled={!connected || !device || busy}
          onChange={(v) => onWrite(v ? "Tecla Win bloqueada" : "Tecla Win liberada", () => api.setWinLock(v))}
          label="Bloquear Win"
        />
        <button className="icon-btn" title="Ler o teclado de novo" aria-label="Ler o teclado de novo" disabled={busy || !connected} onClick={onReread}>
          <IconRefresh size={16} />
        </button>
      </PageHead>

      <div className="page">
        <KeyboardStage
          visual={(k) => {
            if (!draft) return { label: k.label, icon: k.icon, disabled: k.m === FN_SLOT };
            const raw = slotRaw(draft, k.m);
            const a = decodeRaw(raw);
            const vk = hidToVk(a);
            return {
              label: a.kind === "unknown" ? k.label : actionLabel(a),
              icon: a.kind === "light" || (a.kind === "unknown" && k.icon) ? "bulb" : undefined,
              changed: !!factoryHex && raw !== slotRaw(factoryHex, k.m),
              pending: raw !== slotRaw(applied, k.m),
              lit: testing && vk !== null && litVks.has(vk),
              disabled: k.m === FN_SLOT,
            };
          }}
          selected={device ? selected : null}
          onKey={(k) => setSelected(k.m)}
          led={led}
          glow={0.4}
          footer={
            <>
              <div className="stage-legend">
                <span><i style={{ background: "var(--custom)" }} />personalizada</span>
                <span><i style={{ background: "var(--accent)", width: 6, height: 6, borderRadius: 6 }} />não aplicada</span>
              </div>
              {changes.length > 0 && (
                <div className="pending-bar">
                  <span className="num">{changes.length} alteração{changes.length > 1 ? "ões" : ""} não aplicada{changes.length > 1 ? "s" : ""}</span>
                  <button className="btn quiet" onClick={() => setDraft(applied)} disabled={busy}>Descartar</button>
                  <button className="btn primary" onClick={() => setConfirm(true)} disabled={busy || !connected}>Aplicar no teclado</button>
                </div>
              )}
            </>
          }
        />

        <div className="dock two">
          {testing ? (
            <section className="panel">
              <div className="panel-head">
                <h2>O que o Warrior está enviando</h2>
                <div className="grow" />
                {log.length > 0 && <button className="btn quiet small" onClick={() => { setLog([]); setAnomalies(0); }}>Limpar</button>}
              </div>
              <div className="panel-body">
                {log.length === 0 ? (
                  <div className="empty"><b>Aperte teclas no Warrior</b>O teclado Logitech é ignorado.</div>
                ) : (
                  <div className="keylog">
                    {log.map((it, i) =>
                      it.t === "key" ? (
                        <span key={i} className={`${it.k.down ? "down" : "up"}${it.k.vk === 0xff || it.k.vk === 0 ? " bad" : ""}`}>
                          {it.k.down ? <IconDown size={12} /> : <IconUp size={12} />} {vkName(it.k.vk)}
                        </span>
                      ) : (
                        <span key={i} className="bad"><IconAlert size={12} /> {it.h.kind} {it.h.data}</span>
                      ),
                    )}
                  </div>
                )}
                {anomalies > 0 && (
                  <p className="note">
                    O Warrior enviou {anomalies} evento{anomalies > 1 ? "s" : ""} estranho{anomalies > 1 ? "s" : ""} (sistema, mouse ou tecla sem código).
                    Isso indica o defeito do firmware: use <b>Ajustes → Reparar teclado</b>.
                  </p>
                )}
              </div>
            </section>
          ) : (
            <section className="panel">
              <div className="panel-head"><h2>{device ? phys?.label ?? `Posição ${selected}` : "Tecla"}</h2></div>
              <div className="panel-body">
                {!device ? (
                  <div className="empty"><b>Teclado não lido</b>Conecte o Warrior; o app lê sozinho.</div>
                ) : (
                  <>
                    {curAction && (
                      <dl className="facts">
                        <dt>Função</dt><dd>{macroName(actionLabel(curAction))}</dd>
                        <dt>Tipo</dt><dd>{actionKindLabel(curAction)}</dd>
                        <dt>Padrão de fábrica</dt><dd>{actionLabel(decodeRaw(slotRaw(factoryHex, selected)))}</dd>
                        <dt>Código</dt><dd className="mono faint">{curRaw} · matriz #{selected}</dd>
                      </dl>
                    )}
                    {isFn ? (
                      <p className="note">A tecla Fn é protegida: remapeá-la desligaria as combinações Fn (ex.: Fn+Win).</p>
                    ) : (
                      <div className="field-row" style={{ marginTop: 14 }}>
                        <button
                          className="btn small"
                          disabled={curRaw === slotRaw(factoryHex, selected)}
                          onClick={() => setDraft(setSlot(draft, selected, slotRaw(factoryHex, selected)))}
                        >
                          Voltar ao padrão desta tecla
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          <section className="panel" aria-disabled={isFn || !device}>
            <div className="panel-head"><h2>Atribuir função</h2></div>
            <div className="panel-body flush">
              <div className="tabs" role="tablist">
                {PICKER.map((g) => (
                  <button key={g.name} role="tab" aria-selected={group === g.name} className={group === g.name ? "on" : ""} onClick={() => setGroup(g.name)}>
                    {g.name}
                  </button>
                ))}
              </div>
              <div className="chips">
                {PICKER.find((g) => g.name === group)!.items.map((it) => (
                  <button
                    key={it.raw}
                    className={`chip${curRaw === it.raw ? " on" : ""}`}
                    disabled={isFn || !device}
                    onClick={() => setDraft(setSlot(draft, selected, it.raw))}
                  >
                    {group === "Macros" ? macroName(it.label) : it.label}
                  </button>
                ))}
              </div>
              {group === "Macros" && <p className="note">As macros são editadas na página Macros e rodam com o TC312 Hub aberto (pode ficar na bandeja).</p>}
            </div>
          </section>
        </div>
      </div>

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
          <ul>
            {changes.map((k) => (
              <li key={k.m}>
                <b>{k.label}</b>: {actionLabel(decodeRaw(slotRaw(applied, k.m)))} → {macroName(actionLabel(decodeRaw(slotRaw(draft, k.m))))}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
