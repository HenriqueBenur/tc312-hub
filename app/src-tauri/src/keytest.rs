//! "Testar teclas": mostra o que o Warrior realmente envia ao Windows.
//!
//! Uma janela invisível (message-only) recebe Raw Input com RIDEV_INPUTSINK, mas **só
//! enquanto alguém precisa**: a tela "Testar teclas" ligada ou o cão de guarda de um
//! efeito do app. Fora disso o registro é removido (RIDEV_REMOVE) e o app não recebe
//! nenhuma tecla (desde a 1.1.1; antes o registro ficava ativo o tempo todo, o que o
//! antivírus confunde com keylogger).
//! Só os eventos cujo dispositivo é VID_320F&PID_5078 são considerados; o Logitech é
//! ignorado. Nada é gravado em disco nem enviado: é só observação na hora.

use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering};
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();
static ENABLED: AtomicBool = AtomicBool::new(false);
/// Vigia ligado enquanto o motor de efeitos manda quadros (cão de guarda), mesmo sem a tela de teste.
static WATCH: AtomicBool = AtomicBool::new(false);
static ANOMALIES: AtomicU32 = AtomicU32::new(0);
static HWND: AtomicIsize = AtomicIsize::new(0);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyEvent {
    pub vk: u16,
    pub scan: u16,
    pub e0: bool,
    pub down: bool,
}

/// Eventos que não são de teclado vindos do Warrior (mídia, sistema, mouse interno).
/// No defeito da v1.0.0 / MK1 Elite o firmware passou a mandar lixo justamente por aqui.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HidEvent {
    pub kind: String,
    pub data: String,
}

pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::SeqCst);
    reregister();
}

pub fn set_watch(on: bool) {
    WATCH.store(on, Ordering::SeqCst);
    reregister();
}

fn needed() -> bool {
    ENABLED.load(Ordering::SeqCst) || WATCH.load(Ordering::SeqCst)
}

/// Eventos estranhos vindos do Warrior desde que o app abriu (tecla sem código, mouse, sistema).
pub fn anomaly_count() -> u32 {
    ANOMALIES.load(Ordering::SeqCst)
}

/// Liga ou desliga o registro de Raw Input conforme a necessidade (na thread da janela).
/// O registro é por processo: se outra parte do app registrar teclado/mouse depois, nossa
/// janela deixa de receber; por isso cada mudança registra de novo.
fn reregister() {
    #[cfg(windows)]
    win::post_reregister(HWND.load(Ordering::SeqCst));
}

#[cfg(not(windows))]
pub fn start(app: AppHandle) {
    let _ = APP.set(app);
}

#[cfg(windows)]
pub fn start(app: AppHandle) {
    let _ = APP.set(app);
    std::thread::spawn(|| unsafe { win::run() });
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::ffi::c_void;
    use std::ptr::null_mut;

    type Hwnd = *mut c_void;
    type WndProc = unsafe extern "system" fn(Hwnd, u32, usize, isize) -> isize;

    #[repr(C)]
    struct WndClassExW {
        size: u32,
        style: u32,
        wndproc: WndProc,
        cls_extra: i32,
        wnd_extra: i32,
        instance: *mut c_void,
        icon: *mut c_void,
        cursor: *mut c_void,
        background: *mut c_void,
        menu_name: *const u16,
        class_name: *const u16,
        icon_sm: *mut c_void,
    }
    #[repr(C)]
    struct RawInputDevice {
        usage_page: u16,
        usage: u16,
        flags: u32,
        target: Hwnd,
    }
    #[repr(C)]
    struct RawInputHeader {
        kind: u32,
        size: u32,
        device: *mut c_void,
        wparam: usize,
    }
    #[repr(C)]
    struct RawKeyboard {
        make_code: u16,
        flags: u16,
        reserved: u16,
        vkey: u16,
        message: u32,
        extra: u32,
    }
    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }
    #[repr(C)]
    struct Msg {
        hwnd: Hwnd,
        message: u32,
        wparam: usize,
        lparam: isize,
        time: u32,
        pt: Point,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn RegisterClassExW(c: *const WndClassExW) -> u16;
        fn CreateWindowExW(
            ex: u32, class: *const u16, name: *const u16, style: u32, x: i32, y: i32, w: i32, h: i32,
            parent: Hwnd, menu: *mut c_void, inst: *mut c_void, param: *mut c_void,
        ) -> Hwnd;
        fn DefWindowProcW(h: Hwnd, m: u32, w: usize, l: isize) -> isize;
        fn RegisterRawInputDevices(d: *const RawInputDevice, n: u32, size: u32) -> i32;
        fn GetRawInputData(h: isize, cmd: u32, data: *mut c_void, size: *mut u32, header: u32) -> u32;
        fn GetRawInputDeviceInfoW(dev: *mut c_void, cmd: u32, data: *mut c_void, size: *mut u32) -> u32;
        fn GetMessageW(msg: *mut Msg, hwnd: Hwnd, min: u32, max: u32) -> i32;
        fn TranslateMessage(msg: *const Msg) -> i32;
        fn DispatchMessageW(msg: *const Msg) -> isize;
        fn PostMessageW(h: Hwnd, m: u32, w: usize, l: isize) -> i32;
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
    }

    const WM_INPUT: u32 = 0x00FF;
    const WM_APP_REREGISTER: u32 = 0x8002;
    const RID_INPUT: u32 = 0x1000_0003;
    const RIDI_DEVICENAME: u32 = 0x2000_0007;
    const RIDEV_INPUTSINK: u32 = 0x100;
    const RIDEV_REMOVE: u32 = 0x1;
    const RIM_TYPEMOUSE: u32 = 0;
    const RIM_TYPEKEYBOARD: u32 = 1;
    const RIM_TYPEHID: u32 = 2;
    const HWND_MESSAGE: isize = -3;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe fn device_name(dev: *mut c_void) -> String {
        let mut size: u32 = 0;
        unsafe { GetRawInputDeviceInfoW(dev, RIDI_DEVICENAME, null_mut(), &mut size) };
        if size == 0 || size > 1024 {
            return String::new();
        }
        let mut buf = vec![0u16; size as usize];
        let n = unsafe { GetRawInputDeviceInfoW(dev, RIDI_DEVICENAME, buf.as_mut_ptr() as *mut c_void, &mut size) };
        if n == u32::MAX {
            return String::new();
        }
        String::from_utf16_lossy(&buf).trim_end_matches('\0').to_uppercase()
    }

    pub fn post_reregister(hwnd: isize) {
        if hwnd != 0 {
            unsafe { PostMessageW(hwnd as Hwnd, WM_APP_REREGISTER, 0, 0) };
        }
    }

    unsafe extern "system" fn wndproc(h: Hwnd, m: u32, w: usize, l: isize) -> isize {
        if m == WM_APP_REREGISTER {
            if needed() {
                unsafe { register(h) };
            } else {
                unsafe { unregister() };
            }
            return 0;
        }
        if m == WM_INPUT && needed() {
            unsafe { handle_input(l) };
        }
        unsafe { DefWindowProcW(h, m, w, l) }
    }

    fn anomaly() {
        ANOMALIES.fetch_add(1, Ordering::SeqCst);
    }

    const USAGES: [(u16, u16); 4] = [(0x01, 0x06), (0x01, 0x02), (0x0C, 0x01), (0x01, 0x80)];

    /// Remove o registro: o processo deixa de receber teclado, mouse, mídia e sistema.
    unsafe fn unregister() -> bool {
        let rids = USAGES.map(|(usage_page, usage)| RawInputDevice { usage_page, usage, flags: RIDEV_REMOVE, target: null_mut() });
        unsafe { RegisterRawInputDevices(rids.as_ptr(), rids.len() as u32, std::mem::size_of::<RawInputDevice>() as u32) != 0 }
    }

    /// teclado, mouse, mídia (consumer) e controle de sistema
    unsafe fn register(hwnd: Hwnd) -> bool {
        let rids = [
            RawInputDevice { usage_page: 0x01, usage: 0x06, flags: RIDEV_INPUTSINK, target: hwnd },
            RawInputDevice { usage_page: 0x01, usage: 0x02, flags: RIDEV_INPUTSINK, target: hwnd },
            RawInputDevice { usage_page: 0x0C, usage: 0x01, flags: RIDEV_INPUTSINK, target: hwnd },
            RawInputDevice { usage_page: 0x01, usage: 0x80, flags: RIDEV_INPUTSINK, target: hwnd },
        ];
        unsafe { RegisterRawInputDevices(rids.as_ptr(), rids.len() as u32, std::mem::size_of::<RawInputDevice>() as u32) != 0 }
    }

    unsafe fn handle_input(l: isize) {
        let header_size = std::mem::size_of::<RawInputHeader>() as u32;
        let mut size: u32 = 0;
        unsafe { GetRawInputData(l, RID_INPUT, null_mut(), &mut size, header_size) };
        if size == 0 || size > 256 {
            return;
        }
        let mut buf = vec![0u8; size as usize];
        if unsafe { GetRawInputData(l, RID_INPUT, buf.as_mut_ptr() as *mut c_void, &mut size, header_size) } != size {
            return;
        }
        let header = unsafe { &*(buf.as_ptr() as *const RawInputHeader) };
        let name = unsafe { device_name(header.device) };
        if !name.contains("VID_320F&PID_5078") {
            return; // ignora o Logitech, o G502 e qualquer outro aparelho
        }
        let body = &buf[header_size as usize..];
        let Some(app) = APP.get() else { return };
        let show = ENABLED.load(Ordering::SeqCst);
        match header.kind {
            RIM_TYPEKEYBOARD => {
                let kb = unsafe { &*(body.as_ptr() as *const RawKeyboard) };
                if kb.vkey == 0xFF || kb.vkey == 0 {
                    anomaly();
                }
                if show {
                    let ev = KeyEvent { vk: kb.vkey, scan: kb.make_code, e0: kb.flags & 0x2 != 0, down: kb.flags & 0x1 == 0 };
                    let _ = app.emit("warrior-key", ev);
                }
            }
            RIM_TYPEMOUSE if body.len() >= 24 => {
                anomaly();
                if show {
                    let data = crate::protocol::hex(&body[..24]);
                    let _ = app.emit("warrior-hid", HidEvent { kind: "mouse".into(), data });
                }
            }
            RIM_TYPEHID if body.len() >= 8 => {
                let size = u32::from_le_bytes([body[0], body[1], body[2], body[3]]) as usize;
                let count = u32::from_le_bytes([body[4], body[5], body[6], body[7]]) as usize;
                let end = (8 + size * count).min(body.len());
                let raw = &body[8..end];
                let kind = if name.contains("COL03") || raw.first() == Some(&0x03) { "mídia" } else { "sistema" };
                if kind == "sistema" {
                    anomaly();
                }
                if show {
                    let _ = app.emit("warrior-hid", HidEvent { kind: kind.into(), data: crate::protocol::hex(raw) });
                }
            }
            _ => {}
        }
    }

    pub unsafe fn run() {
        let class = wide("TC312HubKeyTest");
        let inst = unsafe { GetModuleHandleW(null_mut()) };
        let wc = WndClassExW {
            size: std::mem::size_of::<WndClassExW>() as u32,
            style: 0,
            wndproc,
            cls_extra: 0,
            wnd_extra: 0,
            instance: inst,
            icon: null_mut(),
            cursor: null_mut(),
            background: null_mut(),
            menu_name: std::ptr::null(),
            class_name: class.as_ptr(),
            icon_sm: null_mut(),
        };
        if unsafe { RegisterClassExW(&wc) } == 0 {
            eprintln!("[tc312] keytest: RegisterClassExW falhou");
            return;
        }
        let hwnd = unsafe {
            CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0, 0, 0, 0, 0, HWND_MESSAGE as Hwnd, null_mut(), inst, null_mut())
        };
        if hwnd.is_null() {
            eprintln!("[tc312] keytest: CreateWindowExW falhou");
            return;
        }
        HWND.store(hwnd as isize, Ordering::SeqCst);
        // Sem registro até alguém precisar (teste ou cão de guarda já pedidos antes desta linha).
        if needed() && !unsafe { register(hwnd) } {
            eprintln!("[tc312] keytest: RegisterRawInputDevices falhou");
        }
        let mut msg: Msg = unsafe { std::mem::zeroed() };
        while unsafe { GetMessageW(&mut msg, null_mut(), 0, 0) } > 0 {
            unsafe {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }
}
