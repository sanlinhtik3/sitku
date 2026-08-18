import React from "react";
import { Check, Download, Palette, Plus, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isBuiltInThemeId, type CustomTheme } from "@/lib/theme/themeEngine";
import { parseThemeJson } from "@/lib/theme/themeValidation";
import { themeStore } from "@/repositories/local/themeStore";
import { toast } from "sonner";
import { FuiBadge, FuiPanel, FuiSectionHeader } from "@/design-system/fui";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface ThemeStorePanelProps {
  currentThemeId: string | null;
  onThemeSelect: (themeId: string | null) => void;
  onEditTheme: (themeId: string | null) => void;
}

export function ThemeStorePanel({ currentThemeId, onThemeSelect, onEditTheme }: ThemeStorePanelProps) {
  // Use a simple state to trigger re-renders when themes change
  const [themes, setThemes] = React.useState<CustomTheme[]>([]);
  const [pendingDelete, setPendingDelete] = React.useState<CustomTheme | null>(null);

  React.useEffect(() => {
    setThemes(themeStore.getThemes());
  }, [currentThemeId]);

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const theme = themeStore.importTheme(parseThemeJson(content));
          setThemes(themeStore.getThemes());
          toast.success(`Theme "${theme.name}" imported. Review it, then Apply.`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to import theme file");
        }
      };
      reader.onerror = () => toast.error("Theme file could not be read.");
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExport = (theme: CustomTheme) => {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${theme.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase() || "sitku-theme"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Theme exported`);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    try {
      themeStore.deleteTheme(id);
      setThemes(themeStore.getThemes());
      if (currentThemeId === id) onThemeSelect(null);
      toast.success(`Theme "${name}" uninstalled`);
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Theme could not be removed.");
    }
  };

  return (
    <div className="space-y-4" data-testid="theme-store">
      <FuiSectionHeader
        title="Custom Themes"
        description="One palette updates the workspace, editor, dashboards, dialogs, and charts."
        action={<div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" size="sm" onClick={handleImport} className="h-9 gap-1.5 rounded-[var(--bb-radius-control)] border-[var(--bb-border)] bg-[var(--bb-bg-3)] text-[var(--bb-text-1)]">
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
          <Button size="sm" onClick={() => onEditTheme(null)} className="h-9 gap-1.5 rounded-[var(--bb-radius-control)] bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Plus className="h-3.5 w-3.5" /> Create
          </Button>
        </div>}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
        {/* Default System Theme Card */}
        <ThemeCard
          name="System Default"
          author="Built in · follows Appearance settings"
          isActive={currentThemeId === null}
          onApply={() => onThemeSelect(null)}
          preview={
            <div className="absolute inset-0 flex p-2 gap-2 bg-[#0a0a0a]">
              <div className="w-1/3 rounded bg-[#161616]" />
              <div className="w-2/3 space-y-1">
                <div className="h-2 w-full rounded bg-[#1c1c1c]" />
                <div className="h-2 w-3/4 rounded bg-[#f4d35e]" />
              </div>
            </div>
          }
        />

        {/* Custom Themes */}
        {themes.map((theme) => {
          const isActive = currentThemeId === theme.id;
          const bg = theme.colors["core.background"];
          const primary = theme.colors["primary.main"];
          const card = theme.colors["card.background"];
          return (
            <ThemeCard
              key={theme.id}
              name={theme.name}
              author={isBuiltInThemeId(theme.id) ? "Built in · customization creates a copy" : `By ${theme.author}`}
              isActive={isActive}
              onApply={() => onThemeSelect(theme.id)}
              onEdit={() => onEditTheme(theme.id)}
              editLabel={isBuiltInThemeId(theme.id) ? "Customize as new theme" : "Edit theme"}
              onExport={() => handleExport(theme)}
              onDelete={() => setPendingDelete(theme)}
              preview={
                <div className="absolute inset-0 flex p-2 gap-2" style={{ backgroundColor: bg }}>
                  <div className="w-1/3 rounded" style={{ backgroundColor: card }} />
                  <div className="w-2/3 space-y-1">
                    <div className="h-2 w-full rounded" style={{ backgroundColor: card }} />
                    <div className="h-2 w-3/4 rounded" style={{ backgroundColor: primary }} />
                  </div>
                </div>
              }
            />
          );
        })}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the theme from your Theme Store. If it's the active theme, the app
              returns to System Default. You can re-import it later from a JSON file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ThemeCardProps {
  name: string;
  author: string;
  isActive: boolean;
  onApply: () => void;
  onEdit?: () => void;
  editLabel?: string;
  onExport?: () => void;
  onDelete?: () => void;
  preview: React.ReactNode;
}

// One theme card — accessible, theme-token-driven, with an explicit Apply control.
// The whole card is no longer the click target: Apply is a real button (clear affordance),
// the row actions are always visible (touch + keyboard friendly), and selection is reflected
// via both a bb-text border AND an "Applied" badge. Border tokens use the workspace --bb-*
// family so the card border visually matches the surrounding settings section.
function ThemeCard({ name, author, isActive, onApply, onEdit, editLabel = "Edit theme", onExport, onDelete, preview }: ThemeCardProps) {
  return (
    <FuiPanel
      tone={isActive ? "primary" : "secondary"}
      className={`group relative min-w-0 rounded-[var(--bb-radius)] border bg-[var(--bb-bg-1)] transition-[border-color,background-color,transform] duration-200 ${
        isActive
          ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/50"
          : "border-[var(--bb-border)] hover:-translate-y-0.5 hover:border-[var(--bb-border-strong)] hover:bg-[var(--bb-bg-2)]"
      }`}
      aria-current={isActive ? "true" : undefined}
    >
      <div className="space-y-3 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-sm text-[var(--bb-text-1)] truncate">{name}</div>
            <div className="text-[11px] text-[var(--bb-text-3)] truncate">{author}</div>
          </div>
          {isActive && (
            <FuiBadge tone="success" className="shrink-0">
              <Check className="h-3 w-3" /> Applied
            </FuiBadge>
          )}
        </div>

        {/* Preview pane — visual swatch of the actual theme surfaces */}
        <div className="relative h-[72px] overflow-hidden rounded-[var(--bb-radius-control)] border border-[var(--bb-border)]">{preview}</div>

        {/* Footer actions — always visible (touch + keyboard a11y) */}
        <div className="flex items-center justify-between gap-2">
          {isActive ? (
            <span className="text-[11px] text-[var(--bb-text-3)]">Currently in use</span>
          ) : (
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90"
              onClick={onApply}
            >
              Apply
            </Button>
          )}
          {(onEdit || onExport || onDelete) && (
            <div className="flex items-center gap-0.5">
              {onEdit && (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[var(--bb-radius-control)]" title={editLabel} aria-label={`${editLabel}: ${name}`} onClick={onEdit}>
                  <Palette className="h-3.5 w-3.5" />
                </Button>
              )}
              {onExport && (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[var(--bb-radius-control)]" title="Export JSON" aria-label={`Export ${name}`} onClick={onExport}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-[var(--bb-radius-control)] text-[var(--bb-text-3)] hover:bg-red-500/10 hover:text-red-500"
                  title="Uninstall theme"
                  aria-label={`Uninstall ${name}`}
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </FuiPanel>
  );
}
