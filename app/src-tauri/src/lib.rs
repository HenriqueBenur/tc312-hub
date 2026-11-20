pub mod device;
pub mod effects;
mod keytest;
mod macros;
pub mod protocol;
mod storage;

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};

use device::{DeviceState, Warrior};
use effects::{EffectEngine, EffectStatus, Hooks, SoftEffect};
use macros::{Macro, MacroEngine, SlotStatus};
use protocol::LightingInput;
use storage::{BackupInfo, Profile, Settings, Storage};

struct AppState {
    /// Serializa o acesso ao HID (uma conversa com o teclado por vez; o motor de efeitos também usa).
    hid: Arc<Mutex<()>>,
    storage: Storage,
    macros: MacroEngine,
    effects: EffectEngine,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    connected: bool,
    official_app_running: bool,
    effect: EffectStatus,
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
    /// Some(None) = desligar o efeito do app; Some(Some(e)) = ligar depois de gravar.
    effect: Option<Option<SoftEffect>>,
}

fn apply(st: &AppState, reason: &str, ch: Changes) -> Result<WriteResult, String> {
    // Gravações que não escolhem efeito (ex.: bloqueio da tecla Win) pausam o efeito do app
    // durante a escrita; depois ele volta, inclusive se a gravação falhar.
    let resume = if ch.effect.is_none() { st.effects.current() } else { None };
    let r = apply_inner(st, reason, ch);
    if let Some(e) = resume {
        if !st.effects.is_active() {
            set_effect_running(st, Some(e));
        }
    }
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
    if let Some(Some(e)) = &ch.effect {
        e.validate()?;
    }
    // Quem grava a configuração define o efeito do teclado: o efeito do app para antes.
    if block.is_some() || ch.colors.is_some() {
        st.effects.stop_for_write();
    }
    let guard = st.hid.lock().map_err(|_| "HID ocupado")?;
    let applied = st.storage.load_settings().keymap_hex;
    let w = Warrior::open()?;
    let before = w.read_state()?.with_applied_keymap(applied.as_deref());
    let cfg_raw = w.read_config()?;
    let backup = st.storage.backup(&before, &cfg_raw, reason)?;

    let mut keymap_hex = None;
    if let Some(km) = &ch.keymap {
        let clean = protocol::sanitize_keymap(km);
        let current = protocol::unhex(&before.keymap_hex)?;
        protocol::validate_keymap(&clean, &current)?;
        w.write_keymap(&clean)?;
        keymap_hex = Some(protocol::hex(&clean));
    }
    let mut colors_hex = None;
    if let Some(c) = &ch.colors {
        let clean = protocol::sanitize_colors(c);
        w.write_custom_colors(&clean)?;
        colors_hex = Some(protocol::hex(&clean));
    }
    if let Some(b) = &block {
        w.write_config(b)?;
    }
    let state = w.read_state()?.with_applied_keymap(keymap_hex.as_deref().or(applied.as_deref()));
    drop(w);
    drop(guard);

    // só muda nas configurações o que esta gravação mexeu (outros comandos podem ter salvo nesse meio-tempo)
    let effect = ch.effect.clone();
    st.storage.update_settings(|s| {
        if let Some(h) = keymap_hex {
            s.keymap_hex = Some(h);
        }
        if let Some(h) = colors_hex {
            s.custom_colors_hex = Some(h);
        }
        if let Some(l) = ch.lighting {
            s.lighting = Some(l);
        }
        if let Some(m) = &ch.macros {
            s.macros = m.clone();
        }
        if let Some(p) = ch.profile {
            s.active_profile = p;
        }
        if let Some(e) = &effect {
            s.effect = e.clone();
        }
    })?;
    if let Some(m) = ch.macros {
        st.macros.set(m);
    }
    if let Some(e) = effect {
        set_effect_running(st, e);
    }
    st.storage.log(&format!("gravação ok ({reason}); backup {backup}"));
    Ok(WriteResult { state, backup })
}

fn set_effect_running(st: &AppState, e: Option<SoftEffect>) {
    keytest::set_watch(e.is_some());
    st.effects.set(e);
}

fn stamp_now() -> String {
    storage::stamp()
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| format!("Falha interna: {e}"))?
}

#[tauri::command]
async fn get_status(app: AppHandle) -> Status {
    tauri::async_runtime::spawn_blocking(move || Status {
        connected: Warrior::is_connected(),
        official_app_running: official_app_running(),
        effect: app.state::<AppState>().effects.status(),
    })
    .await
    .unwrap_or(Status { connected: false, official_app_running: false, effect: EffectStatus::default() })
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
        apply(
            &st,
            "antes de gravar iluminação",
            Changes { lighting: Some(lighting), colors, effect: Some(None), ..Default::default() },
        )
    })
    .await
}

#[tauri::command]
async fn set_win_lock(app: AppHandle, on: bool) -> Result<WriteResult, String> {
    blocking(move || {
        let st = app.state::<AppState>();
        // parte da configuração salva; sem ela, da que está no teclado (não troca o efeito de ninguém)
        let saved = st.storage.load_settings().lighting;
        let base = match saved {
            Some(l) => l,
            None => {
                let _g = st.hid.lock().map_err(|_| "HID ocupado")?;
                let cfg = Warrior::open()?.read_config()?;
                protocol::decode_config(&cfg).map(|c| LightingInput::from(&c)).unwrap_or_default()
            }
        };
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
                effect: Some(None),
                ..Default::default()
            },
        )?;
        st.storage.update_settings(|s| {
            s.custom_colors_hex = None;
            s.repair_recommended = false;
        })?;
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
    let m = macros.clone();
    state.storage.update_settings(|s| s.macros = m)?;
    state.macros.set(macros);
    Ok(())
}

/// Liga um efeito desenhado pelo app (paleta de 1 a 3 cores ou arco-íris) e salva a escolha.
#[tauri::command]
async fn start_effect(app: AppHandle, effect: SoftEffect) -> Result<(), String> {
    blocking(move || {
        ensure_free()?;
        effect.validate()?;
        let st = app.state::<AppState>();
        let e = effect.clone();
        st.storage.update_settings(|s| s.effect = Some(e))?;
        st.storage.log(&format!("efeito do app ligado: {:?}", effect.kind));
        set_effect_running(&st, Some(effect));
        Ok(())
    })
    .await
}

/// Desliga o efeito do app; o teclado volta ao efeito gravado nele.
#[tauri::command]
async fn stop_effect(app: AppHandle) -> Result<(), String> {
    blocking(move || {
        let st = app.state::<AppState>();
        st.storage.update_settings(|s| s.effect = None)?;
        set_effect_running(&st, None);
        st.effects.stop_and_wait();
        Ok(())
    })
    .await
}

/// Antes de instalar uma atualização: para o efeito (regravando a configuração do teclado),
/// porque o instalador fecha o app de uma vez.
#[tauri::command]
async fn prepare_update(app: AppHandle) -> Result<(), String> {
    blocking(move || {
        let st = app.state::<AppState>();
        keytest::set_watch(false);
        st.effects.stop_and_wait();
        st.storage.log("preparando atualização");
        Ok(())
    })
    .await
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
            effect: Some(p.effect.clone()),
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
        // Segunda instância (ex.: atalho clicado com o app na bandeja) só traz a janela de volta.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let storage = Storage::new(dir);
            let mut settings = storage.load_settings();
            let first_check = !settings.legacy_check_done;
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
            // Só na primeira abertura depois de atualizar: backups de iluminação sem o reparo
            // indicam gravação feita pela v1.0.0. Antes isto rodava sempre e qualquer gravação de
            // iluminação nova acendia o aviso de reparo de novo (bug da v1.0.1).
            if first_check
                && storage.list_backups().iter().any(|b| b.reason.contains("gravar iluminação"))
                && !std::path::Path::new(&storage.root().join("repaired-1.0.1")).exists()
            {
                settings.repair_recommended = true;
            }
            settings.legacy_check_done = true;
            let _ = storage.save_settings(&settings);
            let engine = MacroEngine::start(settings.macros.clone());
            storage.log(&format!("TC312 Hub {} iniciado; {} macro(s)", env!("CARGO_PKG_VERSION"), settings.macros.len()));

            let hid = Arc::new(Mutex::new(()));
            let restore_storage = storage.clone();
            let log_storage = storage.clone();
            let effects = EffectEngine::start(Hooks {
                hid: hid.clone(),
                anomaly_count: keytest::anomaly_count,
                official_app_running,
                log: Box::new(move |m| log_storage.log(m)),
                // ao parar o efeito do app, regrava a configuração salva (ou a que está no teclado)
                restore: Box::new(move |w| {
                    let lighting = match restore_storage.load_settings().lighting {
                        Some(l) => Some(l),
                        None => w.read_config().ok().and_then(|c| protocol::decode_config(&c)).map(|c| LightingInput::from(&c)),
                    };
                    if let Some(block) = lighting.and_then(|l| protocol::encode_config(&l).ok()) {
                        if let Err(e) = w.write_config(&block) {
                            restore_storage.log(&format!("não regravei a configuração ao parar o efeito: {e}"));
                        }
                    }
                }),
            });
            keytest::start(app.handle().clone());
            if let Some(e) = settings.effect.clone().filter(|e| e.validate().is_ok()) {
                storage.log(&format!("retomando o efeito do app: {:?}", e.kind));
                keytest::set_watch(true);
                effects.set(Some(e));
            }
            app.manage(AppState { hid, storage, macros: engine, effects });

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
                    "quit" => {
                        // devolve o teclado ao efeito gravado nele antes de sair
                        app.state::<AppState>().effects.shutdown();
                        app.exit(0)
                    }
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
            start_effect,
            stop_effect,
            prepare_update,
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
