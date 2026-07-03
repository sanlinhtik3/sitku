import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Volume2, Download, Play, Pause, Loader2, Key, CheckCircle, AlertCircle, Mic, Cpu } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BeeFireflyButton } from "@/components/ui/BeeFireflyButton";

interface TTSPanelProps {
  userId: string;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function pcmToWav(pcmData: Uint8Array, sampleRate = 24000, channels = 1, bitsPerSample = 16): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.length, true);

  return new Blob([new Uint8Array(header) as unknown as BlobPart, pcmData as unknown as BlobPart], { type: 'audio/wav' });
}

const VOICES = [
  { value: "Aoede", label: "Aoede — Breezy" },
  { value: "Kore", label: "Kore — Firm" },
  { value: "Puck", label: "Puck — Upbeat" },
  { value: "Charon", label: "Charon — Deep" },
  { value: "Fenrir", label: "Fenrir — Bold" },
  { value: "Leda", label: "Leda — Warm" },
];

const TTS_MODELS = [
  { value: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash TTS", desc: "မြန်ဆန်၊ အရည်အသွေးကောင်း" },
  { value: "gemini-2.5-pro-preview-tts", label: "Gemini 2.5 Pro TTS", desc: "အကောင်းဆုံး အရည်အသွေး" },
];

const SPEAKING_STYLES = [
  { value: "warm", label: "🤗 Warm & Caring", desc: "ပျော့ပျောင်း၊ ဖော်ရွေ" },
  { value: "professional", label: "💼 Professional", desc: "ရှင်းလင်း၊ ယုံကြည်စိတ်ချ" },
  { value: "storyteller", label: "📖 Storyteller", desc: "ဇာတ်လမ်းပြောသလို" },
  { value: "mentor", label: "🧠 Mentor", desc: "ဆရာ/လမ်းညွှန်သူ" },
  { value: "energetic", label: "⚡ Energetic", desc: "တက်ကြွ၊ စိတ်အားထက်သန်" },
];

export function TTSPanel({ userId }: TTSPanelProps) {
  const [text, setText] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash-preview-tts");
  const [voiceName, setVoiceName] = useState("Aoede");
  const [speakingStyle, setSpeakingStyle] = useState("warm");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { data: hasApiKey } = useQuery({
    queryKey: ["tts-api-key-check", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_user_settings")
        .select("gemini_api_key")
        .eq("user_id", userId)
        .single();
      return !!data?.gemini_api_key;
    },
  });

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast.error("စာသားထည့်ပေးပါ");
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setAudioBlob(null);
    }

    try {
      const { data, error } = await supabase.functions.invoke("gemini-tts", {
        body: { text: text.trim(), model, voiceName, speakingStyle },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const { audioContent, mimeType } = data;
      const byteChars = atob(audioContent);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }

      let blob: Blob;
      if (mimeType?.startsWith("audio/L16") || mimeType?.includes("pcm")) {
        const rateMatch = mimeType.match(/rate=(\d+)/);
        const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;
        blob = pcmToWav(byteArray, sampleRate);
      } else {
        blob = new Blob([byteArray as unknown as BlobPart], { type: mimeType || "audio/wav" });
      }
      const url = URL.createObjectURL(blob);
      setAudioBlob(blob);
      setAudioUrl(url);
      toast.success("အသံထုတ်ပြီးပါပြီ!");
    } catch (err: any) {
      console.error("TTS error:", err);
      setErrorMsg(err.message || "အသံထုတ်ရာတွင် အမှားရှိပါသည်");
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play();
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  };

  const handleDownload = () => {
    if (!audioBlob) return;
    const ext = audioBlob.type.includes("wav") ? "wav" : "mp3";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(audioBlob);
    a.download = `tts-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const charPercent = (text.length / 5000) * 100;
  const isNearLimit = text.length > 4000;

  return (
    <div className="flex-1 flex flex-col items-center p-4 sm:p-6 gap-4 max-w-2xl mx-auto w-full">
      {/* API Key Status */}
      <div className="w-full flex justify-end">
        <Badge
          variant="secondary"
          className={`text-xs gap-1.5 ${
            hasApiKey
              ? "bg-green-500/10 text-green-500 border-green-500/20"
              : "bg-amber-500/10 text-amber-500 border-amber-500/20"
          }`}
        >
          {hasApiKey ? <CheckCircle className="h-3 w-3" /> : <Key className="h-3 w-3" />}
          {hasApiKey ? "Gemini Key Active" : "BeeBot Settings မှာ Key ထည့်ပါ"}
        </Badge>
      </div>

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center backdrop-blur-sm">
          <Volume2 className="h-8 w-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Text-to-Speech</h3>
        <p className="text-xs text-muted-foreground">Gemini AI TTS — Premium Voice Generation</p>
      </div>

      {/* Model Selector */}
      <div className="w-full space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5" /> TTS Model
        </label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl focus:border-amber-500/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TTS_MODELS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label} — {m.desc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Voice Selector */}
      <div className="w-full space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Mic className="h-3.5 w-3.5" /> Voice
        </label>
        <Select value={voiceName} onValueChange={setVoiceName}>
          <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl focus:border-amber-500/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOICES.map((v) => (
              <SelectItem key={v.value} value={v.value}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Speaking Style Selector */}
      <div className="w-full space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Volume2 className="h-3.5 w-3.5" /> Speaking Style
        </label>
        <Select value={speakingStyle} onValueChange={setSpeakingStyle}>
          <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl focus:border-amber-500/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEAKING_STYLES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label} — {s.desc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Text Input */}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="ဒီမှာ စာသား ရိုက်ထည့်ပါ..."
        className="w-full min-h-[140px] bg-muted/30 border-border/50 rounded-xl text-base resize-none focus:border-amber-500/50 focus:ring-amber-500/20"
        maxLength={5000}
      />
      <div className="w-full flex justify-between items-center -mt-3">
        <span className={`text-[10px] font-mono ${isNearLimit ? "text-amber-500 font-semibold" : "text-muted-foreground"}`}>
          {text.length.toLocaleString()} / 5,000
        </span>
        {isNearLimit && (
          <span className="text-[10px] text-amber-500">⚠ Limit နီးနေပါပြီ</span>
        )}
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <Alert variant="destructive" className="w-full rounded-xl border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{errorMsg}</AlertDescription>
        </Alert>
      )}

      {/* Generate Button */}
      <BeeFireflyButton>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim()}
          className="gap-2 px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/20 rounded-xl text-base font-semibold"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              အသံထုတ်နေသည်...
            </>
          ) : (
            <>
              <Volume2 className="h-5 w-5" />
              အသံထုတ်ရန်
            </>
          )}
        </Button>
      </BeeFireflyButton>

      {/* Waveform Loading Animation */}
      {isGenerating && (
        <div className="flex items-center justify-center gap-1 h-10">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-gradient-to-t from-amber-500 to-orange-400"
              style={{
                height: `${12 + Math.random() * 24}px`,
                animation: `pulse 0.8s ease-in-out ${i * 0.07}s infinite alternate`,
              }}
            />
          ))}
        </div>
      )}

      {/* Audio Player */}
      {audioUrl && (
        <div className="w-full rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5 backdrop-blur-sm p-4 space-y-3">
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { setIsPlaying(false); setProgress(0); }}
          />

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="h-10 w-10 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-500"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>

            <div
              className="flex-1 h-2 bg-muted/50 rounded-full cursor-pointer overflow-hidden"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>

            <span className="text-xs text-muted-foreground font-mono min-w-[70px] text-right">
              {duration ? `${formatTime((progress / 100) * duration)} / ${formatTime(duration)}` : "0:00"}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="w-full gap-2 border-amber-500/20 hover:bg-amber-500/10 text-amber-500"
          >
            <Download className="h-4 w-4" />
            Download Audio
          </Button>
        </div>
      )}
    </div>
  );
}
