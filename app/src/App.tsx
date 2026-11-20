import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";
import { api, type DeviceState, type Lighting, type Settings, type Status, type WriteResult } from "./api";
import { KeysPage } from "./pages/KeysPage";
import { LightingPage } from "./pages/LightingPage";
import { MacrosPage } from "./pages/MacrosPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useUpdater } from "./updater";
import {
  BrandMark,
  IconAlert,
  IconCheck,
  IconDownload,
  IconKeys,
  IconLight,
  IconMacro,
  IconProfiles,
  IconSettings,
} from "./icons";

type Page = "teclas" | "iluminacao" | "macros" | "perfis" | "ajustes";
const PAGES: [Page, string, (p: { size?: number }) => ReactNode][] = [
  ["teclas", "Teclas", IconKeys],
  ["iluminacao", "Iluminação", IconLight],
  ["macros", "Macros", IconMacro],
  ["perfis", "Perfis", IconProfiles],
  ["ajustes", "Ajustes", IconSettings],
];

const DEFAULT_LIGHTING: Lighting = { mode: 6, brightness: 4, speed: 2, direction: 0, multicolor: true, rgb: [255, 255, 255], winLock: false };

interface Toast {
  id: number;
  msg: string;
  error?: boolean;
}

export type OnWrite = (label: string, fn: () => Promise<unknown>) => Promise<boolean>;

/** Avisos globais: aparecem logo abaixo do cabeçalho de cada página. */
const BannerSlot = createContext<ReactNode>(null);

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  const banners = useContext(BannerSlot);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="grow" />
        <div className="page-actions">{children}</div>
      </header>
      {banners}
    </>
  );
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
  const [version, setVersion] = useState("");
  const toastId = useRef(0);
  const updater = useUpdater();

  const notify = useCallback((msg: string, error?: boolean) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, msg, error }]);
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
  const onWrite: OnWrite = useCallback(
    async (label, fn) => {
      setBusy(true);
      try {
        const r = (await fn()) as WriteResult | undefined;
        if (r && typeof r === "object" && "state" in r) setDevice(r.state);
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
    api.factoryKeymapHex().then(setFactoryHex).catch(() => {});
    getVersion().then((v) => setVersion(v ?? "")).catch(() => {});
    loadSettings();
    const tick = () => api.getStatus().then(setStatus).catch(() => {});
    tick();
    const id = setInterval(tick, 2000);
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

  // Ao reconectar, tenta ler de novo mesmo se a última leitura falhou.
  const wasConnected = useRef(false);
  useEffect(() => {
    const now = !!status?.connected;
    if (now && !wasConnected.current) setReadError(null);
    wasConnected.current = now;
  }, [status?.connected]);

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
  const fx = status?.effect;

  const banners = (
    <>
      {(settings?.repairRecommended || (status?.officialAppRunning ?? false) || (readError && !status?.officialAppRunning) || fx?.state === "seguranca") && (
        <div className="banners">
          {settings?.repairRecommended && (
            <div className="banner error">
              <IconAlert size={18} />
              <span className="grow">
                A versão 1.0.0 gravou cor numa área do firmware que deve ficar vazia; isso faz letras abrirem atalhos do Windows.
                Repare e depois desconecte e reconecte o cabo.
              </span>
              <button
                className="btn danger small"
                disabled={busy || !connected || !device}
                onClick={() => onWrite("Teclado reparado. Desconecte e reconecte o Warrior.", () => api.restoreFactory())}
              >
                Reparar agora
              </button>
            </div>
          )}
          {status?.officialAppRunning && (
            <div className="banner warn">
              <IconAlert size={18} />
              <span className="grow">O MK1 Elite está aberto. Feche-o (inclusive na bandeja) para o TC312 Hub falar com o teclado.</span>
            </div>
          )}
          {readError && !status?.officialAppRunning && (
            <div className="banner error">
              <IconAlert size={18} />
              <span className="grow">{readError}</span>
              <button className="btn small" onClick={() => { setReadError(null); doRead(); }}>Tentar de novo</button>
            </div>
          )}
          {fx?.state === "seguranca" && (
            <div className="banner error">
              <IconAlert size={18} />
              <span className="grow">{fx.message}</span>
              <button className="btn small" onClick={() => setPage("teclas")}>Testar teclas</button>
            </div>
          )}
        </div>
      )}
    </>
  );

  const devState = !status
    ? { dot: "", text: "Procurando…" }
    : status.officialAppRunning
      ? { dot: "warn", text: "MK1 Elite em uso" }
      : status.connected
        ? { dot: "ok", text: busy ? "Conversando…" : "Conectado" }
        : { dot: "err", text: "Desconectado" };

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <BrandMark />
          <div className="brand-name">TC312<span>Hub</span></div>
        </div>
        <nav className="nav" aria-label="Seções">
          {PAGES.map(([id, name, Icon]) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)} aria-current={page === id ? "page" : undefined}>
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          {settings?.activeProfile && <div className="rail-profile">Perfil <b>{settings.activeProfile}</b></div>}
          {updater.phase === "available" && (
            <button className="update-chip" onClick={() => setPage("ajustes")}>
              <IconDownload size={18} />
              <span>
                Atualização {updater.version}
                <small>Toque para instalar</small>
              </span>
            </button>
          )}
          <div className="device-card">
            <div className="dev-name">Warrior TC312</div>
            <div className="dev-sub">Royal Cross · ABNT2</div>
            <div className="dev-state"><span className={`dot ${devState.dot}`} />{devState.text}</div>
            {fx && fx.state !== "parado" && fx.state !== "seguranca" && (
              <div className="dev-state">
                <span className={`dot ${fx.state === "rodando" ? "live" : "warn"}`} />
                {fx.state === "rodando" ? (
                  <span>Efeito do app <span className="faint num">· {Math.round(fx.fps)} q/s</span></span>
                ) : (
                  <span>{fx.message ?? "Efeito do app em espera"}</span>
                )}
              </div>
            )}
          </div>
          <div className="version num">TC312 Hub {version}</div>
        </div>
      </aside>

      <main className="main">
        <BannerSlot.Provider value={banners}>
          {page === "teclas" && (
            <KeysPage
              device={device}
              factoryHex={factoryHex}
              macros={settings?.macros ?? []}
              lighting={lighting}
              customColorsHex={settings?.customColorsHex ?? null}
              effect={settings?.effect ?? null}
              connected={connected}
              busy={busy}
              onWrite={onWrite}
              onReread={doRead}
            />
          )}
          {page === "iluminacao" && (
            <LightingPage
              initial={lighting}
              initialColorsHex={settings?.customColorsHex ?? null}
              appEffect={settings?.effect ?? null}
              effectStatus={fx ?? null}
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
              current={
                device
                  ? {
                      keymapHex: device.keymapHex,
                      lighting,
                      customColorsHex: settings?.customColorsHex ?? null,
                      macros: settings?.macros ?? [],
                      effect: settings?.effect ?? null,
                    }
                  : null
              }
              activeProfile={settings?.activeProfile ?? null}
              connected={connected && !!device}
              busy={busy}
              onWrite={onWrite}
              notify={notify}
            />
          )}
          {page === "ajustes" && (
            <SettingsPage device={device} connected={connected && !!device} busy={busy} onWrite={onWrite} updater={updater} version={version} />
          )}
        </BannerSlot.Provider>
      </main>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? " error" : ""}`}>
            {t.error ? <IconAlert size={16} /> : <IconCheck size={16} />}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
