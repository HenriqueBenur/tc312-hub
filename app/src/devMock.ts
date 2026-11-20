// Simulação do backend para revisar a interface num navegador comum (só em desenvolvimento,
// quando a página é aberta fora do Tauri). Não existe no app instalado.
import { mockIPC } from "@tauri-apps/api/mocks";

const FACTORY =
  "20002920003520002b200039200200200100200053d0a20120003a20001e200014200004200064200800200054d0a20220003b20001f20001a20001620001d200400200055d0a20320003c20002020000820000720001b200091200056d0a20420003d20002120001520000920000620008b20005fd0a20520003e20002220001720000a20001920002c200060d0a20620003f20002320001c20000b20000520008a200061d0a20720004020002420001820000d20001120008820005cd0a20820004120002520000c20000e20001020009020005d20000020004220002620001220000f20003620400020005e200000200043200027200013200033200037a0010020005730ea0020004420002d20002f200034200038a0110020005a30830120004520002e20003020003220008720100020005b30cd0020004620002a20003120002820200020005020006230e90020004720004920004c20004b20005220005120006320008920004820004a20004d20004e20005920004f200058200085000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

function decode(hex: string) {
  const out = [];
  for (let i = 0; i < 170; i++) {
    const raw = hex.slice(i * 6, i * 6 + 6);
    const [t, a, b] = [0, 2, 4].map((j) => parseInt(raw.slice(j, j + 2), 16));
    let action: Record<string, unknown> = { kind: "unknown" };
    if (t === 0 && a === 0 && b === 0) action = { kind: "empty" };
    else if (t === 0x20 && a === 0) action = { kind: "key", usage: b };
    else if (t === 0x20 && b === 0) action = { kind: "modifier", mask: a };
    else if (t === 0x30) action = { kind: "consumer", usage: a | (b << 8) };
    else if (t === 0xa0 && a === 1) action = { kind: "fn" };
    out.push({ index: i, raw, action });
  }
  return out;
}

export function installDevMock() {
  let keymapHex = FACTORY;
  const settings: Record<string, unknown> = {
    keymapHex: null,
    lighting: null,
    customColorsHex: null,
    macros: [{ slot: 0, name: "Assinatura de e-mail", steps: [{ type: "text", text: "Abraço," }], repeat: 1 }],
    activeProfile: null,
    repairRecommended: false,
    effect: null,
  };
  const state = () => ({
    info: "aa5500000daa50000200000000000000000000000000000f32015000020000000001020300",
    config: { mode: 6, brightness: 4, speed: 2, direction: 0, multicolor: true, rgb: [255, 255, 255], winLock: false, raw: "" },
    keymap: decode(keymapHex),
    keymapHex,
    ledmap: Array.from({ length: 170 }, (_, i) => i),
    keymapSource: "app",
  });
  mockIPC((cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case "get_status":
        return {
          connected: true,
          officialAppRunning: false,
          effect: settings.effect
            ? { state: "rodando", effect: settings.effect, fps: 18.2, message: null }
            : { state: "parado", effect: null, fps: 0, message: null },
        };
      case "start_effect":
        settings.effect = a.effect;
        return null;
      case "stop_effect":
        settings.effect = null;
        return null;
      case "plugin:app|version":
        return "1.1.0";
      case "plugin:updater|check":
        return null;
      case "read_device":
        return state();
      case "factory_keymap_hex":
        return FACTORY;
      case "get_settings":
        return settings;
      case "write_keymap":
        keymapHex = a.keymapHex as string;
        return { state: state(), backup: "mock" };
      case "write_lighting":
        settings.lighting = a.lighting;
        settings.effect = null;
        if (a.colorsHex) settings.customColorsHex = a.colorsHex;
        return { state: state(), backup: "mock" };
      case "macro_status":
        return [];
      case "list_profiles":
        return ["Jogos", "Edição de vídeo"];
      case "list_backups":
        return [{ name: "20261116T061500Z_antes", reason: "antes de gravar teclas" }];
      default:
        return null;
    }
  });
}
