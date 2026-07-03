import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export type VoiceLanguage = "en-US" | "my-MM";

export interface LanguageOption {
  code: VoiceLanguage;
  label: string;
  shortLabel: string;
  supported: boolean;
  warning?: string;
}

export const VOICE_LANGUAGES: LanguageOption[] = [
  { code: "en-US", label: "English (US)", shortLabel: "EN", supported: true },
  {
    code: "my-MM",
    label: "မြန်မာ (Myanmar)",
    shortLabel: "MY",
    supported: false,
    warning: "⚠️ Browser မှာ Myanmar voice recognition ကို အပြည့်အဝ support မလုပ်သေးပါ။"
  },
];

export const getSavedVoiceLanguage = (): VoiceLanguage => {
  if (typeof window === "undefined") return "en-US";
  const saved = localStorage.getItem("beebot-voice-language");
  if (saved === "my-MM" || saved === "en-US") return saved;
  return "en-US";
};

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>(getSavedVoiceLanguage);
  const [showLanguageSubmenu, setShowLanguageSubmenu] = useState(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentLang = VOICE_LANGUAGES.find((l) => l.code === voiceLanguage) || VOICE_LANGUAGES[0];

  const handleLanguageChange = useCallback((lang: VoiceLanguage) => {
    const langOption = VOICE_LANGUAGES.find((l) => l.code === lang);
    if (langOption?.warning) {
      toast.warning(langOption.warning, { duration: 5000 });
    }
    setVoiceLanguage(lang);
    localStorage.setItem("beebot-voice-language", lang);
    setShowLanguageSubmenu(false);
  }, []);

  const {
    isSupported: isSpeechSupported,
    isListening,
    interimTranscript,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({
    language: voiceLanguage,
    continuous: true,
    interimResults: true,
    onResult: (text, isFinal) => {
      // Reset silence timer on any result
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (isFinal) {
        onTranscript(text);
      }
    },
    onEnd: () => {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    },
  });

  const handleVoiceToggle = useCallback(() => {
    if (isListening) {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      stopListening();
    } else {
      startListening();
      // Auto-stop after 30s of silence
      silenceTimerRef.current = setTimeout(() => {
        stopListening();
        toast.info("Voice input stopped — no speech detected", { duration: 3000 });
      }, 30_000);
    }
  }, [isListening, startListening, stopListening]);

  return {
    voiceLanguage,
    currentLang,
    showLanguageSubmenu,
    setShowLanguageSubmenu,
    handleLanguageChange,
    isSpeechSupported,
    isListening,
    interimTranscript,
    handleVoiceToggle,
  };
}
