import { useEffect, useState } from "react";
import { api, type Lighting, type Macro } from "../api";
import { PageHead, type OnWrite } from "../App";
import { Modal } from "../components";
import type { SoftEffect } from "../effects";
import { IconTrash } from "../icons";

export function ProfilesPage({
  current,
  activeProfile,
  connected,
  busy,
  onWrite,
  notify,
}: {
  current: { keymapHex: string; lighting: Lighting; customColorsHex: string | null; macros: Macro[]; effect: SoftEffect | null } | null;
  activeProfile: string | null;
  connected: boolean;
  busy: boolean;
  onWrite: OnWrite;
  notify: (msg: string, error?: boolean) => void;
}) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState<string | null>(null);

  const refresh = () => api.listProfiles().then(setProfiles).catch((e) => notify(String(e), true));
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSave = async (n: string) => {
    if (!current) return;
    try {
      await api.saveProfile({ name: n, ...current });
      notify(`Perfil “${n}” salvo`);
      setName("");
      refresh();
    } catch (e) {
      notify(String(e), true);
    }
  };
  const save = () => {
    const n = name.trim();
    if (!current || !n) return;
    if (profiles.some((p) => p.toLowerCase() === n.toLowerCase())) setOverwrite(n);
    else doSave(n);
  };

  return (
    <>
      <PageHead title="Perfis" sub="Teclas, iluminação, cores e macros num só lugar" />

      <div className="page">
        <div className="dock two" style={{ flex: 1, height: "auto" }}>
          <section className="panel">
            <div className="panel-head"><h2>Salvar a configuração atual</h2></div>
            <div className="panel-body">
              <p className="muted">Guarda as teclas, a iluminação (inclusive o efeito do app), as cores por tecla e as macros que estão aplicadas agora.</p>
              <div className="field-row" style={{ flexWrap: "nowrap", marginTop: 12 }}>
                <input
                  value={name}
                  placeholder="Nome do perfil (ex.: Jogos, Edição de vídeo)"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  style={{ flex: 1, minWidth: 0 }}
                  aria-label="Nome do perfil"
                />
                <button className="btn primary" disabled={!current || !name.trim()} onClick={save}>Salvar perfil</button>
              </div>
              {!current && <p className="note">Conecte o Warrior para salvar o que está nele.</p>}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Perfis salvos</h2></div>
            <div className="panel-body">
              {profiles.length === 0 ? (
                <div className="empty"><b>Nenhum perfil ainda</b>Salve a configuração atual com um nome.</div>
              ) : (
                <ul className="rows">
                  {profiles.map((p) => (
                    <li key={p}>
                      <span className="grow title">{p}</span>
                      {activeProfile === p && <span className="pill ok">ativo</span>}
                      <button
                        className="btn primary small"
                        disabled={!connected || busy}
                        onClick={async () => {
                          if (await onWrite(`Perfil “${p}” aplicado`, () => api.applyProfile(p))) refresh();
                        }}
                      >
                        Aplicar
                      </button>
                      <button className="icon-btn" onClick={() => setToDelete(p)} aria-label={`Apagar ${p}`}><IconTrash size={16} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      {overwrite && (
        <Modal
          title={`Substituir o perfil “${overwrite}”?`}
          confirmLabel="Substituir"
          onClose={() => setOverwrite(null)}
          onConfirm={() => {
            const n = overwrite;
            setOverwrite(null);
            doSave(n);
          }}
        >
          <p>Já existe um perfil com esse nome. Ele será trocado pela configuração atual.</p>
        </Modal>
      )}
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
    </>
  );
}
