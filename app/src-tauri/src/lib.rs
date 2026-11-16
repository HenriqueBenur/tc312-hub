pub mod device;
mod keytest;
mod macros;
pub mod protocol;
mod storage;

use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};

use device::{DeviceState, Warrior};
use macros::{Macro, MacroEngine, SlotStatus};
use protocol::LightingInput;
use storage::{BackupInfo, Profile, Settings, Storage};

struct AppState {
    /// Serializa o acesso ao HID (uma conversa com o teclado por vez).
    hid: Mutex<()>,
    storage: Storage,
    macros: MacroEngine,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    connected: bool,
    official_app_running: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteResult {
    state: DeviceState,
    backup: String,
}

/// O MK1 Elite conflita com o app: manda ~175 pacotes/s e regrava o Win-lock.
fn official_app_running() -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq MK1 Elite.exe", "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains("MK1 Elite"))
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn ensure_free() -> Result<(), String> {
    if official_app_running() {
        Err("Feche o MK1 Elite antes (ele disputa o teclado com o app).".into())
    } else {
        Ok(())
    }
}

/// Mudanças a gravar numa única conversa com o teclado.
#[derive(Default)]
struct Changes {
    keymap: Option<Vec<u8>>,
    colors: Option<Vec<u8>>,
    lighting: Option<LightingInput>,
    macros: Option<Vec<Macro>>,
    profile: Option<Option<String>>,
}

fn apply(st: &AppState, reason: &str, ch: Changes) -> Result<WriteResult, String> {
    let r = apply_inner(st, reason, ch);
    if let Err(e) = &r {
        st.storage.log(&format!("gravação falhou ({reason}): {e}"));
    }
    r
}

/// Lê o estado, guarda backup, valida, grava, salva as configurações e devolve o estado novo.
fn apply_inner(st: &AppState, reason: &str, ch: Changes) -> Result<WriteResult, String> {
    ensure_free()?;
    let block = ch.lighting.as_ref().map(protocol::encode_config).transpose()?;
    if let Some(c) = &ch.colors {
        if c.len() != protocol::COLORS_LEN {
            return Err("Tabela de cores com tamanho errado.".into());
        }
    }
    let _guard = st.hid.lock().map_err(|_| "HID ocupado")?;
    let mut settings = st.storage.load_settings();
    let w = Warrior::open()?;
    let before = w.read_state()?.with_applied_keymap(settings.keymap_hex.as_deref());
    let cfg_raw = w.read_config()?;
    let backup = st.storage.backup(&before, &cfg_raw, reason)?;

    if let Some(km) = &ch.keymap {
        let clean = protocol::sanitize_keymap(km);
        let current = protocol::unhex(&before.keymap_hex)?;
        protocol::validate_keymap(&clean, &current)?;
        w.write_keymap(&clean)?;
        settings.keymap_hex = Some(protocol::hex(&clean));
    }
    if let Some(c) = &ch.colors {
        let clean = protocol::sanitize_colors(c);
        w.write_custom_colors(&clean)?;
        settings.custom_colors_hex = Some(protocol::hex(&clean));
    }
    if let (Some(b), Some(l)) = (&block, ch.lighting) {
        w.write_config(b)?;
        settings.lighting = Some(l);
    }
    if let Some(m) = ch.macros {
        settings.macros = m.clone();
        st.macros.set(m);
    }
    if let Some(p) = ch.profile {
        settings.active_profile = p;
    }
    st.storage.save_settings(&settings)?;
    let state = w.read_state()?.with_applied_keymap(settings.keymap_hex.as_deref());
    st.storage.log(&format!("gravação ok ({reason}); backup {backup}"));
    Ok(WriteResult { state, backup })
}

fn stamp_now() -> String {
    storage::stamp()
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| format!("Falha interna: {e}"))?
}

#[tauri::command]
async fn get_status() -> Status {
    tauri::async_runtime::spawn_blocking(|| Status {
        connected: Warrior::is_connected(),
        official_app_running: official_app_running(),
    })
    .await
    .unwrap_or(Status { connected: false, official_app_running: false })
}

#[tauri::command]
async fn read_device(app: AppHandle) -> Result<DeviceState, String> {
    blocking(move || {
        ensure_free()?;
        let st = app.state::<AppState>();
        let _guard = st.hid.lock().map_err(|_| "HID ocupado")?;
        let applied = st.storage.load_settings().keymap_hex;
        let r = Warrior::open().and_then(|w| w.read_state()).map(|s| s.with_applied_keymap(applied.as_deref()));
        match &r {
            Ok(s) => st.storage.log(&format!(
                "leitura ok: keymap={} winlock={:?}",
                s.keymap_source,
                s.config.as_ref().map(|c| c.win_lock)
            )),
            Err(e) => st.storage.log(&format!("leitura falhou: {e}")),
        }
        r
    })
    .await
}

#[tauri::command]
async fn write_keymap(app: AppHandle, keymap_hex: String) -> Result<WriteResult, String> {
    blocking(move || {
        let st = app.state::<AppState>();
        let km = protocol::unhex(&keymap_hex)?;
        apply(&st, "antes de gravar teclas", Changes { keymap: Some(km), ..Default::default() })
    })
    .await
}

#[tauri::command]
async fn write_lighting(app: AppHandle, lighting: LightingInput, colors_hex: Option<String>) -> Result<WriteResult, String> {
    blocking(move || {
        let st = app.state::<AppState>();
        let colors = colors_hex.map(|h| protocol::unhex(&h)).transpose()?;
        apply(&st, "antes de gravar iluminação", Changes { lighting: Some(lighting), colors, ..Default::default() })
    })
    .await
}

#[tauri::command]
async fn set_win_lock(app: AppHandle, on: bool) -> Result<WriteResult, String> {
    blocking(move || {
        let st = app.state::<AppState>();
        let base = st.storage.load_settings().lighting.unwrap_or_default();
        let lighting = LightingInput { win_lock: on, ..base };
        apply(&st, "antes de mudar o bloqueio da tecla Win", Changes { lighting: Some(lighting), ..Default::default() })
    })
    .await
}

/// Reparar / padrão de fábrica: keymap de fábrica (formato MK1), tabela de cores limpa
/// (zeros, inclusive a área depois da entrada 127) e iluminação padrão.
#[tauri::command]
async fn restore_factory(app: AppHandle) -> Result<WriteResult, String> {
    blocking(move || {
        let st = app.state::<AppState>();
        let r = apply(
            &st,
            "antes de reparar o teclado",
            Changes {
                keymap: Some(protocol::FACTORY_KEYMAP.to_vec()),
                colors: Some(vec![0u8; protocol::COLORS_LEN]),
                lighting: Some(LightingInput::default()),
                profile: Some(None),
                ..Default::default()
            },
        )?;
        let mut s = st.storage.load_settings();
        s.custom_colors_hex = None;
        s.repair_recommended = false;
        st.storage.save_settings(&s)?;
        let _ = std::fs::write(st.storage.root().join("repaired-1.0.1"), stamp_now());
        st.storage.log("reparo concluído: keymap de fábrica, tabela de cores zerada, iluminação padrão");
        Ok(r)
    })
    .await
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Settings {
    state.storage.load_settings()
}

#[tauri::command]
fn factory_keymap_hex() -> String {
    protocol::hex(protocol::FACTORY_KEYMAP)
}

#[tauri::command]
fn set_macros(state: State<'_, AppState>, macros: Vec<Macro>) -> Result<(), String> {
    let mut s = state.storage.load_settings();
    s.macros = macros.clone();
    state.storage.save_settings(&s)?;
    state.macros.set(macros);
    Ok(())
}

#[tauri::command]
fn macro_status(state: State<'_, AppState>) -> Vec<SlotStatus> {
    state.macros.status()
}

#[tauri::command]
fn test_macro(state: State<'_, AppState>, slot: u8) {
    state.macros.play_now(slot);
}

#[tauri::command]
fn set_key_test(on: bool) {
    keytest::set_enabled(on);
}

#[tauri::command]
fn list_profiles(state: State<'_, AppState>) -> Vec<String> {
    state.storage.list_profiles()
}

#[tauri::command]
fn save_profile(state: State<'_, AppState>, profile: Profile) -> Result<(), String> {
    state.storage.save_profile(&profile)
}

#[tauri::command]
fn load_profile(state: State<'_, AppState>, name: String) -> Result<Profile, String> {
    state.storage.load_profile(&name)
}

#[tauri::command]
fn delete_profile(state: State<'_, AppState>, name: String) -> Result<(), String> {
    state.storage.delete_profile(&name)
}

/// Aplica um perfil inteiro: keymap, iluminação (e cores) e macros.
#[tauri::command]
async fn apply_profile(app: AppHandle, name: String) -> Result<WriteResult, String> {
    blocking(move || {
        let st = app.state::<AppState>();
        let p = st.storage.load_profile(&name)?;
        let ch = Changes {
            keymap: Some(protocol::unhex(&p.keymap_hex)?),
            colors: p.custom_colors_hex.as_deref().map(protocol::unhex).transpose()?,
            lighting: Some(p.lighting),
            macros: Some(p.macros.clone()),
            profile: Some(Some(p.name.clone())),
        };
        apply(&st, &format!("antes de aplicar o perfil {}", p.name), ch)
    })
    .await
}

#[tauri::command]
fn list_backups(state: State<'_, AppState>) -> Vec<BackupInfo> {
    state.storage.list_backups()
}

#[tauri::command]
async fn restore_backup(app: AppHandle, name: String) -> Result<WriteResult, String> {
    blocking(move || {
        let st = app.state::<AppState>();
        let km = st.storage.backup_keymap(&name)?;
        apply(&st, &format!("antes de restaurar o backup {name}"), Changes { keymap: Some(km), ..Default::default() })
    })
    .await
}

#[tauri::command]
fn open_data_folder(state: State<'_, AppState>) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(state.storage.root())
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let storage = Storage::new(dir);
            let mut settings = storage.load_settings();
            // v1.0.0 gravava cor depois da entrada 127: limpa o que ficou salvo e recomenda o reparo.
            if let Some(h) = settings.custom_colors_hex.clone() {
                if let Ok(c) = protocol::unhex(&h) {
                    if c.iter().skip(protocol::LED_SLOTS * 3).any(|&b| b != 0) {
                        settings.custom_colors_hex = Some(protocol::hex(&protocol::sanitize_colors(&c)));
                        settings.repair_recommended = true;
                        storage.log("cores da v1.0.0 com dados depois da entrada 127: reparo recomendado");
                    }
                }
            }
            if storage.list_backups().iter().any(|b| b.reason.contains("gravar iluminação"))
                && !std::path::Path::new(&storage.root().join("repaired-1.0.1")).exists()
            {
                // houve gravação de iluminação com a v1.0.0 (pode ter incluído cores por tecla)
                settings.repair_recommended = true;
            }
            let _ = storage.save_settings(&settings);
            let engine = MacroEngine::start(settings.macros.clone());
            storage.log(&format!("TC312 Hub {} iniciado; {} macro(s)", env!("CARGO_PKG_VERSION"), settings.macros.len()));
            app.manage(AppState { hid: Mutex::new(()), storage, macros: engine });
            keytest::start(app.handle().clone());

            let open = MenuItem::with_id(app, "open", "Abrir TC312 Hub", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Sair (desliga as macros)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &sep, &quit])?;
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().ok_or("sem ícone")?)
                .tooltip("TC312 Hub")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Fechar a janela só esconde: o app continua na bandeja para as macros funcionarem.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            read_device,
            write_keymap,
            write_lighting,
            set_win_lock,
            restore_factory,
            get_settings,
            factory_keymap_hex,
            set_macros,
            macro_status,
            test_macro,
            set_key_test,
            list_profiles,
            save_profile,
            load_profile,
            delete_profile,
            apply_profile,
            list_backups,
            restore_backup,
            open_data_folder
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o TC312 Hub");
}
