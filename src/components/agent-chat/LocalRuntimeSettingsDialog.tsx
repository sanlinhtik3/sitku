import { useEffect, useState } from "react";
import { HardDrive, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";

interface LocalRuntimeProviderSettings {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
}

interface LocalRuntimeSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SETTINGS_KEY = "agentRuntime.openaiCompatible";

export function LocalRuntimeSettingsDialog({ open, onOpenChange }: LocalRuntimeSettingsDialogProps) {
  const { settings } = useRepositories();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    settings.get<LocalRuntimeProviderSettings>(SETTINGS_KEY)
      .then((value) => {
        if (cancelled) return;
        setIsAvailable(true);
        setBaseUrl(value?.baseUrl || "");
        setModel(value?.model || "");
        setApiKey(value?.apiKey || "");
      })
      .catch(() => {
        if (cancelled) return;
        setIsAvailable(false);
        setBaseUrl("");
        setModel("");
        setApiKey("");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, settings]);

  const handleSave = async () => {
    const next = {
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      apiKey: apiKey.trim(),
    };
    if (!next.baseUrl || !next.model || !next.apiKey) {
      toast.error("Endpoint, model, and key are required");
      return;
    }
    setIsSaving(true);
    try {
      await settings.set(SETTINGS_KEY, next);
      toast.success("Local provider saved");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save local provider");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await settings.remove(SETTINGS_KEY);
      setBaseUrl("");
      setModel("");
      setApiKey("");
      toast.success("Local provider cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to clear local provider");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pr-8">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HardDrive className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle>Local Runtime</DialogTitle>
              <DialogDescription>OpenAI-compatible provider</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
            <span className="text-sm font-medium">Desktop bridge</span>
            <Badge variant={isAvailable ? "default" : "outline"} className={isAvailable ? "bg-emerald-500/15 text-emerald-300" : ""}>
              {isAvailable ? "Ready" : "Unavailable"}
            </Badge>
          </div>

          {!isAvailable ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
              Local runtime settings are available in the Electron desktop app.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="local-runtime-base-url">Base URL</Label>
                <Input
                  id="local-runtime-base-url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="http://127.0.0.1:1234/v1"
                  disabled={isLoading || isSaving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="local-runtime-model">Model</Label>
                <Input
                  id="local-runtime-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="local-model"
                  disabled={isLoading || isSaving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="local-runtime-key">API Key</Label>
                <Input
                  id="local-runtime-key"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="sk-..."
                  disabled={isLoading || isSaving}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-5 gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClear} disabled={!isAvailable || isLoading || isSaving}>
            <Trash2 className="h-4 w-4" />
            Clear
          </Button>
          <Button onClick={handleSave} disabled={!isAvailable || isLoading || isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
