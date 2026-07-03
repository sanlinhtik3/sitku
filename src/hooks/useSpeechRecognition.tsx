import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";

interface UseSpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

// Type definitions for Web Speech API
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onspeechend: (() => void) | null;
  onnomatch: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone permission denied. Please allow microphone access.",
  "no-speech": "No speech detected. Please try speaking again.",
  "network": "Network error. Please check your connection.",
  "aborted": "Speech recognition was stopped.",
  "audio-capture": "No microphone found. Please connect a microphone.",
  "service-not-allowed": "Speech recognition service not allowed.",
};

const ERROR_MESSAGES_MY: Record<string, string> = {
  "not-allowed": "Microphone ခွင့်ပြုချက် ပိတ်ထားပါတယ်။ ခွင့်ပြုပေးပါ။",
  "no-speech": "အသံမကြားရပါ။ ထပ်ပြောပါ။",
  "network": "Network error ဖြစ်ပါတယ်။",
  "aborted": "Recording ရပ်လိုက်ပါပြီ။",
  "audio-capture": "Microphone မတွေ့ပါ။",
  "service-not-allowed": "Speech recognition service ကို ခွင့်မပြုပါ။",
};

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const {
    language = "en-US", // Default to English, also supports "my-MM" for Burmese
    continuous = true,
    interimResults = true,
    onResult,
    onError,
    onEnd,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isManualStopRef = useRef(false);

  // Check browser support
  const isSupported = typeof window !== "undefined" && 
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Initialize speech recognition
  const initRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();

    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("[Speech] Recognition started");
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      console.log("[Speech] Recognition ended");
      setIsListening(false);
      
      // If not manually stopped, this might be auto-end after silence
      if (!isManualStopRef.current && continuous) {
        // Auto-restart was happening but we want clean stop
        console.log("[Speech] Auto-ended (silence or done)");
      }
      
      onEnd?.();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let currentInterim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcriptText = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcriptText;
        } else {
          currentInterim += transcriptText;
        }
      }

      if (finalTranscript) {
        setTranscript((prev) => prev + finalTranscript);
        setInterimTranscript("");
        onResult?.(finalTranscript, true);
      } else if (currentInterim) {
        setInterimTranscript(currentInterim);
        onResult?.(currentInterim, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("[Speech] Error:", event.error);
      
      const errorKey = event.error;
      const errorMessage = ERROR_MESSAGES[errorKey] || `Speech error: ${event.error}`;
      const errorMessageMy = ERROR_MESSAGES_MY[errorKey] || errorMessage;
      
      // Don't show error for "aborted" when manually stopped
      if (errorKey === "aborted" && isManualStopRef.current) {
        return;
      }
      
      // Don't treat "no-speech" as a critical error during continuous listening
      if (errorKey === "no-speech" && continuous) {
        console.log("[Speech] No speech detected, continuing...");
        return;
      }
      
      setError(errorMessage);
      setIsListening(false);
      
      // Show toast for critical errors
      if (errorKey === "not-allowed" || errorKey === "audio-capture") {
        toast.error(errorMessageMy, {
          description: errorMessage,
        });
      }
      
      onError?.(errorMessage);
    };

    recognition.onnomatch = () => {
      console.log("[Speech] No match found");
    };

    return recognition;
  }, [isSupported, language, continuous, interimResults, onResult, onError, onEnd]);

  // Start listening
  const start = useCallback(() => {
    if (!isSupported) {
      const msg = "Voice input is not supported in your browser. Please use Chrome or Safari.";
      setError(msg);
      toast.error("Browser not supported", {
        description: msg,
      });
      onError?.(msg);
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    isManualStopRef.current = false;
    setTranscript("");
    setInterimTranscript("");
    setError(null);

    const recognition = initRecognition();
    if (recognition) {
      recognitionRef.current = recognition;
      try {
        recognition.start();
        console.log("[Speech] Starting recognition...");
      } catch (e) {
        console.error("[Speech] Start error:", e);
        setError("Failed to start voice recognition");
      }
    }
  }, [isSupported, initRecognition, onError]);

  // Stop listening
  const stop = useCallback(() => {
    isManualStopRef.current = true;
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      console.log("[Speech] Manually stopped");
    }
    
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  // Reset state
  const reset = useCallback(() => {
    stop();
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}
