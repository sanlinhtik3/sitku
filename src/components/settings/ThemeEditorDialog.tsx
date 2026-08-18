import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { CustomTheme, CustomThemeColors, FLAT_DARK_THEME, applyThemeVariables, isBuiltInThemeId } from "@/lib/theme/themeEngine";
import { THEME_PRESETS, type ThemePreset } from "@/lib/theme/presets";
import { contrastRatio } from "@/lib/theme/deriveRamp";
import { themeStore } from "@/repositories/local/themeStore";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Palette, RotateCcw, Save } from "lucide-react";

interface ThemeEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themeId: string | null; // null means create new
  activeThemeId: string | null; // Currently applied global theme
  onSaved: (themeId: string) => void;
}

const DEFAULT_NEW_COLORS: CustomThemeColors = {
  ...FLAT_DARK_THEME.colors,
  "core.background": "#ffffff",
  "core.foreground": "#111827",
  "card.background": "#f8f9fa",
  "card.foreground": "#111827",
  "core.border": "#e5e7eb",
  "core.input": "#e5e7eb",
  "primary.main": "#3b82f6",
  "primary.foreground": "#ffffff",
  "muted.main": "#f3f4f6",
  "muted.foreground": "#6b7280",
  "secondary.main": "#f3f4f6",
  "secondary.foreground": "#111827",
  "accent.main": "#f3f4f6",
  "accent.foreground": "#111827",
  "core.radius": "0.5rem",
};

// Radius presets mirroring VS Code/Obsidian style
const RADIUS_PRESETS = [
  { label: "None", value: "0rem" },
  { label: "Sharp", value: "0.25rem" },
  { label: "Rounded", value: "0.5rem" },
  { label: "Pill", value: "1rem" },
];

// Color field groups — VS Code style: Semantic groups with clear hierarchy
const COLOR_GROUPS: { title: string; description: string; fields: { key: keyof CustomThemeColors; label: string; hint?: string }[] }[] = [
  {
    title: "Background",
    description: "Surface colors — the canvas your content sits on",
    fields: [
      { key: "core.background", label: "App Background", hint: "Main canvas" },
      { key: "card.background", label: "Card / Panel", hint: "Content surfaces" },
      { key: "muted.main", label: "Muted Surface", hint: "Subtle sections" },
    ],
  },
  {
    title: "Foreground",
    description: "Text and icon colors",
    fields: [
      { key: "core.foreground", label: "Primary Text", hint: "Main readable text" },
      { key: "muted.foreground", label: "Muted Text", hint: "Secondary / captions" },
      { key: "card.foreground", label: "Card Text", hint: "Text inside cards" },
    ],
  },
  {
    title: "Border",
    description: "Dividers and outlines",
    fields: [
      { key: "core.border", label: "Border Color", hint: "Component outlines" },
      { key: "core.input", label: "Input Border", hint: "Form field borders" },
      { key: "core.ring", label: "Focus Ring", hint: "Keyboard focus indicator" },
    ],
  },
  {
    title: "Accent & Brand",
    description: "Primary actions and highlights",
    fields: [
      { key: "primary.main", label: "Primary Accent", hint: "Buttons, links, active states" },
      { key: "primary.foreground", label: "On Primary", hint: "Text on accent color" },
      { key: "destructive.main", label: "Destructive", hint: "Delete / danger actions" },
    ],
  },
  {
    title: "Status",
    description: "Consistent meaning across alerts, health, and task states",
    fields: [
      { key: "semantic.positive", label: "Positive", hint: "Healthy, profit, completed" },
      { key: "semantic.negative", label: "Negative", hint: "Loss, error, blocked" },
      { key: "semantic.warning", label: "Warning", hint: "Due soon, needs attention" },
      { key: "semantic.info", label: "Information", hint: "Neutral guidance and context" },
    ],
  },
  {
    title: "Charts",
    description: "Data visualization colors",
    fields: [
      { key: "chart.1", label: "Chart 1" },
      { key: "chart.2", label: "Chart 2" },
      { key: "chart.3", label: "Chart 3" },
      { key: "chart.4", label: "Chart 4" },
      { key: "chart.5", label: "Chart 5" },
    ],
  },
];

/** Parse "Xrem" → pixel number */
function remToPx(rem: string): number {
  const parsed = parseFloat(rem.replace("rem", "")) || 0;
  return Math.round(parsed * 100); // store as 0-100 (0rem–1rem in steps of 0.01)
}

/** Convert slider value (0-100) → rem string */
function pxToRem(val: number): string {
  return `${(val / 100).toFixed(2)}rem`;
}

function getThemeColor(colors: CustomThemeColors, key: keyof CustomThemeColors): string {
  const explicit = colors[key];
  if (explicit) return explicit;
  if (key === "semantic.positive") return colors["chart.3"];
  if (key === "semantic.negative") return colors["chart.2"];
  if (key === "semantic.warning") return colors["chart.1"];
  if (key === "semantic.info") return colors["chart.4"];
  return "#000000";
}

interface EditorDraft {
  name: string; author: string; type: "dark" | "light"; colors: CustomThemeColors;
  family: CustomTheme["family"];
  flat: boolean; shadow: boolean; borders: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  ignoreContrast: boolean;
}

function ColorField({ field, value, onChange }: {
  field: { key: keyof CustomThemeColors; label: string; hint?: string };
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  return (
    <label className="grid min-w-0 grid-cols-[minmax(0,1fr)_88px_34px] items-center gap-2 rounded-[var(--bb-radius-control)] border border-[var(--bb-border)] bg-[var(--bb-bg-3)] px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-[var(--bb-text-1)]">{field.label}</span>
        {field.hint && <span className="block truncate text-[10px] text-[var(--bb-text-3)]">{field.hint}</span>}
      </span>
      <input
        value={draft}
        spellCheck={false}
        aria-invalid={!valid}
        aria-label={`${field.label} hex color`}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toLowerCase());
        }}
        onBlur={() => { if (!valid) setDraft(value); }}
        className={`h-7 min-w-0 rounded-md border bg-[var(--bb-bg-1)] px-2 font-mono text-[10px] uppercase outline-none ${valid ? "border-[var(--bb-border)] text-[var(--bb-text-2)] focus:border-[var(--bb-accent)]" : "border-[var(--bb-negative)] text-[var(--bb-negative)]"}`}
      />
      <span className="relative h-7 w-8 overflow-hidden rounded-md border border-[var(--bb-border-strong)]" style={{ backgroundColor: valid ? draft : value }}>
        <input type="color" value={valid ? draft : value} aria-label={`${field.label} color picker`} onChange={(event) => onChange(event.target.value)} className="absolute -inset-2 h-12 w-14 cursor-pointer opacity-0" />
      </span>
    </label>
  );
}

export function ThemeEditorDialog({ open, onOpenChange, themeId, activeThemeId, onSaved }: ThemeEditorDialogProps) {
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("User");
  const [type, setType] = useState<"dark" | "light">("dark");
  const [colors, setColors] = useState<CustomThemeColors>(DEFAULT_NEW_COLORS);
  const [flat, setFlat] = useState(false);
  const [shadow, setShadow] = useState(true);
  const [borders, setBorders] = useState({ top: true, right: true, bottom: true, left: true });
  const [ignoreContrast, setIgnoreContrast] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const resetDraftRef = useRef<EditorDraft | null>(null);
  const isBuiltInTheme = isBuiltInThemeId(themeId);
  const isUpdatingTheme = Boolean(themeId && !isBuiltInTheme);
  const dialogTitle = isBuiltInTheme ? "Customize Built-in Theme" : isUpdatingTheme ? "Edit Theme" : "Create Theme";

  const radiusSlider = remToPx(colors["core.radius"] || "0.5rem");

  const applyDraft = (draft: EditorDraft) => {
    setName(draft.name); setAuthor(draft.author); setType(draft.type); setColors({ ...draft.colors });
    setFamily(draft.family);
    setFlat(draft.flat); setShadow(draft.shadow); setBorders({ ...draft.borders }); setIgnoreContrast(draft.ignoreContrast);
  };
  const [family, setFamily] = useState<CustomTheme["family"]>("standard");

  useEffect(() => {
    if (open) {
      let draft: EditorDraft;
      if (themeId) {
        const existing = themeStore.getTheme(themeId);
        if (existing) {
          draft = {
            name: existing.name + (isBuiltInThemeId(existing.id) ? " Copy" : ""), author: existing.author,
            family: existing.family ?? "standard",
            type: existing.type, colors: { ...existing.colors }, flat: Boolean(existing.flat), shadow: existing.shadow !== false,
            borders: {
            top: existing.sidebarBorders?.top !== false,
            right: existing.sidebarBorders?.right !== false,
            bottom: existing.sidebarBorders?.bottom !== false,
            left: existing.sidebarBorders?.left !== false,
            }, ignoreContrast: Boolean(existing.ignoreContrast),
          };
        } else {
          draft = { name: "My Custom Theme", author: "User", type: "dark", family: "standard", colors: { ...FLAT_DARK_THEME.colors }, flat: false, shadow: true, borders: { top: true, right: true, bottom: true, left: true }, ignoreContrast: false };
        }
      } else {
        draft = { name: "My Custom Theme", author: "User", type: "light", family: "standard", colors: { ...DEFAULT_NEW_COLORS }, flat: false, shadow: true, borders: { top: true, right: true, bottom: true, left: true }, ignoreContrast: false };
      }
      applyDraft(draft);
      resetDraftRef.current = draft;
      setPreviewReady(true);
    }
  }, [open, themeId]);

  useEffect(() => {
    if (!open || !previewReady) return;
    applyThemeVariables({ id: "live-preview-draft", name: name || "Draft", author, type, family, flat, shadow, sidebarBorders: borders, ignoreContrast, colors });
  }, [colors, type, name, author, family, flat, shadow, borders, ignoreContrast, open, previewReady]);

  useEffect(() => {
    if (open) return;
    setPreviewReady(false);
    applyThemeVariables(activeThemeId ? themeStore.getTheme(activeThemeId) : null);
  }, [open, activeThemeId]);

  const handleColorChange = (key: keyof CustomThemeColors, value: string) => {
    setColors((prev) => {
      const next = { ...prev, [key]: value };
      const linked: Partial<Record<keyof CustomThemeColors, keyof CustomThemeColors[]>> = {
        "core.background": ["sidebar.background"],
        "core.foreground": ["sidebar.foreground"],
        "card.background": ["popover.background"],
        "card.foreground": ["popover.foreground"],
        "muted.main": ["secondary.main", "accent.main", "sidebar.accent"],
        "muted.foreground": ["sidebar.accent.foreground"],
        "primary.main": ["core.ring", "sidebar.primary", "sidebar.ring"],
        "primary.foreground": ["sidebar.primary.foreground"],
        "core.border": ["core.input", "sidebar.border"],
      };
      linked[key]?.forEach((target) => { next[target] = value; });
      return next;
    });
  };

  const handleRadiusSlider = (val: number) => {
    setColors((prev) => ({ ...prev, "core.radius": pxToRem(val) }));
  };

  // Apply a curated, contrast-safe starting palette (the "recommended colors" guardrail).
  const applyPreset = (preset: ThemePreset) => {
    setType(preset.type);
    setFlat(Boolean(preset.flat));
    setShadow(preset.shadow !== false);
    setColors({ ...preset.colors });
  };

  const handleSave = (intent: "create" | "update" | "copy") => {
    if (!name.trim()) {
      toast.error("Theme name is required");
      return;
    }

    const finalId = intent === "update" ? themeId! : `custom-${crypto.randomUUID()}`;

    const newTheme: CustomTheme = {
      id: finalId,
      name: name.trim(),
      author: author.trim() || "User",
      type,
      family,
      flat,
      shadow,
      sidebarBorders: borders,
      ignoreContrast,
      colors,
    };

    try {
      const saved = intent === "update"
        ? themeStore.updateTheme(newTheme)
        : intent === "copy"
          ? themeStore.saveThemeCopy(newTheme)
          : themeStore.createTheme(newTheme);
      toast.success(intent === "update"
        ? `Theme "${saved.name}" updated and applied`
        : intent === "copy"
          ? `New theme "${saved.name}" created and applied`
          : `Theme "${saved.name}" created and applied`);
      onSaved(saved.id);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Theme could not be saved.");
    }
  };

  // Live preview mini-card style — computed inline from current editor state
  const previewBg = colors["core.background"] || "#161925";
  const previewCard = colors["card.background"] || "#1e2233";
  const previewText = colors["core.foreground"] || "#e2e8f0";
  const previewMuted = colors["muted.foreground"] || "#9ca3af";
  const previewPrimary = colors["primary.main"] || "#f59e0b";
  const previewBorder = colors["core.border"] || previewBg;
  const previewRadius = colors["core.radius"] || "0.5rem";

  const currentRadiusLabel = (() => {
    const match = RADIUS_PRESETS.find((p) => p.value === colors["core.radius"]);
    return match?.label ?? `${Math.round(parseFloat(previewRadius) * 16)}px`;
  })();
  const contrastChecks = useMemo(() => [
    { label: "App text", ratio: contrastRatio(colors["core.foreground"], colors["core.background"]) },
    { label: "Card text", ratio: contrastRatio(colors["card.foreground"], colors["card.background"]) },
    { label: "Button text", ratio: contrastRatio(colors["primary.foreground"], colors["primary.main"]) },
  ], [colors]);
  const contrastSafe = contrastChecks.every((check) => check.ratio >= 4.5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,780px)] !w-[min(94vw,900px)] !max-w-[min(94vw,900px)] flex-col gap-0 overflow-hidden border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] p-0 text-[var(--bb-text-1)]">
        <DialogHeader className="shrink-0 border-b border-[var(--bb-border)] px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-[var(--bb-accent)]" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>
            {isBuiltInTheme
              ? "Built-in themes stay protected. Create and apply a personal version with your changes."
              : isUpdatingTheme
                ? "Update this personal theme, or save these changes as a separate new theme."
                : "Create a personal theme for every Sitku surface. Changes preview live until saved."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px]">
          {/* ─── Left: Controls ─── */}
          <div className="order-2 min-h-0 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 md:order-1">
            {/* ─── Recommended palettes (start from a harmonious, contrast-safe base) ─── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Recommended palettes</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    title={`Apply ${preset.name}`}
                    className="flex min-w-0 flex-col items-center gap-1 rounded-[var(--bb-radius-control)] border border-[var(--bb-border)] p-1.5 transition-colors hover:border-[var(--bb-accent)]"
                  >
                    <span className="flex h-7 w-12 overflow-hidden rounded" style={{ backgroundColor: preset.colors["core.background"] }}>
                      <span className="m-auto h-1.5 w-6 rounded-full" style={{ backgroundColor: preset.colors["primary.main"] }} />
                    </span>
                    <span className="text-[10px] text-[var(--bb-text-2)]">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Name / Author / Type */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="theme-name" className="text-xs font-medium">Theme Name</Label>
                <Input
                  id="theme-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="E.g. Neon Nights"
                  className="h-8 bg-[var(--bb-bg-4)] border-[var(--bb-border-strong)] text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="theme-author" className="text-xs font-medium">Author</Label>
                <Input
                  id="theme-author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your name"
                  className="h-8 bg-[var(--bb-bg-4)] border-[var(--bb-border-strong)] text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Base Type</Label>
              <div className="flex gap-2">
                <Button
                  variant={type === "dark" ? "default" : "outline"}
                  size="sm"
                  className={`h-7 text-xs ${type === "dark" ? "bg-[var(--bb-accent)] text-[hsl(var(--primary-foreground))]" : ""}`}
                  onClick={() => setType("dark")}
                >
                  Dark
                </Button>
                <Button
                  variant={type === "light" ? "default" : "outline"}
                  size="sm"
                  className={`h-7 text-xs ${type === "light" ? "bg-[var(--bb-accent)] text-[hsl(var(--primary-foreground))]" : ""}`}
                  onClick={() => setType("light")}
                >
                  Light
                </Button>
              </div>
            </div>

            {/* ─── Surface Style (Flat ⇄ Elevated) ─── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Surface Style</Label>
              <p className="text-[10px] text-[var(--bb-text-3)]">
                Flat removes panel elevation — only hover/active show a background.
              </p>
              <div className="flex gap-2">
                <Button
                  variant={!flat ? "default" : "outline"}
                  size="sm"
                  className={`h-7 text-xs ${!flat ? "bg-[var(--bb-accent)] text-[hsl(var(--primary-foreground))]" : ""}`}
                  onClick={() => setFlat(false)}
                >
                  Elevated
                </Button>
                <Button
                  variant={flat ? "default" : "outline"}
                  size="sm"
                  className={`h-7 text-xs ${flat ? "bg-[var(--bb-accent)] text-[hsl(var(--primary-foreground))]" : ""}`}
                  onClick={() => { setFlat(true); setShadow(false); }}
                >
                  Flat
                </Button>
              </div>
            </div>

            {/* ─── Shadow ─── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Shadow</Label>
              <p className="text-[10px] text-[var(--bb-text-3)]">
                Drop shadows on the sidebar, modals, and cards.
              </p>
              {flat ? (
                <div className="rounded-[var(--bb-radius-control)] border border-[var(--bb-border)] px-3 py-2 text-[10px] text-[var(--bb-text-3)]">
                  Off in Flat mode. Spacing and dividers create the hierarchy.
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant={shadow ? "default" : "outline"}
                    size="sm"
                    className={`h-7 text-xs ${shadow ? "bg-[var(--bb-accent)] text-[hsl(var(--primary-foreground))]" : ""}`}
                    onClick={() => setShadow(true)}
                  >
                    On
                  </Button>
                  <Button
                    variant={!shadow ? "default" : "outline"}
                    size="sm"
                    className={`h-7 text-xs ${!shadow ? "bg-[var(--bb-accent)] text-[hsl(var(--primary-foreground))]" : ""}`}
                    onClick={() => setShadow(false)}
                  >
                    No shadow
                  </Button>
                </div>
              )}
            </div>

            <div className="h-px bg-[var(--bb-bg-3)]" />

            {/* ─── Border Radius ─── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Border Radius</Label>
                  <p className="text-[10px] text-[var(--bb-text-3)] mt-0.5">
                    Controls roundness of all UI elements
                  </p>
                </div>
                <span className="rounded bg-[color-mix(in_oklab,var(--bb-accent)_10%,transparent)] px-2 py-0.5 font-mono text-xs text-[var(--bb-accent)]">
                  {currentRadiusLabel}
                </span>
              </div>

              {/* Visual preset chips */}
              <div className="flex gap-2">
                {RADIUS_PRESETS.map((preset) => {
                  const isActive = colors["core.radius"] === preset.value;
                  return (
                    <button
                      key={preset.label}
                      onClick={() => handleColorChange("core.radius", preset.value)}
                      className={`flex-1 flex flex-col items-center gap-1.5 p-2 rounded-lg border text-xs transition-all ${
                        isActive
                          ? "border-[var(--bb-accent)] bg-[color-mix(in_oklab,var(--bb-accent)_10%,transparent)] text-[var(--bb-accent)]"
                          : "border-[var(--bb-border)] hover:border-[var(--bb-text-3)] text-[var(--bb-text-2)]"
                      }`}
                    >
                      {/* Visual chip showing the radius */}
                      <div
                        className={`w-7 h-5 border-2 ${isActive ? "border-[var(--bb-accent)]" : "border-[var(--bb-text-3)]"}`}
                        style={{ borderRadius: preset.value }}
                      />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Fine-grained slider */}
              <Slider
                min={0}
                max={100}
                step={1}
                value={[radiusSlider]}
                onValueChange={([v]) => handleRadiusSlider(v)}
                className="w-full"
              />
            </div>

            <div className="h-px bg-[var(--bb-bg-3)]" />

            {/* ─── Color Groups (core; Charts live under Advanced) ─── */}
            {COLOR_GROUPS.filter((group) => group.title !== "Charts").map((group) => (
              <div key={group.title} className="space-y-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--bb-text-2)]">{group.title}</h4>
                  <p className="text-[10px] text-[var(--bb-text-3)]">{group.description}. Related surfaces stay in sync.</p>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {group.fields.map((field) => (
                    <ColorField key={field.key} field={field} value={getThemeColor(colors, field.key)} onChange={(value) => handleColorChange(field.key, value)} />
                  ))}
                </div>
              </div>
            ))}

            {/* ─── Advanced (Charts + contrast escape) ─── */}
            <details className="group rounded-md border border-[var(--bb-border)] bg-[var(--bb-bg-3)]/40">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--bb-text-2)] flex items-center justify-between">
                Advanced
                <span className="text-[10px] font-normal normal-case text-[var(--bb-text-3)] group-open:hidden">Borders · charts · contrast</span>
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-3">
                {/* Per-edge sidebar borders */}
                <div>
                  <span className="text-xs font-medium">Sidebar borders</span>
                  <span className="block text-[10px] text-[var(--bb-text-3)] mb-1.5">Show or hide each edge of the sidebar.</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["top", "right", "bottom", "left"] as const).map((edge) => (
                      <button
                        key={edge}
                        type="button"
                        onClick={() => setBorders((b) => ({ ...b, [edge]: !b[edge] }))}
                        className={`h-7 rounded-md border text-[10px] capitalize transition-colors ${borders[edge] ? "border-[var(--bb-accent)] bg-[color-mix(in_oklab,var(--bb-accent)_10%,transparent)] text-[var(--bb-accent)]" : "border-[var(--bb-border)] text-[var(--bb-text-3)]"}`}
                      >
                        {edge}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span>
                    <span className="text-xs font-medium">Ignore contrast guard</span>
                    <span className="block text-[10px] text-[var(--bb-text-3)]">Allow low-contrast text (may be unreadable)</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={ignoreContrast}
                    onChange={(e) => setIgnoreContrast(e.target.checked)}
                    className="h-4 w-4 accent-[var(--bb-accent)]"
                  />
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {(COLOR_GROUPS.find((g) => g.title === "Charts")?.fields ?? []).map((field) => (
                    <ColorField key={field.key} field={field} value={getThemeColor(colors, field.key)} onChange={(value) => handleColorChange(field.key, value)} />
                  ))}
                </div>
              </div>
            </details>
          </div>

          {/* ─── Right: Live Preview ─── */}
          <aside className="order-1 shrink-0 space-y-3 overflow-y-auto border-b border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-4 md:order-2 md:border-b-0 md:border-l md:p-5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold">Live Preview</Label>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${contrastSafe ? "bg-[color-mix(in_oklab,var(--bb-positive)_10%,transparent)] text-[var(--bb-positive)]" : "bg-[color-mix(in_oklab,var(--bb-warning)_10%,transparent)] text-[var(--bb-warning)]"}`}>
                {contrastSafe ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {contrastSafe ? "AA contrast" : ignoreContrast ? "Unsafe allowed" : "Auto protected"}
              </span>
            </div>
            <div
              className="rounded-lg overflow-hidden border shadow-lg"
              style={{
                backgroundColor: previewBg,
                borderColor: previewBorder,
                borderRadius: `calc(${previewRadius} + 4px)`,
              }}
            >
              {/* Sidebar mockup */}
              <div className="flex h-28 md:h-48">
                <div
                  className="w-1/3 p-2 space-y-1.5 border-r"
                  style={{ backgroundColor: previewBg, borderColor: previewBorder }}
                >
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-2 w-full"
                      style={{
                        backgroundColor: i === 1 ? previewPrimary : previewBorder,
                        borderRadius: previewRadius,
                        opacity: i === 1 ? 1 : 0.5,
                      }}
                    />
                  ))}
                </div>
                <div className="w-2/3 p-2 space-y-2" style={{ backgroundColor: previewCard }}>
                  <div className="h-2 w-3/4" style={{ backgroundColor: previewText, borderRadius: previewRadius, opacity: 0.9 }} />
                  <div className="h-1.5 w-full" style={{ backgroundColor: previewMuted, borderRadius: previewRadius, opacity: 0.4 }} />
                  <div className="h-1.5 w-5/6" style={{ backgroundColor: previewMuted, borderRadius: previewRadius, opacity: 0.4 }} />
                  <div className="mt-3 h-5 w-16 flex items-center justify-center" style={{ backgroundColor: previewPrimary, borderRadius: previewRadius }}>
                    <div className="h-1.5 w-8" style={{ backgroundColor: previewCard }} />
                  </div>
                  {/* Chart bars */}
                  <div className="mt-2 flex items-end gap-1 h-8">
                    {[colors["chart.1"], colors["chart.2"], colors["chart.3"], colors["chart.4"]].map((c, i) => (
                      <div
                        key={i}
                        style={{
                          backgroundColor: c || previewPrimary,
                          height: `${40 + i * 15}%`,
                          flex: 1,
                          borderRadius: `${previewRadius} ${previewRadius} 0 0`,
                          opacity: 0.85,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom bar */}
              <div
                className="h-6 flex items-center px-2 gap-2 border-t"
                style={{ backgroundColor: previewBg, borderColor: previewBorder }}
              >
                <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: previewPrimary }} />
                <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: previewBorder }} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {contrastChecks.map((check) => (
                <div key={check.label} className="rounded-md border border-[var(--bb-border)] bg-[var(--bb-bg-1)] px-2 py-1.5 text-center">
                  <div className="text-[9px] text-[var(--bb-text-3)]">{check.label}</div>
                  <div className={`text-[11px] font-semibold tabular-nums ${check.ratio >= 4.5 ? "text-[var(--bb-positive)]" : "text-[var(--bb-warning)]"}`}>{check.ratio.toFixed(1)}:1</div>
                </div>
              ))}
            </div>

            {/* Radius preview */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-[var(--bb-text-3)]">Radius preview</Label>
              <div className="flex gap-1.5">
                {["sm", "md", "lg"].map((sz, i) => (
                  <div
                    key={sz}
                    className="flex-1 h-6 border"
                    style={{
                      borderRadius: previewRadius,
                      borderColor: previewBorder,
                      backgroundColor: i === 1 ? previewPrimary : previewCard,
                    }}
                  />
                ))}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-[var(--bb-text-2)]"
              onClick={() => { if (resetDraftRef.current) applyDraft(resetDraftRef.current); }}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Reset
            </Button>
          </aside>
        </div>

        <DialogFooter className="shrink-0 border-t border-[var(--bb-border)] bg-[var(--bb-bg-1)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-left text-[10px] text-[var(--bb-text-3)]">
            {isBuiltInTheme
              ? "The built-in theme stays unchanged"
              : isUpdatingTheme
                ? "Update keeps this theme ID · Save as new creates a separate theme"
                : "Creates and applies a new personal theme"}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {isUpdatingTheme && (
              <Button variant="outline" size="sm" onClick={() => handleSave("copy")}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Save as New Theme
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => handleSave(isBuiltInTheme ? "copy" : isUpdatingTheme ? "update" : "create")}
              className="bg-[var(--bb-accent)] text-[hsl(var(--primary-foreground))]"
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {isBuiltInTheme ? "Create & Apply" : isUpdatingTheme ? "Update Theme" : "Create & Apply"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
