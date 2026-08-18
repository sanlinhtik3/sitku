import {
  AFFECTIVE_EV_LIVE_MODEL,
  ANALYTICAL_EV_LIVE_MODEL,
  DEFAULT_EV_LIVE_MODEL,
  EV_LIVE_MODEL_PROFILES,
  isSupportedEvLiveModel,
} from "./liveModelProfiles";

const KEY_STORE = "beebot-gemini-key";
const KEY_PRESENT_STORE = "beebot-gemini-key-present";
export const TTS_VOICE = "Kore";
const getStore = (key: string): string | null => typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
const setStore = (key: string, val: string): void => { if (typeof localStorage !== "undefined") localStorage.setItem(key, val); };
const removeStore = (key: string): void => { if (typeof localStorage !== "undefined") localStorage.removeItem(key); };
const desktopSecrets = () => typeof window !== "undefined" ? window.beebotDesktop : undefined;
const announceKeyChange = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("beebot-jarvis-key-changed")); };

// User-switchable models (Settings). For Live API, we must use models that support BidiGenerateContent.
const BRAIN_STORE = "beebot-ev-live-model";
const ADAPTIVE_VOICE_MIGRATION_STORE = "beebot-ev-adaptive-voice-v1";
const LEGACY_BRAIN_STORE = "beebot-jarvis-brain-model";
export const evModels = {
  brainOptions: EV_LIVE_MODEL_PROFILES,
  brain: () => {
    const current = getStore(BRAIN_STORE);
    // Earlier builds silently defaulted to the analytical 3.1 profile. Move
    // that legacy default once so the upgraded E.V actually uses affective
    // delivery; a later explicit profile choice is always preserved.
    if (getStore(ADAPTIVE_VOICE_MIGRATION_STORE) !== "1") {
      setStore(ADAPTIVE_VOICE_MIGRATION_STORE, "1");
      if (!current || current === ANALYTICAL_EV_LIVE_MODEL) {
        setStore(BRAIN_STORE, AFFECTIVE_EV_LIVE_MODEL);
        return AFFECTIVE_EV_LIVE_MODEL;
      }
    }
    if (current && isSupportedEvLiveModel(current)) return current;
    // Old experimental model IDs are intentionally not carried into the new E.V runtime.
    if (getStore(LEGACY_BRAIN_STORE)) setStore(BRAIN_STORE, DEFAULT_EV_LIVE_MODEL);
    return DEFAULT_EV_LIVE_MODEL;
  },
  setBrain: (id: string) => {
    setStore(ADAPTIVE_VOICE_MIGRATION_STORE, "1");
    setStore(BRAIN_STORE, isSupportedEvLiveModel(id) ? id : DEFAULT_EV_LIVE_MODEL);
  },
};

export const geminiKey = {
  EVENT: "beebot-jarvis-key-changed",
  get: () => {
    if (desktopSecrets()?.jarvisKeyStatus) return getStore(KEY_PRESENT_STORE) === "1" || Boolean(getStore(KEY_STORE)) ? "desktop-secure-key" : "";
    return getStore(KEY_STORE) || import.meta.env.VITE_GEMINI_API_KEY || "";
  },
  set: async (value: string) => {
    const key = value.trim();
    const desktop = desktopSecrets();
    if (desktop?.jarvisSetKey) {
      const status = await desktop.jarvisSetKey(key);
      setStore(KEY_PRESENT_STORE, status.hasKey ? "1" : "0");
      removeStore(KEY_STORE);
    } else if (key) setStore(KEY_STORE, key);
    else removeStore(KEY_STORE);
    announceKeyChange();
  },
  refresh: async () => {
    const desktop = desktopSecrets();
    if (!desktop?.jarvisKeyStatus) return Boolean(getStore(KEY_STORE) || import.meta.env.VITE_GEMINI_API_KEY);
    const legacy = getStore(KEY_STORE)?.trim();
    if (legacy && desktop.jarvisSetKey) await desktop.jarvisSetKey(legacy);
    const status = await desktop.jarvisKeyStatus();
    setStore(KEY_PRESENT_STORE, status.hasKey ? "1" : "0");
    if (status.hasKey) removeStore(KEY_STORE);
    announceKeyChange();
    return status.hasKey;
  },
};

// Wake word — opt-in, hands-free. While the orb is CLOSED, the browser recognizer listens
// for "Jarvis" and opens it. ponytail: reuses Web Speech (zero deps); ceiling = always-on
// cloud STT (battery/privacy) — swap for on-device openWakeWord if that becomes a problem.
const WAKE_STORE = "beebot-ev-wake";
const LEGACY_WAKE_STORE = "beebot-jarvis-wake";
export const evWakeWord = {
  EVENT: "beebot-ev-wake-changed",
  get: () => (getStore(WAKE_STORE) ?? getStore(LEGACY_WAKE_STORE)) === "1",
  set: (on: boolean) => {
    setStore(WAKE_STORE, on ? "1" : "0");
    if (typeof window !== "undefined") window.dispatchEvent(new Event("beebot-ev-wake-changed"));
  },
};
export const isWakePhrase = (text: string) => /\b(hey\s+|ok\s+|okay\s+)?(e[.\s-]?v|ev|jarvis)\b/i.test(text);

// JARVIS is OFF by default (under dev — must not ship enabled). Opt-in via Settings.
const ENABLED_STORE = "beebot-ev-enabled";
const LEGACY_ENABLED_STORE = "beebot-jarvis-enabled";
export const evEnabled = {
  EVENT: "beebot-ev-enabled-changed",
  get: () => (getStore(ENABLED_STORE) ?? getStore(LEGACY_ENABLED_STORE)) === "1",
  set: (on: boolean) => {
    setStore(ENABLED_STORE, on ? "1" : "0");
    if (typeof window !== "undefined") window.dispatchEvent(new Event("beebot-ev-enabled-changed"));
  },
};

// Unary compatibility remains isolated from E.V Live. It is used only by old non-live helpers.
export const jarvisModels = {
  brainOptions: [
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  brain: () => getStore(LEGACY_BRAIN_STORE) || getStore("apex_preferred_model") || "gemini-2.5-flash",
  setBrain: (id: string) => setStore(LEGACY_BRAIN_STORE, id),
};
export const jarvisWakeWord = evWakeWord;
export const jarvisEnabled = evEnabled;
