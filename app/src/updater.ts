// Atualização pelo GitHub Releases (tauri-plugin-updater).
// O app consulta latest.json do release mais recente, baixa o instalador assinado,
// confere a assinatura (minisign) e o instalador roda em modo "passive": só uma barra de
// progresso, sem as telas do assistente. No fim o próprio instalador reabre o TC312 Hub.
import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { api } from "./api";

export type UpdatePhase = "idle" | "checking" | "current" | "available" | "downloading" | "installing" | "error";

export interface UpdaterState {
  phase: UpdatePhase;
  version?: string;
  notes?: string;
  date?: string;
  /** 0..1 durante o download (undefined se o servidor não informou o tamanho) */
  progress?: number;
  received?: number;
  total?: number;
  error?: string;
  lastChecked?: Date;
}

const SIX_HOURS = 6 * 60 * 60 * 1000;

export function useUpdater() {
  const [st, setSt] = useState<UpdaterState>({ phase: "idle" });
  const update = useRef<Update | null>(null);

  const doCheck = useCallback(async (quiet = false) => {
    setSt((s) => (s.phase === "downloading" || s.phase === "installing" ? s : { ...s, phase: "checking", error: undefined }));
    try {
      const u = await check({ timeout: 20000 });
      update.current = u;
      if (u) {
        setSt({ phase: "available", version: u.version, notes: u.body ?? undefined, date: u.date ?? undefined, lastChecked: new Date() });
      } else {
        setSt({ phase: "current", lastChecked: new Date() });
      }
    } catch (e) {
      // sem internet na checagem automática: não incomoda
      setSt((s) => ({ ...s, phase: quiet ? "idle" : "error", error: String(e), lastChecked: new Date() }));
    }
  }, []);

  const install = useCallback(async () => {
    const u = update.current;
    if (!u) return;
    let total = 0;
    let received = 0;
    try {
      await api.prepareUpdate().catch(() => {});
      setSt((s) => ({ ...s, phase: "downloading", progress: 0, received: 0 }));
      await u.downloadAndInstall((ev) => {
        if (ev.event === "Started") {
          total = ev.data.contentLength ?? 0;
          setSt((s) => ({ ...s, total, progress: total ? 0 : undefined }));
        } else if (ev.event === "Progress") {
          received += ev.data.chunkLength;
          setSt((s) => ({ ...s, received, progress: total ? Math.min(1, received / total) : undefined }));
        } else if (ev.event === "Finished") {
          setSt((s) => ({ ...s, phase: "installing", progress: 1 }));
        }
      });
      // No Windows o instalador fecha o app sozinho e o reabre no fim; aqui é só para os outros sistemas.
      await relaunch();
    } catch (e) {
      setSt((s) => ({ ...s, phase: "error", error: String(e) }));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => doCheck(true), 4000);
    const every = setInterval(() => doCheck(true), SIX_HOURS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [doCheck]);

  return { ...st, check: () => doCheck(false), install };
}

export type Updater = ReturnType<typeof useUpdater>;

export const formatBytes = (n?: number) =>
  n === undefined ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
