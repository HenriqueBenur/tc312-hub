import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { api, type DeviceState, type Lighting, type Settings, type Status, type WriteResult } from "./api";
import { KeysPage } from "./pages/KeysPage";
import { LightingPage } from "./pages/LightingPage";
import { MacrosPage } from "./pages/MacrosPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { modeName } from "./keys";

type Page = "teclas" | "iluminacao" | "macros" | "perfis" | "ajustes";
const PAGES: [Page, string][] = [
  ["teclas", "Teclas"],
  ["iluminacao", "Iluminação"],
  ["macros", "Macros"],
  ["perfis", "Perfis"],
  ["ajustes", "Ajustes"],
];

const DEFAULT_LIGHTING: Lighting = { mode: 6, brightness: 4, speed: 2, direction: 0, multicolor: true, rgb: [255, 255, 255], winLock: false };

interface Toast {
  id: number;
  msg: string;
  error?: boolean;
}

export default function App() {
  const [page, setPage] = useState<Page>("teclas");
  const [status, setStatus] = useState<Status | null>(null);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [factoryHex, setFactoryHex] = useState("");
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((msg: string, error?: boolean) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 7000 : 3500);
  }, []);

  const loadSettings = useCallback(() => api.getSettings().then(setSettings).catch(() => {}), []);

  const doRead = useCallback(async () => {
    setBusy(true);
    try {
      setDevice(await api.readDevice());
      setReadError(null);
    } catch (e) {
      setReadError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  /** Executa uma gravação, mostra o resultado e atualiza o estado. */
  const onWrite = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        const r = (await fn()) as WriteResult | undefined;
        if (r && "state" in r) setDevice(r.state);
        await loadSettings();
        notify(label);
        return true;
      } catch (e) {
        notify(String(e), true);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [loadSettings, notify],
  );

  useEffect(() => {
    api.factoryKeymapHex().then(setFactoryHex);
    loadSettings();
    const tick = () => api.getStatus().then(setStatus).catch(() => {});
    tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, [loadSettings]);

  // Lê automaticamente quando o teclado aparece; esquece o estado quando ele some.
  useEffect(() => {
    if (!status) return;
    if (!status.connected) {
      setDevice(null);
      return;
    }
    if (!status.officialAppRunning && !device && !busy && !readError) doRead();
  }, [status, device, busy, readError, doRead]);

  const lighting: Lighting = useMemo(() => {
    const base = settings?.lighting ?? (device?.config ? { ...device.config } : DEFAULT_LIGHTING);
    return {
      mode: base.mode,
      brightness: base.brightness,
      speed: base.speed,
      direction: base.direction,
      multicolor: base.multicolor,
      rgb: [...base.rgb] as [number, number, number],
      winLock: device?.config?.winLock ?? base.winLock,
    };
  }, [settings, device]);

  const connected = !!status?.connected && !status.officialAppRunning;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">TC312<span>HUB</span></div>
        <nav>
          {PAGES.map(([id, name]) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>{name}</button>
          ))}
        </nav>
        {settings?.activeProfile && <div className="sidebar-profile">Perfil: <b>{settings.activeProfile}</b></div>}
        <div className="sidebar-foot">v1.0.1</div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <div className="device-name">Warrior TC312 <span className="muted">Royal Cross · ABNT2</span></div>
            <div className="device-sub">
              {!status ? (
                <span className="pill">verificando…</span>
              ) : status.connected ? (
                <span className="pill ok">Conectado</span>
              ) : (
                <span className="pill warn">Desconectado</span>
              )}
              {device && (
                <span className="muted">
                  {modeName(lighting.mode)} · brilho {lighting.brightness}/4 · Win {lighting.winLock ? "bloqueada" : "liberada"}
                </span>
              )}
            </div>
          </div>
          <button className="ghost" onClick={doRead} disabled={busy || !connected}>
            {busy ? "Aguarde…" : "Reler teclado"}
          </button>
        </header>

        {settings?.repairRecommended && (
          <div className="banner error">
            A versão 1.0.0 gravou dados de cor numa área do firmware que deve ficar vazia. Isso faz letras abrirem atalhos do Windows.
            Conecte o Warrior e clique em reparar; depois desconecte e reconecte o cabo.
            <button
              className="danger"
              disabled={busy || !connected || !device}
              onClick={() => onWrite("Teclado reparado. Desconecte e reconecte o Warrior.", () => api.restoreFactory())}
            >
              Reparar teclado agora
            </button>
          </div>
        )}
        {status?.officialAppRunning && (
          <div className="banner warn">O MK1 Elite está aberto. Feche-o (inclusive na bandeja) para o TC312 Hub falar com o teclado.</div>
        )}
        {readError && !status?.officialAppRunning && (
          <div className="banner error">
            {readError} <button className="link" onClick={() => { setReadError(null); doRead(); }}>Tentar de novo</button>
          </div>
        )}

        {page === "teclas" && (
          <KeysPage device={device} factoryHex={factoryHex} macros={settings?.macros ?? []} busy={busy || !connected} onWrite={onWrite} />
        )}
        {page === "iluminacao" && (
          <LightingPage
            initial={lighting}
            initialColorsHex={settings?.customColorsHex ?? null}
            connected={connected && !!device}
            busy={busy}
            onWrite={onWrite}
          />
        )}
        {page === "macros" && (
          <MacrosPage
            macros={settings?.macros ?? []}
            onSaved={(m) => setSettings((s) => (s ? { ...s, macros: m } : s))}
            notify={notify}
          />
        )}
        {page === "perfis" && (
          <ProfilesPage
            current={device ? { keymapHex: device.keymapHex, lighting, customColorsHex: settings?.customColorsHex ?? null, macros: settings?.macros ?? [] } : null}
            activeProfile={settings?.activeProfile ?? null}
            connected={connected && !!device}
            busy={busy}
            onWrite={onWrite}
            notify={notify}
          />
        )}
        {page === "ajustes" && <SettingsPage device={device} connected={connected && !!device} busy={busy} onWrite={onWrite} />}
      </main>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? " error" : ""}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
