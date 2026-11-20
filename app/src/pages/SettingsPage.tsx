import { useEffect, useState } from "react";
import { api, type BackupInfo, type DeviceState } from "../api";
import { PageHead, type OnWrite } from "../App";
import { Modal } from "../components";
import { IconCheck, IconDownload, IconFolder, IconRefresh, IconWrench } from "../icons";
import { formatBytes, type Updater } from "../updater";

function prettyStamp(name: string) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(name);
  if (!m) return name;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function UpdatePanel({ u, version }: { u: Updater; version: string }) {
  const busy = u.phase === "checking" || u.phase === "downloading" || u.phase === "installing";
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Atualizações</h2>
        <div className="grow" />
        <span className="faint small num">versão {version || "—"}</span>
      </div>
      <div className="panel-body">
        {u.phase === "available" && (
          <div className="stack">
            <div className="field-row">
              <span className="pill accent">Nova versão {u.version}</span>
              <span className="faint small">{u.date ? new Date(u.date).toLocaleDateString("pt-BR") : ""}</span>
            </div>
            {u.notes && <div className="notes">{u.notes}</div>}
            <div className="field-row">
              <button className="btn primary" onClick={u.install}><IconDownload size={16} /> Atualizar agora</button>
              <span className="faint small">Baixa do GitHub, confere a assinatura, instala e reabre o app.</span>
            </div>
          </div>
        )}
        {(u.phase === "downloading" || u.phase === "installing") && (
          <div className="stack">
            <div className="field-row">
              <b>{u.phase === "downloading" ? `Baixando ${u.version}` : "Instalando…"}</b>
              <span className="faint small num">
                {u.phase === "downloading" && u.total ? `${formatBytes(u.received)} de ${formatBytes(u.total)}` : ""}
              </span>
            </div>
            <div className={`progress${u.progress === undefined || u.phase === "installing" ? " indeterminate" : ""}`}>
              <i style={{ width: `${Math.round((u.progress ?? 0) * 100)}%` }} />
            </div>
            <p className="note" style={{ marginTop: 0 }}>
              {u.phase === "installing"
                ? "O app vai fechar, o instalador mostra só uma barra de progresso e o TC312 Hub abre de novo sozinho."
                : "Não desligue o computador."}
            </p>
          </div>
        )}
        {(u.phase === "idle" || u.phase === "checking" || u.phase === "current" || u.phase === "error") && (
          <div className="stack">
            <div className="field-row">
              {u.phase === "current" && <><IconCheck size={16} style={{ color: "var(--ok)" }} /><span>Você está na versão mais recente.</span></>}
              {u.phase === "error" && <span style={{ color: "#ff9fb1" }}>Não consegui verificar: {u.error}</span>}
              {u.phase === "idle" && <span className="muted">O app procura atualizações sozinho ao abrir e a cada 6 horas.</span>}
              {u.phase === "checking" && <span className="muted">Procurando…</span>}
            </div>
            <div className="field-row">
              <button className="btn" onClick={u.check} disabled={busy}><IconRefresh size={15} /> Procurar atualização</button>
              {u.lastChecked && <span className="faint small">última verificação {u.lastChecked.toLocaleTimeString("pt-BR", { timeStyle: "short" })}</span>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function SettingsPage({
  device,
  connected,
  busy,
  onWrite,
  updater,
  version,
}: {
  device: DeviceState | null;
  connected: boolean;
  busy: boolean;
  onWrite: OnWrite;
  updater: Updater;
  version: string;
}) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [factory, setFactory] = useState(false);
  const [restore, setRestore] = useState<BackupInfo | null>(null);
  const refresh = () => api.listBackups().then(setBackups).catch(() => {});
  useEffect(() => {
    refresh();
  }, [device]);

  return (
    <>
      <PageHead title="Ajustes" sub="Atualizações, reparo e backups" />

      <div className="page">
        <div className="settings-grid">
          <UpdatePanel u={updater} version={version} />

          <section className="panel">
            <div className="panel-head"><h2>Reparar teclado</h2></div>
            <div className="panel-body">
              <p className="muted">
                Regrava o mapa de teclas de fábrica no formato do software oficial, <b>limpa a tabela de cores</b> (inclusive a área que a
                versão 1.0.0 corrompia) e volta a iluminação para estático branco, brilho máximo, tecla Win liberada. Use se as teclas
                começarem a abrir atalhos do Windows sozinhas.
              </p>
              <button className="btn danger" style={{ marginTop: 8 }} disabled={!connected || busy} onClick={() => setFactory(true)}>
                <IconWrench size={16} /> Reparar teclado
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Backups automáticos</h2>
              <div className="grow" />
              <button className="btn quiet small" onClick={() => api.openDataFolder()}><IconFolder size={15} /> Abrir pasta</button>
            </div>
            <div className="panel-body">
              <p className="faint small" style={{ marginBottom: 10 }}>Antes de cada gravação o app guarda o estado do teclado. Ficam os 40 mais recentes.</p>
              {backups.length === 0 ? (
                <div className="empty"><b>Nenhum backup ainda</b>Aparece aqui depois da primeira gravação.</div>
              ) : (
                <ul className="rows">
                  {backups.map((b) => (
                    <li key={b.name}>
                      <div className="grow">
                        <div className="title num">{prettyStamp(b.name)}</div>
                        <div className="meta">{b.reason}</div>
                      </div>
                      <button className="btn small" disabled={!connected || busy} onClick={() => setRestore(b)}>Restaurar teclas</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Sobre</h2></div>
            <div className="panel-body">
              <dl className="facts">
                <dt>Aplicativo</dt><dd className="num">TC312 Hub {version}</dd>
                <dt>Teclado</dt><dd>Warrior TC312 Royal Cross (placa EVision 320F:5078)</dd>
                <dt>Aparelho</dt><dd className="mono faint">{device?.info ?? "—"}</dd>
                <dt>Mapa ativo</dt><dd>O teclado não informa o mapa de teclas ativo; o app mostra o último que ele mesmo aplicou.</dd>
                <dt>Código</dt><dd>github.com/HenriqueBenur/tc312-hub</dd>
              </dl>
            </div>
          </section>
        </div>
      </div>

      {factory && (
        <Modal
          title="Reparar o teclado?"
          confirmLabel="Reparar"
          danger
          onClose={() => setFactory(false)}
          onConfirm={async () => {
            setFactory(false);
            await onWrite("Teclado reparado. Desconecte e reconecte o Warrior.", () => api.restoreFactory());
            refresh();
          }}
        >
          <p>Teclas, cores e iluminação voltam ao original e o efeito do app é desligado. Um backup do estado atual é salvo antes. Macros e perfis não são apagados.</p>
          <p>Depois, desconecte e reconecte o cabo do Warrior para o firmware recarregar tudo.</p>
        </Modal>
      )}
      {restore && (
        <Modal
          title="Restaurar as teclas deste backup?"
          confirmLabel="Restaurar"
          onClose={() => setRestore(null)}
          onConfirm={async () => {
            const b = restore;
            setRestore(null);
            await onWrite("Teclas restauradas do backup", () => api.restoreBackup(b.name));
            refresh();
          }}
        >
          <p className="num">{prettyStamp(restore.name)} · {restore.reason}</p>
        </Modal>
      )}
    </>
  );
}
