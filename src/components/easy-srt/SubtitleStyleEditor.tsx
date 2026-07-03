import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  Palette,
  Type,
  AlignVerticalSpaceAround,
  Sparkles,
  RotateCcw,
  Save,
  Check,
  Languages,
  Move,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSubtitleStyles, SubtitleStyle, DEFAULT_STYLE, FONT_OPTIONS } from "@/hooks/useSubtitleStyles";
import { useDebounce } from "@/hooks/useDebounce";

interface SubtitleStyleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStyle?: SubtitleStyle;
  onStyleChange: (style: SubtitleStyle) => void;
  previewText?: string;
  originalText?: string;
  videoUrl?: string;
}

export function SubtitleStyleEditor({
  open,
  onOpenChange,
  currentStyle,
  onStyleChange,
  previewText = "ဒီနေ့ ဘယ်လို ဆက်ဆံရမလဲ",
  originalText = "How are you doing today?",
}: SubtitleStyleEditorProps) {
  const { saveStyle, isSaving } = useSubtitleStyles();
  const [localStyle, setLocalStyle] = useState<SubtitleStyle>(currentStyle || DEFAULT_STYLE);
  const [hasChanges, setHasChanges] = useState(false);

  // Debounce style changes for auto-save
  const debouncedStyle = useDebounce(localStyle, 500);

  // Sync local style with prop changes
  useEffect(() => {
    if (currentStyle) {
      setLocalStyle(currentStyle);
    }
  }, [currentStyle]);

  // Emit style changes in real-time
  useEffect(() => {
    onStyleChange(localStyle);
  }, [localStyle, onStyleChange]);

  // Auto-save when debounced style changes
  useEffect(() => {
    if (hasChanges && debouncedStyle.id) {
      saveStyle(debouncedStyle, {
        onSuccess: () => {
          setHasChanges(false);
        },
      });
    }
  }, [debouncedStyle, hasChanges, saveStyle]);

  const updateStyle = useCallback((updates: Partial<SubtitleStyle>) => {
    setLocalStyle((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  }, []);

  const handleReset = () => {
    setLocalStyle({ ...DEFAULT_STYLE, id: localStyle.id, user_id: localStyle.user_id });
    setHasChanges(true);
    toast.info("Style reset to default");
  };

  const handleSave = () => {
    saveStyle(localStyle, {
      onSuccess: () => {
        toast.success("Style saved successfully");
        setHasChanges(false);
      },
      onError: () => {
        toast.error("Failed to save style");
      },
    });
  };

  // Get preview styles for live preview
  const getPreviewStyles = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      fontFamily: localStyle.font_family,
      fontSize: `${localStyle.font_size}px`,
      fontWeight: localStyle.font_weight === "bold" ? "bold" : "normal",
      color: localStyle.text_color,
      backgroundColor: localStyle.background_color,
      padding: `8px ${localStyle.horizontal_padding}px`,
      borderRadius: "8px",
      textAlign: localStyle.text_alignment || "center",
      WebkitTextStroke: `${localStyle.outline_width}px ${localStyle.outline_color}`,
      paintOrder: "stroke fill",
    };

    if (localStyle.shadow_enabled) {
      baseStyle.textShadow = `2px 2px 4px ${localStyle.outline_color}`;
    }

    return baseStyle;
  };

  // Get original subtitle preview styles
  const getOriginalPreviewStyles = (): React.CSSProperties => {
    return {
      fontFamily: localStyle.font_family,
      fontSize: `${localStyle.original_font_size}px`,
      fontWeight: "normal",
      color: localStyle.original_text_color,
      backgroundColor: `rgba(0,0,0,${localStyle.original_opacity})`,
      padding: `6px ${localStyle.horizontal_padding}px`,
      borderRadius: "6px",
      textAlign: localStyle.text_alignment || "center",
      opacity: localStyle.original_opacity,
    };
  };

  // Render word with highlighting
  const renderPreviewText = () => {
    if (!localStyle.word_highlight_enabled) {
      return <span>{previewText}</span>;
    }

    const words = previewText.split(" ");
    const highlightIndex = Math.floor(words.length / 2); // Highlight middle word

    return (
      <>
        {words.map((word, i) => (
          <span
            key={i}
            style={{
              color: i === highlightIndex ? localStyle.word_highlight_color : localStyle.text_color,
              transform: i === highlightIndex ? "scale(1.1)" : "scale(1)",
              textShadow: i === highlightIndex ? `0 0 10px ${localStyle.word_highlight_color}` : "none",
              transition: "all 0.15s ease-out",
              display: "inline-block",
            }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </>
    );
  };

  // Calculate preview position
  const getPreviewPosition = (): React.CSSProperties => {
    return {
      position: "absolute",
      left: `${localStyle.position_x}%`,
      top: `${localStyle.position_y}%`,
      transform: `translate(-50%, -50%)`,
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col bg-background/95 backdrop-blur-xl border-border/50 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/20">
              <Palette className="h-5 w-5 text-primary" />
            </div>
            Subtitle Style Settings
            {hasChanges && (
              <span className="text-xs text-amber-500 ml-2">(unsaved)</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 pb-6 space-y-6">
            {/* Live Preview */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 aspect-video"
            >
              <div className="absolute inset-0 bg-[url('/placeholder.svg')] opacity-30" />
              
              {/* Subtitle container with X/Y positioning */}
              <div style={getPreviewPosition()} className="max-w-[80%]">
                {/* Original subtitle (if enabled) - shown above */}
                {localStyle.show_original && localStyle.original_position === "top" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={getOriginalPreviewStyles()}
                    className="mb-2"
                  >
                    {originalText}
                  </motion.div>
                )}
                
                {/* Translated subtitle */}
                <motion.div
                  key={JSON.stringify(localStyle)}
                  initial={localStyle.animation_type === "fade" ? { opacity: 0 } : { y: 20 }}
                  animate={localStyle.animation_type === "fade" ? { opacity: 1 } : { y: 0 }}
                  style={getPreviewStyles()}
                >
                  {renderPreviewText()}
                </motion.div>

                {/* Original subtitle (if enabled) - shown below */}
                {localStyle.show_original && localStyle.original_position === "bottom" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={getOriginalPreviewStyles()}
                    className="mt-2"
                  >
                    {originalText}
                  </motion.div>
                )}
              </div>
            </motion.div>

            <Separator />

            {/* Font Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Type className="h-4 w-4 text-primary" />
                <h3 className="font-medium">Font Settings</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Font Family</Label>
                  <Select
                    value={localStyle.font_family}
                    onValueChange={(v) => updateStyle({ font_family: v })}
                  >
                    <SelectTrigger className="bg-card/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                          {font}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Font Weight</Label>
                  <Select
                    value={localStyle.font_weight}
                    onValueChange={(v) => updateStyle({ font_weight: v })}
                  >
                    <SelectTrigger className="bg-card/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="bold">Bold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs">Font Size</Label>
                  <span className="text-xs text-foreground font-medium">{localStyle.font_size}px</span>
                </div>
                <Slider
                  value={[localStyle.font_size]}
                  min={12}
                  max={48}
                  step={1}
                  onValueChange={([v]) => updateStyle({ font_size: v })}
                />
              </div>
            </div>

            <Separator />

            {/* Color Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Palette className="h-4 w-4 text-primary" />
                <h3 className="font-medium">Colors</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Text Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={localStyle.text_color}
                      onChange={(e) => updateStyle({ text_color: e.target.value })}
                      className="w-12 h-9 p-1 cursor-pointer"
                    />
                    <Input
                      value={localStyle.text_color}
                      onChange={(e) => updateStyle({ text_color: e.target.value })}
                      className="flex-1 bg-card/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Background</Label>
                  <Input
                    value={localStyle.background_color}
                    onChange={(e) => updateStyle({ background_color: e.target.value })}
                    className="bg-card/50"
                    placeholder="rgba(0,0,0,0.8)"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Outline Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={localStyle.outline_color}
                      onChange={(e) => updateStyle({ outline_color: e.target.value })}
                      className="w-12 h-9 p-1 cursor-pointer"
                    />
                    <Input
                      value={localStyle.outline_color}
                      onChange={(e) => updateStyle({ outline_color: e.target.value })}
                      className="flex-1 bg-card/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-xs">Outline Width</Label>
                    <span className="text-xs text-foreground font-medium">{localStyle.outline_width}px</span>
                  </div>
                  <Slider
                    value={[localStyle.outline_width]}
                    min={0}
                    max={5}
                    step={1}
                    onValueChange={([v]) => updateStyle({ outline_width: v })}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Enhanced Position Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Move className="h-4 w-4 text-primary" />
                <h3 className="font-medium">Position (X/Y Control)</h3>
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Quick Presets</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Top", x: 50, y: 15 },
                    { label: "Middle", x: 50, y: 50 },
                    { label: "Bottom", x: 50, y: 85 },
                  ].map((preset) => (
                    <Button
                      key={preset.label}
                      variant={localStyle.position_x === preset.x && localStyle.position_y === preset.y ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateStyle({ position_x: preset.x, position_y: preset.y })}
                      className={cn(
                        "capitalize",
                        localStyle.position_x === preset.x && localStyle.position_y === preset.y && "bg-primary text-primary-foreground"
                      )}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* X Position Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs">X Position (Horizontal)</Label>
                  <span className="text-xs text-foreground font-medium">{localStyle.position_x}%</span>
                </div>
                <Slider
                  value={[localStyle.position_x]}
                  min={10}
                  max={90}
                  step={1}
                  onValueChange={([v]) => updateStyle({ position_x: v })}
                />
              </div>

              {/* Y Position Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs">Y Position (Vertical)</Label>
                  <span className="text-xs text-foreground font-medium">{localStyle.position_y}%</span>
                </div>
                <Slider
                  value={[localStyle.position_y]}
                  min={5}
                  max={95}
                  step={1}
                  onValueChange={([v]) => updateStyle({ position_y: v })}
                />
              </div>

              {/* Text Alignment */}
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Text Alignment</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["left", "center", "right"] as const).map((align) => (
                    <Button
                      key={align}
                      variant={localStyle.text_alignment === align ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateStyle({ text_alignment: align })}
                      className={cn(
                        "capitalize",
                        localStyle.text_alignment === align && "bg-primary text-primary-foreground"
                      )}
                    >
                      {align}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Padding */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs">Horizontal Padding</Label>
                  <span className="text-xs text-foreground font-medium">{localStyle.horizontal_padding}px</span>
                </div>
                <Slider
                  value={[localStyle.horizontal_padding]}
                  min={8}
                  max={48}
                  step={2}
                  onValueChange={([v]) => updateStyle({ horizontal_padding: v })}
                />
              </div>
            </div>

            <Separator />

            {/* Multi-Language Subtitles */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Languages className="h-4 w-4 text-blue-500" />
                <h3 className="font-medium">Multi-Language Subtitles</h3>
              </div>

              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-foreground">Show Original (English)</Label>
                    <p className="text-xs text-muted-foreground">
                      Display original text alongside translation
                    </p>
                  </div>
                  <Switch
                    checked={localStyle.show_original}
                    onCheckedChange={(v) => updateStyle({ show_original: v })}
                  />
                </div>

                {localStyle.show_original && (
                  <div className="space-y-4 pt-2">
                    {/* Original Position */}
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs">Original Position</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["top", "bottom"] as const).map((pos) => (
                          <Button
                            key={pos}
                            variant={localStyle.original_position === pos ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateStyle({ original_position: pos })}
                            className={cn(
                              "capitalize",
                              localStyle.original_position === pos && "bg-blue-500 text-white"
                            )}
                          >
                            {pos === "top" ? "Above Translation" : "Below Translation"}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Original Font Size */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-muted-foreground text-xs">Original Font Size</Label>
                        <span className="text-xs text-foreground font-medium">{localStyle.original_font_size}px</span>
                      </div>
                      <Slider
                        value={[localStyle.original_font_size]}
                        min={10}
                        max={36}
                        step={1}
                        onValueChange={([v]) => updateStyle({ original_font_size: v })}
                      />
                    </div>

                    {/* Original Color */}
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs">Original Text Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={localStyle.original_text_color}
                          onChange={(e) => updateStyle({ original_text_color: e.target.value })}
                          className="w-12 h-9 p-1 cursor-pointer"
                        />
                        <Input
                          value={localStyle.original_text_color}
                          onChange={(e) => updateStyle({ original_text_color: e.target.value })}
                          className="flex-1 bg-card/50"
                        />
                      </div>
                    </div>

                    {/* Original Opacity */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-muted-foreground text-xs">Original Opacity</Label>
                        <span className="text-xs text-foreground font-medium">{Math.round(localStyle.original_opacity * 100)}%</span>
                      </div>
                      <Slider
                        value={[localStyle.original_opacity * 100]}
                        min={30}
                        max={100}
                        step={5}
                        onValueChange={([v]) => updateStyle({ original_opacity: v / 100 })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Effects */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-medium">Effects</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Shadow</Label>
                  <Switch
                    checked={localStyle.shadow_enabled}
                    onCheckedChange={(v) => updateStyle({ shadow_enabled: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Animation</Label>
                  <Select
                    value={localStyle.animation_type}
                    onValueChange={(v) => updateStyle({ animation_type: v as SubtitleStyle["animation_type"] })}
                  >
                    <SelectTrigger className="bg-card/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fade">Fade</SelectItem>
                      <SelectItem value="slide">Slide Up</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Word Tracking (Karaoke) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h3 className="font-medium">Word Highlighting (TikTok/CapCut Style)</h3>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-foreground">Highlight Current Word</Label>
                    <p className="text-xs text-muted-foreground">
                      Highlight words as they're spoken with scale & glow effect
                    </p>
                  </div>
                  <Switch
                    checked={localStyle.word_highlight_enabled}
                    onCheckedChange={(v) => updateStyle({ word_highlight_enabled: v })}
                  />
                </div>

                {localStyle.word_highlight_enabled && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">Highlight Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={localStyle.word_highlight_color}
                        onChange={(e) => updateStyle({ word_highlight_color: e.target.value })}
                        className="w-12 h-9 p-1 cursor-pointer"
                      />
                      <Input
                        value={localStyle.word_highlight_color}
                        onChange={(e) => updateStyle({ word_highlight_color: e.target.value })}
                        className="flex-1 bg-card/50"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="gap-2"
          >
            {isSaving ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
                <Save className="h-4 w-4" />
              </motion.div>
            ) : hasChanges ? (
              <Save className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isSaving ? "Saving..." : hasChanges ? "Save" : "Saved"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
