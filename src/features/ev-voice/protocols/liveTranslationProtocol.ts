export const EV_LIVE_TRANSLATE_MODEL = "models/gemini-3.5-live-translate-preview";

export interface EvLiveTranslationConfig {
  targetLanguageCode: string;
  echoTargetLanguage: boolean;
}

export interface EvLiveTranslationState extends EvLiveTranslationConfig {
  active: boolean;
  targetLanguageName: string;
}

export type EvLiveTranslationCommand =
  | { kind: "start"; config: EvLiveTranslationConfig; targetLanguageName: string }
  | { kind: "stop" }
  | null;

// Gemini 3.5 Live Translate's documented language set. Display names are
// resolved at runtime so English language names work without maintaining a
// second static label table.
export const EV_LIVE_TRANSLATE_LANGUAGE_CODES = Object.freeze([
  "af", "ak", "sq", "am", "ar", "hy", "az", "eu", "be", "bn", "bg", "my",
  "ca", "zh-Hans", "zh-Hant", "hr", "cs", "da", "nl", "en", "et", "fil", "fi",
  "fr", "gl", "ka", "de", "el", "gu", "ha", "he", "hi", "hu", "is", "id", "it",
  "ja", "jv", "kn", "kk", "km", "rw", "ko", "lo", "lv", "lt", "mk", "ms", "ml",
  "mr", "mn", "ne", "no", "nb", "fa", "pl", "pt-BR", "pt-PT", "pa", "ro", "ru",
  "sr", "sd", "si", "sk", "sl", "es", "su", "sw", "sv", "ta", "te", "th", "tr",
  "uk", "ur", "uz", "vi", "zu",
] as const);

const LANGUAGE_ALIASES: Record<string, string> = {
  burmese: "my", myanmar: "my", "မြန်မာ": "my", "မြန်မာလို": "my",
  english: "en", "အင်္ဂလိပ်": "en", "အင်္ဂလိပ်လို": "en",
  thai: "th", "ထိုင်း": "th", "ထိုင်းလို": "th",
  japanese: "ja", "ဂျပန်": "ja", "ဂျပန်လို": "ja",
  korean: "ko", "ကိုရီးယား": "ko", "ကိုရီးယားလို": "ko",
  french: "fr", "ပြင်သစ်": "fr", "ပြင်သစ်လို": "fr",
  german: "de", "ဂျာမန်": "de", "ဂျာမန်လို": "de",
  spanish: "es", "စပိန်": "es", "စပိန်လို": "es",
  vietnamese: "vi", "ဗီယက်နမ်": "vi", "ဗီယက်နမ်လို": "vi",
  hindi: "hi", "ဟိန္ဒီ": "hi", "ဟိန္ဒီလို": "hi",
  "simplified chinese": "zh-Hans", "chinese simplified": "zh-Hans", "တရုတ်": "zh-Hans", "တရုတ်လို": "zh-Hans",
  "traditional chinese": "zh-Hant", "chinese traditional": "zh-Hant",
  portuguese: "pt-BR", russian: "ru", italian: "it", arabic: "ar",
};

const STOP_PATTERN = /(?:\b(?:stop|end|exit|disable|turn\s+off|close)\b[^\n]{0,32}\b(?:live\s+)?(?:translate|translation|interpreter)\b)|(?:(?:live\s+)?(?:translate|translation|interpreter)\b[^\n]{0,32}\b(?:stop|end|exit|off)\b)|(?:ဘာသာပြန်(?:တာ|ခြင်း|စနစ်|မုဒ်)?(?:ကို)?\s*(?:ရပ်|ပိတ်|ဆုံး|မလုပ်တော့))|(?:(?:ရပ်|ပိတ်|ဆုံး)\s*(?:လိုက်|ပေး)?[^\n]{0,20}ဘာသာပြန်)/iu;
const EXPLICIT_START_PATTERN = /(?:\b(?:start|begin|enable|open|turn\s+on)\b[^\n]{0,40}\b(?:live|real[ -]?time)\s+(?:translate|translation|interpreter)\b)|(?:\b(?:live|real[ -]?time)\s+(?:translate|translation|interpreter)\b)|(?:တိုက်ရိုက်[^\n]{0,20}ဘာသာပြန်)|(?:live\s*(?:translate|translation)[^\n]{0,30}(?:လုပ်|စ|ဖွင့်|သုံး|ပေး))/iu;

function languageNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const [alias, code] of Object.entries(LANGUAGE_ALIASES)) names.set(alias.toLocaleLowerCase(), code);
  try {
    const display = new Intl.DisplayNames(["en"], { type: "language" });
    for (const code of EV_LIVE_TRANSLATE_LANGUAGE_CODES) {
      const label = display.of(code);
      if (label) names.set(label.toLocaleLowerCase(), code);
    }
  } catch { /* Intl.DisplayNames is optional in older WebViews. */ }
  return names;
}

const LANGUAGE_NAMES = languageNames();
const SUPPORTED_CODES = new Set<string>(EV_LIVE_TRANSLATE_LANGUAGE_CODES);

export function normalizeEvTranslationLanguage(input: string): { code: string; name: string } | null {
  const candidate = input.trim();
  if (!candidate) return null;
  const code = EV_LIVE_TRANSLATE_LANGUAGE_CODES.find((item) => item.toLocaleLowerCase() === candidate.toLocaleLowerCase());
  if (code) return { code, name: displayLanguage(code) };
  const aliased = LANGUAGE_NAMES.get(candidate.toLocaleLowerCase());
  return aliased && SUPPORTED_CODES.has(aliased) ? { code: aliased, name: displayLanguage(aliased) } : null;
}

export function parseEvLiveTranslationCommand(text: string, active = false): EvLiveTranslationCommand {
  const normalized = text.trim().replace(/[.!?။၊]+$/gu, "");
  if (!normalized) return null;
  if (active && STOP_PATTERN.test(normalized)) return { kind: "stop" };
  if (!EXPLICIT_START_PATTERN.test(normalized)) return null;

  const lower = normalized.toLocaleLowerCase();
  const aliases = [...LANGUAGE_NAMES.entries()].sort(([left], [right]) => right.length - left.length);
  const targetSegment = lower.match(/\b(?:to|into)\s+(.{2,48})$/iu)?.[1] || "";
  const matched = aliases.find(([name]) => targetSegment.includes(name))
    || aliases.find(([name]) => lower.includes(name));
  if (!matched) {
    const codeMatch = lower.match(/(?:\bto|\binto|target(?:\s+language)?|ဘာသာ)\s*[:=-]?\s*([a-z]{2,3}(?:-[a-z]{2,4})?)\b/i);
    if (!codeMatch) return null;
    const language = normalizeEvTranslationLanguage(codeMatch[1]);
    if (!language) return null;
    return { kind: "start", config: { targetLanguageCode: language.code, echoTargetLanguage: false }, targetLanguageName: language.name };
  }
  const language = normalizeEvTranslationLanguage(matched[1]);
  return language
    ? { kind: "start", config: { targetLanguageCode: language.code, echoTargetLanguage: false }, targetLanguageName: language.name }
    : null;
}

export function displayLanguage(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}
