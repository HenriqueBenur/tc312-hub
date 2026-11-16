import { useEffect, useState } from "react";
import { api, type BackupInfo, type DeviceState } from "../api";
import { Modal } from "../components";

function prettyStamp(name: string) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(name);
  if (!m) return name;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return d.toLocaleString("pt-BR");
}

export function SettingsPage({
  device,
  connected,
  busy,
  onWrite,
}: {
  device: DeviceState | null;
  connected: boolean;
  busy: boolean;
  onWrite: (label: string, fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [factory, setFactory] = useState(false);
  const [restore, setRestore] = useState<BackupInfo | null>(null);
  const refresh = () => api.listBackups().then(setBackups).catch(() => {});
  useEffect(() => {
    refresh();
  }, [device]);

  return (
    <section className="content">
      <div className="section-head"><h2>Ajustes</h2></div>

      <div className="panel">
        <h3>Reparar teclado (padrão de fábrica)</h3>
        <p className="muted">
          Regrava o mapa de teclas de fábrica no formato do software oficial, <b>limpa a tabela de cores</b> (inclusive a área que a
          versão 1.0.0 corrompia) e volta a iluminação para estático branco, brilho máximo, tecla Win liberada. Use se as teclas
          começarem a abrir atalhos do Windows sozinhas.
        </p>
        <button className="danger" disabled={!connected || busy} onClick={() => setFactory(true)}>Reparar teclado</button>
      </div>

      <div className="panel">
        <h3>Backups automáticos</h3>
        <p className="muted">Antes de cada gravação o app guarda o estado do teclado. Os 40 mais recentes ficam salvos.</p>
        {backups.length === 0 ? (
          <p className="muted">Nenhum backup ainda.</p>
        ) : (
          <ul className="profile-list">
            {backups.slice(0, 12).map((b) => (
              <li key={b.name}>
                <span>{prettyStamp(b.name)}</span>
                <span className="muted small">{b.reason}</span>
                <div className="spacer" />
                <button className="ghost" disabled={!connected || busy} onClick={() => setRestore(b)}>Restaurar teclas</button>
              </li>
            ))}
          </ul>
        )}
        <div className="row-actions mt">
          <button className="ghost" onClick={() => api.openDataFolder()}>Abrir pasta de dados</button>
        </div>
      </div>

      <div className="panel">
        <h3>Sobre</h3>
        <dl className="facts">
          <dt>Aplicativo</dt><dd>TC312 Hub 1.0.1</dd>
          <dt>Teclado</dt><dd>Warrior TC312 Royal Cross (placa EVision 320F:5078)</dd>
          <dt>Informação do aparelho</dt><dd className="mono small">{device?.info ?? "—"}</dd>
          <dt>Observação</dt>
          <dd>O teclado não informa o mapa de teclas ativo; o app mostra o último mapa que ele mesmo aplicou.</dd>
        </dl>
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
          <p>Teclas, cores e iluminação voltam ao original. Um backup do estado atual é salvo antes. Macros e perfis não são apagados.</p>
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
          <p>{prettyStamp(restore.name)} · {restore.reason}</p>
        </Modal>
      )}
    </section>
  );
}
