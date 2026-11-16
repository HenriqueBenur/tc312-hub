//! "Testar teclas": mostra o que o Warrior realmente envia ao Windows.
//!
//! Uma janela invisível (message-only) recebe Raw Input de todos os teclados com
//! RIDEV_INPUTSINK; só os eventos cujo dispositivo é VID_320F&PID_5078 são repassados
//! à interface (evento "warrior-key"), e só enquanto o teste estiver ligado.
//! O teclado Logitech é ignorado. Nada é bloqueado nem alterado: é só observação.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();
static ENABLED: AtomicBool = AtomicBool::new(false);

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
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
    }

    const WM_INPUT: u32 = 0x00FF;
    const RID_INPUT: u32 = 0x1000_0003;
    const RIDI_DEVICENAME: u32 = 0x2000_0007;
    const RIDEV_INPUTSINK: u32 = 0x100;
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

    unsafe extern "system" fn wndproc(h: Hwnd, m: u32, w: usize, l: isize) -> isize {
        if m == WM_INPUT && ENABLED.load(Ordering::SeqCst) {
            unsafe { handle_input(l) };
        }
        unsafe { DefWindowProcW(h, m, w, l) }
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
        match header.kind {
            RIM_TYPEKEYBOARD => {
                let kb = unsafe { &*(body.as_ptr() as *const RawKeyboard) };
                let ev = KeyEvent { vk: kb.vkey, scan: kb.make_code, e0: kb.flags & 0x2 != 0, down: kb.flags & 0x1 == 0 };
                let _ = app.emit("warrior-key", ev);
            }
            RIM_TYPEMOUSE if body.len() >= 24 => {
                let data = crate::protocol::hex(&body[..24]);
                let _ = app.emit("warrior-hid", HidEvent { kind: "mouse".into(), data });
            }
            RIM_TYPEHID if body.len() >= 8 => {
                let size = u32::from_le_bytes([body[0], body[1], body[2], body[3]]) as usize;
                let count = u32::from_le_bytes([body[4], body[5], body[6], body[7]]) as usize;
                let end = (8 + size * count).min(body.len());
                let raw = &body[8..end];
                let kind = if name.contains("COL03") || raw.first() == Some(&0x03) { "mídia" } else { "sistema" };
                let _ = app.emit("warrior-hid", HidEvent { kind: kind.into(), data: crate::protocol::hex(raw) });
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
        // teclado, mouse, mídia (consumer) e controle de sistema
        let rids = [
            RawInputDevice { usage_page: 0x01, usage: 0x06, flags: RIDEV_INPUTSINK, target: hwnd },
            RawInputDevice { usage_page: 0x01, usage: 0x02, flags: RIDEV_INPUTSINK, target: hwnd },
            RawInputDevice { usage_page: 0x0C, usage: 0x01, flags: RIDEV_INPUTSINK, target: hwnd },
            RawInputDevice { usage_page: 0x01, usage: 0x80, flags: RIDEV_INPUTSINK, target: hwnd },
        ];
        if unsafe { RegisterRawInputDevices(rids.as_ptr(), rids.len() as u32, std::mem::size_of::<RawInputDevice>() as u32) } == 0 {
            eprintln!("[tc312] keytest: RegisterRawInputDevices falhou");
            return;
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
