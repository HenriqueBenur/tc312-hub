import { invoke } from "@tauri-apps/api/core";

export type KeyAction =
  | { kind: "key"; usage: number }
  | { kind: "modifier"; mask: number }
  | { kind: "consumer"; usage: number }
  | { kind: "fn" }
  | { kind: "empty" }
  | { kind: "unknown" };

export interface KeySlot {
  index: number;
  raw: string;
  action: KeyAction;
}

export interface Config {
  mode: number;
  brightness: number;
  speed: number;
  direction: number;
  multicolor: boolean;
  rgb: [number, number, number];
  winLock: boolean;
  raw: string;
}

export interface DeviceState {
  info: string;
  config: Config | null;
  keymap: KeySlot[];
  keymapHex: string;
  ledmap: number[];
  keymapSource: "teclado" | "app";
}

export interface Lighting {
  mode: number;
  brightness: number;
  speed: number;
  direction: number;
  multicolor: boolean;
  rgb: [number, number, number];
  winLock: boolean;
}

export type Step =
  | { type: "combo"; vks: number[] }
  | { type: "text"; text: string }
  | { type: "delay"; ms: number };

export interface Macro {
  slot: number;
  name: string;
  steps: Step[];
  repeat: number;
}

export interface Settings {
  keymapHex: string | null;
  lighting: Lighting | null;
  customColorsHex: string | null;
  macros: Macro[];
  activeProfile: string | null;
  repairRecommended: boolean;
}

export interface HidEvent {
  kind: string;
  data: string;
}

export interface Profile {
  name: string;
  keymapHex: string;
  lighting: Lighting;
  customColorsHex: string | null;
  macros: Macro[];
}

export interface Status {
  connected: boolean;
  officialAppRunning: boolean;
}

export interface WriteResult {
  state: DeviceState;
  backup: string;
}

export interface BackupInfo {
  name: string;
  reason: string;
}

export interface SlotStatus {
  slot: number;
  registered: boolean;
}

export interface WarriorKey {
  vk: number;
  scan: number;
  e0: boolean;
  down: boolean;
}

export const api = {
  getStatus: () => invoke<Status>("get_status"),
  readDevice: () => invoke<DeviceState>("read_device"),
  writeKeymap: (keymapHex: string) => invoke<WriteResult>("write_keymap", { keymapHex }),
  writeLighting: (lighting: Lighting, colorsHex: string | null) =>
    invoke<WriteResult>("write_lighting", { lighting, colorsHex }),
  setWinLock: (on: boolean) => invoke<WriteResult>("set_win_lock", { on }),
  restoreFactory: () => invoke<WriteResult>("restore_factory"),
  getSettings: () => invoke<Settings>("get_settings"),
  factoryKeymapHex: () => invoke<string>("factory_keymap_hex"),
  setMacros: (macros: Macro[]) => invoke<void>("set_macros", { macros }),
  macroStatus: () => invoke<SlotStatus[]>("macro_status"),
  testMacro: (slot: number) => invoke<void>("test_macro", { slot }),
  setKeyTest: (on: boolean) => invoke<void>("set_key_test", { on }),
  listProfiles: () => invoke<string[]>("list_profiles"),
  saveProfile: (profile: Profile) => invoke<void>("save_profile", { profile }),
  loadProfile: (name: string) => invoke<Profile>("load_profile", { name }),
  deleteProfile: (name: string) => invoke<void>("delete_profile", { name }),
  applyProfile: (name: string) => invoke<WriteResult>("apply_profile", { name }),
  listBackups: () => invoke<BackupInfo[]>("list_backups"),
  restoreBackup: (name: string) => invoke<WriteResult>("restore_backup", { name }),
  openDataFolder: () => invoke<void>("open_data_folder"),
};
