import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Send, Square, Loader2, Clock, Plus, AudioLines, MicOff, FileCode2, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ImagePreview } from "./ImagePreview";
import { toast } from "sonner";
import { useImageAttachments, ALLOWED_FILE_TYPES, isPdfFile } from "./chat-input/useImageAttachments";
import { useVoiceInput } from "./chat-input/VoiceInput";
import { BrainMenu } from "./chat-input/BrainMenu";
import { ConnectorsPopover } from "./chat-input/ConnectorsPopover";
import { PromptTemplates } from "./PromptTemplates";
import { SlashCommandMenu, type SlashCommand } from "./chat-input/SlashCommandMenu";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";

interface ChatInputProps {
  onSend: (content: string, attachments?: {type: 'image' | 'file';base64: string;mime_type: string;file_name: string;}[]) => Promise<void>;
  isStreaming: boolean;
  onCancel: () => void;
  disabled?: boolean;
  cooldownUntil?: number | null;
  isAdmin?: boolean;
  tierLevel?: number;
  currentModel?: string;
  onModelChange?: (modelId: string) => void;
  enableGoogleProvider?: boolean;
  enableAnthropicProvider?: boolean;
  hasAnthropicKey?: boolean;
  hasSystemGoogleKey?: boolean;
  enabledGeminiModels?: string[];
  allowPersonalKey?: boolean;
  hasPersonalKey?: boolean;
  apiSource?: 'personal' | 'system';
  onApiSourceChange?: (source: 'personal' | 'system') => void;
  onOpenApiKeyDialog?: (tab?: string) => void;
  // Connector callbacks
  onOpenTavily?: () => void;
  onOpenTelegram?: () => void;
  onOpenSoulEditor?: () => void;
  onOpenFacebook?: () => void;
  onOpenNotion?: () => void;
  hasTavilyKey?: boolean;
  hasTelegramLink?: boolean;
  hasSoulConfig?: boolean;
  hasOpenrouterKey?: boolean;
  hasXaiKey?: boolean;
  hasFacebookPages?: boolean;
  hasNotionKey?: boolean;
  disabledConnectors?: string[];
  onToggleConnector?: (id: string, enabled: boolean) => void;
  // Connectors dialog hash-driven state
  connectorsDialogOpen?: boolean;
  onConnectorsDialogOpenChange?: (open: boolean) => void;
  connectorsTab?: "apps" | "custom-api";
  onConnectorsTabChange?: (tab: "apps" | "custom-api") => void;
  placeholder?: string;
  promptSuggestions?: string[];
}

const MAX_MESSAGE_LENGTH = 100000;
const ADMIN_MAX_MESSAGE_LENGTH = 800000;
const SEND_DEBOUNCE_MS = 500;
const MAX_CODE_FILE_SIZE = 500 * 1024;

const CODE_FILE_EXTENSIONS: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', jsx: 'jsx', tsx: 'tsx',
  py: 'python', rb: 'ruby', go: 'go', java: 'java',
  c: 'c', cpp: 'cpp', h: 'cpp', rs: 'rust',
  cs: 'csharp', php: 'php', kt: 'kotlin', swift: 'swift',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', vue: 'vue', svelte: 'svelte',
  md: 'markdown', txt: 'text', csv: 'csv',
  json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml', toml: 'toml',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  env: 'bash', gitignore: 'text', dockerfile: 'dockerfile',
};

function getCodeFileLanguage(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return CODE_FILE_EXTENSIONS[ext] || null;
}

interface CodeAttachment {
  id: string;
  name: string;
  content: string;
  language: string;
}

export function ChatInput({
  onSend, isStreaming, onCancel, disabled, cooldownUntil, isAdmin = false,
  tierLevel = 0, currentModel = 'gemini-3.5-flash', onModelChange,
  enableGoogleProvider = true, enableAnthropicProvider = false, hasAnthropicKey = false,
  hasSystemGoogleKey = false,
  enabledGeminiModels,
  allowPersonalKey = true, hasPersonalKey = false,
  apiSource = 'personal', onApiSourceChange,
  onOpenApiKeyDialog,
  onOpenTavily, onOpenTelegram, onOpenSoulEditor, onOpenFacebook, onOpenNotion,
  hasTavilyKey = false, hasTelegramLink = false, hasSoulConfig = false,
  hasOpenrouterKey = false, hasXaiKey = false, hasFacebookPages = false, hasNotionKey = false,
  disabledConnectors = [], onToggleConnector,
  connectorsDialogOpen, onConnectorsDialogOpenChange,
  connectorsTab, onConnectorsTabChange,
  placeholder, promptSuggestions,
}: ChatInputProps) {
  const { agentRuntime } = useRepositories();
  const [message, setMessage] = useState(() => {
    try {
      const prefill = sessionStorage.getItem("sitku_prefill") || sessionStorage.getItem("pututu_prefill") || sessionStorage.getItem("beebot_prefill");
      if (prefill) { sessionStorage.removeItem("sitku_prefill"); sessionStorage.removeItem("pututu_prefill"); sessionStorage.removeItem("beebot_prefill"); return prefill; }
    } catch {}
    return sessionStorage.getItem("sitku-draft") || sessionStorage.getItem("pututu-draft") || sessionStorage.getItem("beebot-draft") || "";
  });
  const [isSending, setIsSending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [templateFilter, setTemplateFilter] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [codeAttachments, setCodeAttachments] = useState<CodeAttachment[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSendTimeRef = useRef<number>(0);
  const warmupFiredRef = useRef(false);
  const dragCounterRef = useRef(0);

  const {
    images, fileInputRef, handleImageSelect, handleRemoveImage, imageToBase64,
    clearImages, openFilePicker, maxImages,
  } = useImageAttachments();

  const {
    voiceLanguage, currentLang, showLanguageSubmenu, setShowLanguageSubmenu,
    handleLanguageChange, isSpeechSupported, isListening, interimTranscript, handleVoiceToggle,
  } = useVoiceInput((text) => {
    setMessage((prev) => (prev ? prev + " " + text : text).trim());
  });

  // Cooldown timer
  useEffect(() => {
    if (!cooldownUntil) { setCooldownSeconds(0); return; }
    const updateCooldown = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownSeconds(remaining);
    };
    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const isCoolingDown = cooldownSeconds > 0;

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 480) + "px";
    }
  }, [message]);

  // Persist draft to sessionStorage
  useEffect(() => {
    if (message) sessionStorage.setItem("sitku-draft", message);
    else sessionStorage.removeItem("sitku-draft");
  }, [message]);

  // External prefill (e.g. AgentConsultant suggested prompts)
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        setMessage(detail);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    window.addEventListener("beebot:prefill", onPrefill as EventListener);
    return () => window.removeEventListener("beebot:prefill", onPrefill as EventListener);
  }, []);

  // Virtual keyboard handling — translate the composer above the keyboard.
  const isMobile = useIsMobile();
  const { keyboardHeight } = useKeyboardInset();

  const handleSend = useCallback(async () => {
    const now = Date.now();
    if (now - lastSendTimeRef.current < SEND_DEBOUNCE_MS) return;
    if ((!message.trim() && images.length === 0 && codeAttachments.length === 0) || isStreaming || disabled || isSending || isCoolingDown) return;

    lastSendTimeRef.current = now;
    setIsSending(true);
    navigator.vibrate?.(5);

    let content = message.trim();
    if (codeAttachments.length > 0) {
      const codeBlocks = codeAttachments.map(ca =>
        `\`\`\`${ca.language}\n// ${ca.name}\n${ca.content}\n\`\`\``
      ).join('\n\n');
      content = content ? `${content}\n\n${codeBlocks}` : codeBlocks;
    }

    try {
      let attachments: {type: 'image' | 'file';base64: string;mime_type: string;file_name: string;}[] | undefined;
      if (images.length > 0) {
        attachments = await Promise.all(
          images.map(async (img) => ({
            type: (isPdfFile(img.file) ? 'file' : 'image') as 'image' | 'file',
            base64: await imageToBase64(img.file),
            mime_type: img.file.type,
            file_name: img.file.name
          }))
        );
      }
      setMessage("");
      sessionStorage.removeItem("sitku-draft");
      clearImages();
      setCodeAttachments([]);
      await onSend(content, attachments);
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  }, [message, images, codeAttachments, isStreaming, disabled, isSending, isCoolingDown, onSend, imageToBase64, clearImages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Esc while streaming = stop the response (Claude.ai / ChatGPT pattern)
    if (e.key === "Escape" && isStreaming) { e.preventDefault(); onCancel(); return; }
    if (e.key === "Escape" && (showTemplates || showSlashMenu)) { setShowTemplates(false); setShowSlashMenu(false); setMessage(""); return; }
    if (showSlashMenu && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab")) return; // let SlashCommandMenu handle
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showTemplates || showSlashMenu) { setShowTemplates(false); setShowSlashMenu(false); }
      if (isStreaming) {
        toast.info("BeeBot is still responding. Press Stop (or Esc) first.", { duration: 2500 });
        return;
      }
      handleSend();
    }
  };

  // ⌘K / Ctrl+K global shortcut to focus input and open slash menu
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setMessage("/");
        setShowSlashMenu(true);
        setTemplateFilter("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const maxLength = isAdmin ? ADMIN_MAX_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH;
    if (value.length <= maxLength) setMessage(value);

    if (value === "/" || (value.startsWith("/") && value.length <= 20 && !value.includes(" "))) {
      setTemplateFilter(value.slice(1));
      setShowSlashMenu(true);
      setShowTemplates(false);
    } else if ((showSlashMenu || showTemplates) && !value.startsWith("/")) {
      setShowSlashMenu(false);
      setShowTemplates(false);
    } else if ((showSlashMenu || showTemplates) && value.startsWith("/")) {
      setTemplateFilter(value.slice(1));
    }

    if (!warmupFiredRef.current && value.length > 0) {
      warmupFiredRef.current = true;
      agentRuntime.warmup().catch(() => {});
      setTimeout(() => { warmupFiredRef.current = false; }, 300_000);
    }
  };

  const handleTemplateSelect = (prompt: string) => {
    setMessage(prompt);
    setShowTemplates(false);
    setTemplateFilter("");
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const topicIdx = prompt.indexOf("{topic}");
        if (topicIdx !== -1) {
          inputRef.current.setSelectionRange(topicIdx, topicIdx + 7);
        }
      }
    }, 50);
  };

  // Drag-and-Drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const processDroppedFiles = useCallback(async (files: File[]) => {
    const imageFiles: File[] = [];
    const codeFiles: File[] = [];

    for (const file of files) {
      const language = getCodeFileLanguage(file.name);
      if (language !== null || file.type.startsWith('text/')) {
        codeFiles.push(file);
      } else if (ALLOWED_FILE_TYPES.includes(file.type)) {
        imageFiles.push(file);
      } else {
        toast.error(`${file.name}: Unsupported file type`);
      }
    }

    if (imageFiles.length > 0) {
      const dt = new DataTransfer();
      imageFiles.forEach(f => dt.items.add(f));
      handleImageSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
    }

    for (const file of codeFiles) {
      if (file.size > MAX_CODE_FILE_SIZE) {
        toast.error(`${file.name}: File too large (max 500KB)`);
        continue;
      }
      const language = getCodeFileLanguage(file.name) || 'text';
      try {
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string || '');
          reader.onerror = reject;
          reader.readAsText(file);
        });
        setCodeAttachments(prev => [...prev, {
          id: crypto.randomUUID(),
          name: file.name,
          content,
          language,
        }]);
        toast.success(`${file.name} attached`);
      } catch {
        toast.error(`Failed to read ${file.name}`);
      }
    }
  }, [handleImageSelect]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) await processDroppedFiles(files);
  }, [processDroppedFiles]);

  const removeCodeAttachment = useCallback((id: string) => {
    setCodeAttachments(prev => prev.filter(ca => ca.id !== id));
  }, []);

  const hasContent = message.trim().length > 0 || images.length > 0 || codeAttachments.length > 0;
  const maxLength = isAdmin ? ADMIN_MAX_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH;
  const remainingChars = maxLength - message.length;
  const showCharCount = !isAdmin && message.length > MAX_MESSAGE_LENGTH * 0.8;

  // On mobile we lift the composer above the on-screen keyboard with a transform.
  // iOS-style spring (cubic-bezier(0.32, 0.72, 0, 1)) for a non-linear, springy feel.
  const composerLiftStyle =
    isMobile && keyboardHeight > 0
      ? {
          transform: `translateY(-${keyboardHeight}px)`,
          transition: "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          willChange: "transform" as const,
        }
      : isMobile
        ? {
            transform: "translateY(0px)",
            transition: "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)",
            willChange: "transform" as const,
          }
        : undefined;

  return (
    <div
      className="relative p-[10px_14px_14px] border-t border-[rgba(255,255,255,0.06)] shrink-0"
      style={composerLiftStyle}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Slash Command Menu */}
      <AnimatePresence>
        {showSlashMenu && (
          <SlashCommandMenu
            filter={templateFilter}
            onSelect={(cmd: SlashCommand) => {
              setMessage(cmd.prefix);
              setShowSlashMenu(false);
              setTemplateFilter("");
              setTimeout(() => inputRef.current?.focus(), 30);
            }}
            onClose={() => { setShowSlashMenu(false); setTemplateFilter(""); }}
          />
        )}
      </AnimatePresence>

      {/* Prompt Templates Overlay */}
      {showTemplates && !showSlashMenu && (
        <PromptTemplates
          filter={templateFilter}
          onSelect={handleTemplateSelect}
          onClose={() => { setShowTemplates(false); setTemplateFilter(""); }}
        />
      )}

      {/* Drag-and-Drop Overlay */}
      {isDragOver && (
        <div className={cn(
          "absolute inset-0 z-50 flex flex-col items-center justify-center gap-2",
          "bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-glass-container",
          "pointer-events-none",
        )}>
          <FileCode2 className="h-8 w-8 text-primary/70" />
          <p className="text-sm font-medium text-primary/80">Drop files here</p>
          <p className="text-[10px] text-primary/60">Images, PDFs, or code files</p>
        </div>
      )}

      {(isCoolingDown || images.length > 0 || codeAttachments.length > 0) && (
        <div className="relative max-w-3xl mx-auto mb-2 space-y-2">
          {isCoolingDown && (
            <div className="flex items-center justify-center gap-2 py-2 px-4 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 text-xs">
              <Clock className="h-3.5 w-3.5 animate-pulse" />
              <span>ခဏစောင့်ပါ... {cooldownSeconds}s</span>
            </div>
          )}

          {images.length > 0 && (
            <ImagePreview images={images} onRemove={handleRemoveImage} disabled={isStreaming || isSending} />
          )}

          {codeAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {codeAttachments.map(ca => (
                <div
                  key={ca.id}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-glass-control text-xs",
                    "bg-primary/10 border border-primary/25 text-primary/80",
                    "max-w-[180px]",
                  )}
                >
                  <FileCode2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{ca.name}</span>
                  <button
                    onClick={() => removeCodeAttachment(ca.id)}
                    disabled={isStreaming || isSending}
                    className="ml-0.5 h-3.5 w-3.5 rounded flex items-center justify-center hover:bg-primary/20 transition-colors shrink-0 disabled:opacity-50"
                    aria-label={`Remove ${ca.name}`}
                  >
                    <XIcon className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Smart abort hint — lifted ABOVE the panel so the textarea never jumps. */}
      {isStreaming && message.length >= 20 && (
        <div className="relative max-w-3xl mx-auto mb-1.5 flex items-center gap-2 px-3 py-1.5 rounded-glass-control bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
          <span className="flex-1">
            BeeBot is still responding. Stop the current reply to send this one.
          </span>
          <button
            onClick={onCancel}
            className="shrink-0 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 font-medium transition-colors"
            aria-label="Stop current response"
          >
            Stop
          </button>
        </div>
      )}
      
      {/* Quick Prompt Suggestions */}
      {promptSuggestions && promptSuggestions.length > 0 && !isStreaming && (
        <div className="max-w-3xl mx-auto p-[4px_14px_10px] flex items-center gap-1.5 flex-wrap shrink-0">
          {promptSuggestions.map((promptText, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSend(promptText)}
              disabled={disabled || isSending || isCoolingDown || isListening}
              className="shrink-0 p-[5px_10px] rounded-[14px] bg-[rgba(255,255,255,0.04)] border-[0.5px] border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.08)] text-[11.5px] font-medium text-[#c4c4c6] hover:text-[#ededed] transition-all duration-[130ms] disabled:opacity-50"
            >
              {promptText}
            </button>
          ))}
        </div>
      )}

      {/* ═══ Manus-style Input Container ═══ */}
      <div className="relative max-w-3xl mx-auto">
        <input
          type="file"
          ref={fileInputRef}
          accept={ALLOWED_FILE_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />

        <div className={cn(
          "flex flex-col bg-[#161618] border-[0.5px] border-[rgba(255,255,255,0.10)] rounded-[16px] p-[8px_10px] gap-2 shadow-lg shadow-black/10 transition-all duration-200 focus-within:border-primary/40 focus-within:shadow-primary/5",
          isCoolingDown && "border-amber-500/30",
          isListening && "border-purple-500/50 shadow-purple-500/10",
          isDragOver && "border-primary/60 shadow-primary/10",
        )}>
          {/* Textarea — full width top area. Allow typing while streaming so users
              can pre-compose; the abort hint above guides them to stop first. */}
          <div className="relative">
            <textarea
              ref={inputRef}
              value={isListening ? (message + (interimTranscript ? " " + interimTranscript : "")).trim() : message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              aria-label="Message BeeBot"
              placeholder={
                isListening ? "🎤 Listening..." :
                isCoolingDown ? "Rate limit - ခဏစောင့်ပါ..." :
                isStreaming ? "Type your next message — press Stop to interrupt..." :
                (placeholder || "Assign a task or ask anything...")
              }
              disabled={disabled || isSending || isCoolingDown || isListening}
              inputMode="text"
              enterKeyHint="send"
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck={true}
              className={cn(
                "w-full bg-transparent border-none outline-none resize-none",
                "text-base sm:text-base text-[#f4f4f4]",
                "placeholder:text-muted-foreground/60",
                "min-h-[36px] max-h-[480px] py-1",
                "disabled:cursor-not-allowed",
                "touch-manipulation",
                showCharCount && "pr-10"
              )}
              rows={1}
            />
            {showCharCount && (
              <span
                className={cn(
                  "pointer-events-none absolute top-1 right-0 text-[10px] tabular-nums",
                  remainingChars < 100 ? "text-amber-500" : "text-muted-foreground/50"
                )}
                aria-live="polite"
              >
                {remainingChars}
              </span>
            )}
          </div>

          {/* Bottom toolbar — left buttons + right buttons */}
          <div className="flex items-center justify-between mt-1.5 -mb-0.5">
            {/* Left action buttons */}
            <div className="flex items-center gap-[3px]">
              {/* + File Picker */}
              <button
                type="button"
                onClick={openFilePicker}
                disabled={isStreaming || disabled}
                aria-label="Attach files"
                className={cn(
                  "h-[34px] w-[34px] rounded-[11px] inline-flex items-center justify-center bg-transparent transition-colors duration-[130ms] touch-manipulation active:scale-95",
                  "text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed]",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  images.length > 0 && "text-[var(--beebot-accent)]"
                )}
                title="Attach files"
              >
                <Plus className="h-5 w-5" />
              </button>

              {/* Connectors */}
              <ConnectorsPopover
                open={showConnectors}
                onOpenChange={setShowConnectors}
                hasPersonalKey={hasPersonalKey}
                hasTavilyKey={hasTavilyKey}
                hasTelegramLink={hasTelegramLink}
                hasSoulConfig={hasSoulConfig}
                hasOpenrouterKey={hasOpenrouterKey}
                hasXaiKey={hasXaiKey}
                hasFacebookPages={hasFacebookPages}
                hasNotionKey={hasNotionKey}
                disabledConnectors={disabledConnectors}
                onToggleConnector={onToggleConnector}
                onOpenApiKey={onOpenApiKeyDialog || (() => {})}
                onOpenTavily={onOpenTavily || (() => {})}
                onOpenTelegram={onOpenTelegram || (() => {})}
                onOpenSoulEditor={onOpenSoulEditor || (() => {})}
                onOpenFacebook={onOpenFacebook}
                onOpenNotion={onOpenNotion}
                connectorsDialogOpen={connectorsDialogOpen}
                onConnectorsDialogOpenChange={onConnectorsDialogOpenChange}
                connectorsTab={connectorsTab}
                onConnectorsTabChange={onConnectorsTabChange}
              />

              {/* Brain Menu */}
              <BrainMenu
                showModeMenu={showModeMenu}
                setShowModeMenu={setShowModeMenu}
                currentModel={currentModel}
                tierLevel={tierLevel}
                onModelChange={onModelChange}
                enableGoogleProvider={enableGoogleProvider}
                enableAnthropicProvider={enableAnthropicProvider}
                hasAnthropicKey={hasAnthropicKey}
                hasSystemGoogleKey={hasSystemGoogleKey}
                enabledGeminiModels={enabledGeminiModels}
                allowPersonalKey={allowPersonalKey}
                hasPersonalKey={hasPersonalKey}
                apiSource={apiSource}
                onApiSourceChange={onApiSourceChange}
                onOpenApiKeyDialog={onOpenApiKeyDialog}
                voiceLanguage={voiceLanguage}
                currentLang={currentLang}
                showLanguageSubmenu={showLanguageSubmenu}
                setShowLanguageSubmenu={setShowLanguageSubmenu}
                onLanguageChange={handleLanguageChange}
                hasOpenrouterKey={hasOpenrouterKey}
                disabledConnectors={disabledConnectors}
              />
            </div>

            {/* Right action buttons */}
            <div className="flex items-center gap-[3px]">
              {/* Voice / Mic Button */}
              {isSpeechSupported && !isStreaming && (
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  disabled={disabled || isSending || isCoolingDown}
                  aria-label={isListening ? "Stop voice input" : "Start voice input"}
                  className={cn(
                    "h-[34px] w-[34px] rounded-[11px] flex items-center justify-center bg-transparent transition-colors duration-[130ms] active:scale-95 touch-manipulation",
                    isListening ? "text-red-400 bg-red-500/10" : "text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed]"
                  )}
                  title="Voice input"
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <AudioLines className="h-4 w-4" />}
                </button>
              )}

              {/* Send / Cancel Button */}
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onCancel}
                  aria-label="Stop response"
                  className="shrink-0 h-[34px] w-[34px] rounded-full bg-destructive text-destructive-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!hasContent || disabled || isSending || isCoolingDown}
                  aria-label="Send message"
                  className={cn(
                    "shrink-0 h-[34px] w-[34px] rounded-full flex items-center justify-center transition-all duration-[130ms] active:scale-95 touch-manipulation",
                    hasContent
                      ? "bg-[var(--beebot-accent)] text-black font-semibold shadow-md hover:brightness-110"
                      : "bg-transparent text-[#9b9b9d] opacity-40 cursor-not-allowed"
                  )}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <Send className="h-4 w-4 text-black" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
