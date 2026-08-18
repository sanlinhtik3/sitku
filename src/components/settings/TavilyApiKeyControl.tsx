import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Globe2, Loader2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { tavilyKey } from "@/features/web-search/tavily";
import { cn } from "@/lib/utils";

interface TavilyApiKeyControlProps {
  compact?: boolean;
  onConfiguredChange?: (configured: boolean) => void;
}

export function TavilyApiKeyControl({ compact = false, onConfiguredChange }: TavilyApiKeyControlProps) {
  const available = tavilyKey.available();
  const [configured, setConfigured] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<"checking" | "testing" | "saving" | "removing" | null>("checking");
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!available) {
      setBusy(null);
      setConfigured(false);
      onConfiguredChange?.(false);
      return;
    }
    setBusy("checking");
    try {
      const hasKey = await tavilyKey.has();
      setConfigured(hasKey);
      onConfiguredChange?.(hasKey);
    } catch (error) {
      setResult({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }, [available, onConfiguredChange]);

  useEffect(() => {
    void refresh();
    const listener = () => { void refresh(); };
    window.addEventListener(tavilyKey.EVENT, listener);
    return () => window.removeEventListener(tavilyKey.EVENT, listener);
  }, [refresh]);

  const testDraft = async () => {
    if (!draft.trim()) return;
    setBusy("testing");
    setResult(null);
    try {
      await tavilyKey.test(draft.trim());
      setResult({ kind: "success", message: "Tavily connection verified." });
    } catch (error) {
      setResult({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft.trim()) return;
    setBusy("saving");
    setResult(null);
    try {
      await tavilyKey.test(draft.trim());
      const hasKey = await tavilyKey.set(draft.trim());
      setConfigured(hasKey);
      setDraft("");
      setReveal(false);
      setEditing(false);
      setResult({ kind: "success", message: "Tavily is connected and ready for E.V." });
      onConfiguredChange?.(hasKey);
    } catch (error) {
      setResult({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("removing");
    setResult(null);
    try {
      await tavilyKey.set("");
      setConfigured(false);
      setEditing(false);
      setDraft("");
      setResult({ kind: "success", message: "Tavily key removed from this device." });
      onConfiguredChange?.(false);
    } catch (error) {
      setResult({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("space-y-3", !compact && "rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-4")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--bb-text-1)]">
            <Globe2 className="h-4 w-4 text-[var(--bb-accent)]" />
            Tavily real-time web
          </div>
          <p className="mt-1 text-xs text-[var(--bb-text-3)]">One system-wide provider for E.V and agent web tools. Search runs only after an explicit web/latest request.</p>
        </div>
        {configured && !editing && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1.5 text-xs text-emerald-500">
            <ShieldCheck className="h-3.5 w-3.5" /> OS secure storage
          </span>
        )}
      </div>

      {!available ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-500">
          Open the Electron desktop app to configure Tavily securely. Browser storage is intentionally disabled for API keys.
        </div>
      ) : busy === "checking" ? (
        <div className="flex items-center gap-2 text-xs text-[var(--bb-text-3)]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking secure storage…</div>
      ) : !editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setEditing(true); setResult(null); }} className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 text-xs font-medium text-[var(--bb-text-1)] hover:bg-[var(--bb-border)]">
            {configured ? "Replace / Update" : "Add API key"}
          </button>
          {configured && (
            <>
              <button type="button" disabled={Boolean(busy)} onClick={() => { setBusy("testing"); setResult(null); void tavilyKey.test().then(() => setResult({ kind: "success", message: "Tavily connection verified." })).catch((error) => setResult({ kind: "error", message: error instanceof Error ? error.message : String(error) })).finally(() => setBusy(null)); }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-4)]">
                {busy === "testing" ? "Testing…" : "Test connection"}
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => { void remove(); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10">
                {busy === "removing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove
              </button>
            </>
          )}
          <a href="https://app.tavily.com" target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--bb-accent)] hover:underline">Get API key <ExternalLink className="h-3 w-3" /></a>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <input type={reveal ? "text" : "password"} value={draft} onChange={(event) => { setDraft(event.target.value); setResult(null); }} placeholder="tvly-…" autoComplete="off" spellCheck={false} className="h-9 w-full rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 pr-10 font-mono text-sm text-[var(--bb-text-1)] outline-none focus:border-[var(--bb-border-strong)]" />
              <button type="button" onClick={() => setReveal((value) => !value)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]" aria-label={reveal ? "Hide API key" : "Show API key"}>
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!draft.trim() || Boolean(busy)} onClick={() => { void testDraft(); }} className="rounded-lg border border-[var(--bb-border)] px-3 py-1.5 text-xs font-medium text-[var(--bb-text-2)] disabled:opacity-40">{busy === "testing" ? "Testing…" : "Test"}</button>
            <button type="button" disabled={!draft.trim() || Boolean(busy)} onClick={() => { void save(); }} className="rounded-lg bg-[var(--bb-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--bb-accent-contrast,#fff)] disabled:opacity-40">{busy === "saving" ? "Verifying…" : "Verify & save"}</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => { setEditing(false); setDraft(""); setReveal(false); setResult(null); }} className="rounded-lg px-3 py-1.5 text-xs text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]">Cancel</button>
          </div>
          <p className="text-[11px] text-[var(--bb-text-4)]">The key is verified before save, encrypted by the operating system, and never returned to the renderer.</p>
        </div>
      )}

      {result && (
        <div className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-xs", result.kind === "success" ? "bg-emerald-500/8 text-emerald-500" : "bg-red-500/8 text-red-500")}>
          {result.kind === "success" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span className="break-words">{result.message}</span>
        </div>
      )}
    </div>
  );
}
