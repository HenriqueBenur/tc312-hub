//! Arquivos do app em %APPDATA%\com.tc312hub.app:
//!   settings.json        última iluminação aplicada, cores por tecla, macros, perfil ativo
//!   backups/<data>/      estado do teclado antes de cada gravação (keymap, config, ledmap, info)
//!   profiles/<nome>.json perfis salvos pela pessoa

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::device::DeviceState;
use crate::effects::SoftEffect;
use crate::macros::Macro;
use crate::protocol::LightingInput;

const MAX_BACKUPS: usize = 40;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Keymap aplicado pelo app (o teclado não devolve o keymap ativo).
    pub keymap_hex: Option<String>,
    pub lighting: Option<LightingInput>,
    pub custom_colors_hex: Option<String>,
    pub macros: Vec<Macro>,
    pub active_profile: Option<String>,
    /// Ligado quando a v1.0.0 deixou cor gravada depois da entrada 127 (causa das "teclas malucas").
    pub repair_recommended: bool,
    /// Efeito desenhado pelo app (paletas). Só roda com o app aberto ou na bandeja.
    pub effect: Option<SoftEffect>,
    /// A checagem dos backups da v1.0.0 já foi feita (não repetir a cada abertura).
    pub legacy_check_done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub keymap_hex: String,
    pub lighting: LightingInput,
    #[serde(default)]
    pub custom_colors_hex: Option<String>,
    #[serde(default)]
    pub macros: Vec<Macro>,
    #[serde(default)]
    pub effect: Option<SoftEffect>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub reason: String,
}

#[derive(Clone)]
pub struct Storage {
    root: PathBuf,
    /// Serializa ler-modificar-salvar do settings.json (comandos em threads diferentes).
    lock: Arc<Mutex<()>>,
}

/// Data/hora local não é trivial sem dependências; usamos UTC no nome das pastas.
pub fn stamp() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // algoritmo civil-from-days (Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}{m:02}{d:02}T{:02}{:02}{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

fn safe_name(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let s = s.trim().to_string();
    if s.is_empty() { "perfil".into() } else { s.chars().take(60).collect() }
}

impl Storage {
    pub fn new(root: PathBuf) -> Self {
        let _ = fs::create_dir_all(root.join("backups"));
        let _ = fs::create_dir_all(root.join("profiles"));
        Self { root, lock: Arc::new(Mutex::new(())) }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Registro simples em tc312hub.log (até ~256 KB; depois recomeça).
    pub fn log(&self, msg: &str) {
        use std::io::Write;
        let path = self.root.join("tc312hub.log");
        if fs::metadata(&path).map(|m| m.len() > 256 * 1024).unwrap_or(false) {
            let _ = fs::remove_file(&path);
        }
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "{} {msg}", stamp());
        }
        eprintln!("[tc312] {msg}");
    }

    pub fn load_settings(&self) -> Settings {
        let path = self.root.join("settings.json");
        let Ok(text) = fs::read_to_string(&path) else { return Settings::default() };
        match serde_json::from_str(&text) {
            Ok(s) => s,
            Err(e) => {
                // não sobrescreve em silêncio: guarda a cópia ilegível antes de recomeçar
                let keep = self.root.join(format!("settings.ilegivel-{}.json", stamp()));
                let _ = fs::copy(&path, &keep);
                self.log(&format!("settings.json ilegível ({e}); cópia em {}", keep.display()));
                Settings::default()
            }
        }
    }

    /// Grava num arquivo temporário e troca de uma vez (queda de energia não deixa JSON pela metade).
    pub fn save_settings(&self, s: &Settings) -> Result<(), String> {
        let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
        let tmp = self.root.join("settings.json.tmp");
        fs::write(&tmp, json).map_err(|e| format!("Não salvei as configurações: {e}"))?;
        fs::rename(&tmp, self.root.join("settings.json")).map_err(|e| format!("Não salvei as configurações: {e}"))
    }

    /// Lê, altera e salva as configurações sem perder mudanças feitas ao mesmo tempo por outro comando.
    pub fn update_settings<T>(&self, f: impl FnOnce(&mut Settings) -> T) -> Result<T, String> {
        let _g = self.lock.lock().map_err(|_| "configurações ocupadas")?;
        let mut s = self.load_settings();
        let out = f(&mut s);
        self.save_settings(&s)?;
        Ok(out)
    }

    /// Guarda o estado lido do teclado antes de uma gravação.
    pub fn backup(&self, state: &DeviceState, config_raw: &[u8], reason: &str) -> Result<String, String> {
        let name = format!("{}_{}", stamp(), safe_name(reason).replace(' ', "-"));
        let dir = self.root.join("backups").join(&name);
        fs::create_dir_all(&dir).map_err(|e| format!("Não criei a pasta de backup: {e}"))?;
        let km = crate::protocol::unhex(&state.keymap_hex)?;
        fs::write(dir.join("keymap.bin"), km).map_err(|e| e.to_string())?;
        fs::write(dir.join("config.bin"), config_raw).map_err(|e| e.to_string())?;
        fs::write(dir.join("ledmap.bin"), &state.ledmap).map_err(|e| e.to_string())?;
        fs::write(dir.join("info.txt"), format!("motivo: {reason}\ninfo: {}\n", state.info)).map_err(|e| e.to_string())?;
        self.prune_backups();
        Ok(name)
    }

    fn prune_backups(&self) {
        let mut dirs: Vec<_> = fs::read_dir(self.root.join("backups"))
            .map(|r| r.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()).collect())
            .unwrap_or_default();
        dirs.sort();
        while dirs.len() > MAX_BACKUPS {
            let _ = fs::remove_dir_all(dirs.remove(0));
        }
    }

    pub fn list_backups(&self) -> Vec<BackupInfo> {
        let mut v: Vec<BackupInfo> = fs::read_dir(self.root.join("backups"))
            .map(|r| {
                r.filter_map(|e| e.ok())
                    .filter(|e| e.path().join("keymap.bin").exists())
                    .map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        let reason = fs::read_to_string(e.path().join("info.txt"))
                            .ok()
                            .and_then(|t| t.lines().next().map(|l| l.trim_start_matches("motivo: ").to_string()))
                            .unwrap_or_default();
                        BackupInfo { name, reason }
                    })
                    .collect()
            })
            .unwrap_or_default();
        v.sort_by(|a, b| b.name.cmp(&a.name));
        v
    }

    pub fn backup_keymap(&self, name: &str) -> Result<Vec<u8>, String> {
        if name.contains("..") || name.contains('/') || name.contains('\\') {
            return Err("Nome de backup inválido.".into());
        }
        fs::read(self.root.join("backups").join(name).join("keymap.bin")).map_err(|e| format!("Backup não encontrado: {e}"))
    }

    pub fn list_profiles(&self) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(self.root.join("profiles"))
            .map(|r| {
                r.filter_map(|e| e.ok())
                    .filter_map(|e| {
                        let p = e.path();
                        (p.extension().and_then(|x| x.to_str()) == Some("json"))
                            .then(|| fs::read_to_string(&p).ok())
                            .flatten()
                            .and_then(|s| serde_json::from_str::<Profile>(&s).ok())
                            .map(|pr| pr.name)
                    })
                    .collect()
            })
            .unwrap_or_default();
        v.sort_by_key(|s| s.to_lowercase());
        v
    }

    pub fn save_profile(&self, p: &Profile) -> Result<(), String> {
        let path = self.root.join("profiles").join(format!("{}.json", safe_name(&p.name)));
        let json = serde_json::to_string_pretty(p).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| format!("Não salvei o perfil: {e}"))
    }

    pub fn load_profile(&self, name: &str) -> Result<Profile, String> {
        let path = self.root.join("profiles").join(format!("{}.json", safe_name(name)));
        let s = fs::read_to_string(path).map_err(|e| format!("Perfil não encontrado: {e}"))?;
        serde_json::from_str(&s).map_err(|e| format!("Perfil corrompido: {e}"))
    }

    pub fn delete_profile(&self, name: &str) -> Result<(), String> {
        let path = self.root.join("profiles").join(format!("{}.json", safe_name(name)));
        fs::remove_file(path).map_err(|e| format!("Não apaguei o perfil: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamp_format() {
        let s = stamp();
        assert_eq!(s.len(), 16);
        assert!(s.ends_with('Z'));
    }

    #[test]
    fn safe_names() {
        assert_eq!(safe_name("Jogos/FPS"), "Jogos_FPS");
        assert_eq!(safe_name("   "), "perfil");
        assert_eq!(safe_name("..\\x"), "___x");
    }
}
