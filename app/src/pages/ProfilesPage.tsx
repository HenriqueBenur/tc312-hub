import { useEffect, useState } from "react";
import { api, type Lighting, type Macro } from "../api";
import { Modal } from "../components";

export function ProfilesPage({
  current,
  activeProfile,
  connected,
  busy,
  onWrite,
  notify,
}: {
  current: { keymapHex: string; lighting: Lighting; customColorsHex: string | null; macros: Macro[] } | null;
  activeProfile: string | null;
  connected: boolean;
  busy: boolean;
  onWrite: (label: string, fn: () => Promise<unknown>) => Promise<boolean>;
  notify: (msg: string, error?: boolean) => void;
}) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);

  const refresh = () => api.listProfiles().then(setProfiles).catch((e) => notify(String(e), true));
  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    if (!current || !name.trim()) return;
    try {
      await api.saveProfile({ name: name.trim(), ...current });
      notify(`Perfil “${name.trim()}” salvo`);
      setName("");
      refresh();
    } catch (e) {
      notify(String(e), true);
    }
  };

  return (
    <section className="content">
      <div className="section-head"><h2>Perfis</h2></div>

      <div className="panel">
        <h3>Salvar a configuração atual</h3>
        <p className="muted">Guarda as teclas, a iluminação, as cores por tecla e as macros que estão aplicadas agora.</p>
        <div className="inline">
          <input value={name} placeholder="Nome do perfil (ex.: Jogos, Edição de vídeo)" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          <button className="primary" disabled={!current || !name.trim()} onClick={save}>Salvar perfil</button>
        </div>
      </div>

      <div className="panel">
        <h3>Perfis salvos</h3>
        {profiles.length === 0 ? (
          <p className="muted">Nenhum perfil ainda.</p>
        ) : (
          <ul className="profile-list">
            {profiles.map((p) => (
              <li key={p}>
                <b>{p}</b>
                {activeProfile === p && <span className="pill ok">ativo</span>}
                <div className="spacer" />
                <button
                  className="primary"
                  disabled={!connected || busy}
                  onClick={async () => {
                    if (await onWrite(`Perfil “${p}” aplicado`, () => api.applyProfile(p))) refresh();
                  }}
                >
                  Aplicar
                </button>
                <button className="ghost" onClick={() => setToDelete(p)}>Apagar</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toDelete && (
        <Modal
          title={`Apagar o perfil “${toDelete}”?`}
          confirmLabel="Apagar"
          danger
          onClose={() => setToDelete(null)}
          onConfirm={async () => {
            const p = toDelete;
            setToDelete(null);
            try {
              await api.deleteProfile(p);
              refresh();
            } catch (e) {
              notify(String(e), true);
            }
          }}
        >
          <p>O arquivo do perfil é removido. Isso não muda o que está gravado no teclado.</p>
        </Modal>
      )}
    </section>
  );
}
