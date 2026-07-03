import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SubtitleStyle {
  id?: string;
  user_id?: string;
  style_name: string;
  is_default: boolean;
  
  // Font Settings
  font_family: string;
  font_size: number;
  font_weight: string;
  
  // Color Settings
  text_color: string;
  background_color: string;
  outline_color: string;
  outline_width: number;
  
  // Legacy Position Settings (for backwards compatibility)
  position: "top" | "middle" | "bottom";
  vertical_margin: number;
  horizontal_padding: number;
  
  // Enhanced Position Settings (X/Y control)
  position_x: number;       // 0-100 (percentage from left)
  position_y: number;       // 0-100 (percentage from top)
  text_alignment: "left" | "center" | "right";
  
  // Effects
  shadow_enabled: boolean;
  animation_type: "fade" | "slide" | "none";
  
  // Word Tracking (Karaoke-style)
  word_highlight_enabled: boolean;
  word_highlight_color: string;
  
  // Multi-Language Subtitles
  show_original: boolean;
  original_position: "top" | "bottom"; // Relative to translated subtitle
  original_font_size: number;
  original_text_color: string;
  original_opacity: number;
}

export const DEFAULT_STYLE: SubtitleStyle = {
  style_name: "Default",
  is_default: true,
  font_family: "Arial",
  font_size: 24,
  font_weight: "normal",
  text_color: "#FFFFFF",
  background_color: "rgba(0,0,0,0.8)",
  outline_color: "#000000",
  outline_width: 2,
  position: "bottom",
  vertical_margin: 50,
  horizontal_padding: 16,
  position_x: 50,
  position_y: 85,
  text_alignment: "center",
  shadow_enabled: true,
  animation_type: "fade",
  word_highlight_enabled: false,
  word_highlight_color: "#FFD700",
  show_original: false,
  original_position: "top",
  original_font_size: 18,
  original_text_color: "#CCCCCC",
  original_opacity: 0.7,
};

export const FONT_OPTIONS = [
  "Arial",
  "Helvetica",
  "Verdana",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Comic Sans MS",
  "Trebuchet MS",
  "Roboto",
];

export function useSubtitleStyles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch user's styles
  const { data: styles, isLoading } = useQuery({
    queryKey: ["subtitle-styles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("srt_subtitle_styles")
        .select("*")
        .eq("user_id", user?.id)
        .order("is_default", { ascending: false });

      if (error) throw error;
      
      // Map database fields to interface, with defaults for new fields
      return (data || []).map((row: any) => ({
        ...row,
        position_x: row.position_x ?? 50,
        position_y: row.position_y ?? 85,
        text_alignment: row.text_alignment ?? "center",
        show_original: row.show_original ?? false,
        original_position: row.original_position ?? "top",
        original_font_size: row.original_font_size ?? 18,
        original_text_color: row.original_text_color ?? "#CCCCCC",
        original_opacity: row.original_opacity ?? 0.7,
      })) as SubtitleStyle[];
    },
    enabled: !!user?.id,
  });

  // Get default style (user's default or system default)
  const defaultStyle = styles?.find((s) => s.is_default) || DEFAULT_STYLE;

  // Save/create style mutation
  const saveMutation = useMutation({
    mutationFn: async (style: SubtitleStyle) => {
      if (!user?.id) throw new Error("User not authenticated");

      const styleData = {
        ...style,
        user_id: user.id,
      };

      if (style.id) {
        // Update existing style
        const { data, error } = await supabase
          .from("srt_subtitle_styles")
          .update(styleData)
          .eq("id", style.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new style
        const { data, error } = await supabase
          .from("srt_subtitle_styles")
          .insert(styleData)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtitle-styles"] });
    },
  });

  // Delete style mutation
  const deleteMutation = useMutation({
    mutationFn: async (styleId: string) => {
      const { error } = await supabase
        .from("srt_subtitle_styles")
        .delete()
        .eq("id", styleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtitle-styles"] });
    },
  });

  // Set as default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (styleId: string) => {
      if (!user?.id) throw new Error("User not authenticated");

      // First, unset all defaults
      await supabase
        .from("srt_subtitle_styles")
        .update({ is_default: false })
        .eq("user_id", user.id);

      // Set the new default
      const { error } = await supabase
        .from("srt_subtitle_styles")
        .update({ is_default: true })
        .eq("id", styleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtitle-styles"] });
    },
  });

  return {
    styles: styles || [],
    defaultStyle,
    isLoading,
    saveStyle: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    deleteStyle: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    setAsDefault: setDefaultMutation.mutate,
  };
}
