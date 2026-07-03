import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

interface ThemeSettings {
  id: string;
  theme_name: string;
  primary_color: string;
  updated_at: string;
  updated_by: string | null;
}

const THEME_COLORS = {
  teal: '160 100% 50%',
};

const STORAGE_KEY = 'app-theme-settings';

// Helper functions for localStorage
const getStoredTheme = (): ThemeSettings | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const storeTheme = (theme: ThemeSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch (e) {
    console.warn('Failed to store theme:', e);
  }
};

export const useThemeSettings = () => {
  const queryClient = useQueryClient();

  const { data: theme, isLoading } = useQuery({
    queryKey: ["theme-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      // Store in localStorage for instant loading next time
      if (data) {
        storeTheme(data);
      }
      
      return data as ThemeSettings | null;
    },
    initialData: getStoredTheme,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  // Apply theme immediately when it changes
  useEffect(() => {
    if (theme?.primary_color) {
      applyTheme(theme.primary_color);
    }
  }, [theme]);


  const updateTheme = useMutation({
    mutationFn: async ({ theme_name, primary_color }: { theme_name: string; primary_color: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");

      // Apply theme immediately for instant feedback
      applyTheme(primary_color);
      
      const newTheme: ThemeSettings = {
        id: '',
        theme_name,
        primary_color,
        updated_at: new Date().toISOString(),
        updated_by: session.session.user.id,
      };
      
      // Store immediately in localStorage
      storeTheme(newTheme);
      queryClient.setQueryData(["theme-settings"], newTheme);

      // Get the existing theme ID
      const { data: existingTheme } = await supabase
        .from("theme_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (!existingTheme) {
        const { error } = await supabase
          .from("theme_settings")
          .insert({
            theme_name,
            primary_color,
            updated_by: session.session.user.id,
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("theme_settings")
          .update({
            theme_name,
            primary_color,
            updated_at: new Date().toISOString(),
            updated_by: session.session.user.id,
          })
          .eq("id", existingTheme.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Theme updated successfully");
    },
    onError: (error) => {
      console.error("Theme update error:", error);
      toast.error("Failed to update theme");
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ["theme-settings"] });
    },
  });

  return {
    theme,
    isLoading,
    updateTheme: updateTheme.mutate,
    isUpdating: updateTheme.isPending,
    THEME_COLORS,
  };
};

// Helper function to apply theme colors to CSS variables
function applyTheme(primaryColor: string) {
  const root = document.documentElement;
  
  root.style.setProperty('--primary', primaryColor);
  root.style.setProperty('--secondary', primaryColor);
  root.style.setProperty('--accent', primaryColor);
  root.style.setProperty('--ring', primaryColor);
  
  // Update gradient colors
  const [h, s, l] = primaryColor.split(' ').map(v => parseFloat(v.replace('%', '')));
  const lighterL = Math.min(l + 5, 100);
  root.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${h} ${s}% ${l}%) 0%, hsl(${h} ${Math.max(s - 7, 0)}% ${Math.max(l - 5, 0)}%) 100%)`);
  root.style.setProperty('--gradient-accent', `linear-gradient(135deg, hsl(${h} ${s}% ${l}%) 0%, hsl(${h} ${Math.max(s - 7, 0)}% ${Math.max(l - 5, 0)}%) 100%)`);
  
  // Update glow colors
  root.style.setProperty('--shadow-glow', `0 0 40px hsl(${h} ${s}% ${l}% / 0.2)`);
  root.style.setProperty('--shadow-card', `0 4px 12px -4px hsl(${h} ${s}% ${l}% / 0.1)`);
  root.style.setProperty('--accent-glow', `${h} ${s}% ${l}% / 0.15`);
  
  // Update sidebar colors
  root.style.setProperty('--sidebar-primary', primaryColor);
  root.style.setProperty('--sidebar-ring', primaryColor);
}
