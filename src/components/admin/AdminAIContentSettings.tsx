import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Settings, Key, Wifi, WifiOff, Shield, AlertTriangle, Info, Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AIModelSettings {
  id: string;
  selected_model: string;
  allow_personal_api_key: boolean;
  allow_gateway_fallback_content: boolean;
  require_personal_key: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export function AdminAIContentSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai-model-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_model_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      // If no settings exist, create default
      if (!data) {
        const { data: newSettings, error: createError } = await supabase
          .from("ai_model_settings")
          .insert({
            selected_model: 'google/gemini-3.5-flash',
            allow_personal_api_key: false,
            allow_gateway_fallback_content: true,
            require_personal_key: false
          })
          .select()
          .single();
        
        if (createError) throw createError;
        return newSettings as AIModelSettings;
      }
      
      return data as AIModelSettings;
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<AIModelSettings>) => {
      if (!settings?.id) throw new Error("Settings not found");
      
      const { error } = await supabase
        .from("ai_model_settings")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-model-settings"] });
      toast.success("AI Content settings updated");
    },
    onError: (error) => {
      toast.error("Failed to update settings: " + error.message);
    },
  });

  const handleToggle = (field: keyof AIModelSettings, value: boolean) => {
    // Validation: If require_personal_key is true, gateway must be disabled
    if (field === "require_personal_key" && value) {
      updateSettingsMutation.mutate({
        require_personal_key: true,
        allow_gateway_fallback_content: false,
      });
    } else if (field === "allow_gateway_fallback_content" && value && settings?.require_personal_key) {
      updateSettingsMutation.mutate({
        allow_gateway_fallback_content: true,
        require_personal_key: false,
      });
    } else {
      updateSettingsMutation.mutate({ [field]: value });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Loading settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">AI Content Writer Settings</CardTitle>
            <CardDescription>Control Personal API Key access for users</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status Overview */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4 text-center">
            <Key className={`h-5 w-5 mx-auto mb-2 ${settings?.allow_personal_api_key ? 'text-green-500' : 'text-muted-foreground'}`} />
            <div className="text-sm font-medium">Personal API Keys</div>
            <Badge variant={settings?.allow_personal_api_key ? "default" : "secondary"} className="mt-1">
              {settings?.allow_personal_api_key ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            {settings?.allow_gateway_fallback_content ? (
              <Wifi className="h-5 w-5 mx-auto mb-2 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 mx-auto mb-2 text-red-500" />
            )}
            <div className="text-sm font-medium">Gateway Access</div>
            <Badge variant={settings?.allow_gateway_fallback_content ? "default" : "destructive"} className="mt-1">
              {settings?.allow_gateway_fallback_content ? "Allowed" : "Blocked"}
            </Badge>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <Shield className={`h-5 w-5 mx-auto mb-2 ${settings?.require_personal_key ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <div className="text-sm font-medium">Personal Key Required</div>
            <Badge variant={settings?.require_personal_key ? "outline" : "secondary"} className="mt-1">
              {settings?.require_personal_key ? "Required" : "Optional"}
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Settings Controls */}
        <div className="space-y-6">
          {/* Allow Personal API Key */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-primary" />
                <Label className="font-medium">Allow Personal API Keys</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Enable users to add their own Gemini API key for AI content generation (no credit cost)
              </p>
            </div>
            <Switch
              checked={settings?.allow_personal_api_key ?? false}
              onCheckedChange={(checked) => handleToggle("allow_personal_api_key", checked)}
              disabled={updateSettingsMutation.isPending}
            />
          </div>

          {/* Allow Gateway Fallback */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-primary" />
                <Label className="font-medium">Allow Gateway Access</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Allow users without personal API keys to use the app's default AI gateway (costs credits)
              </p>
            </div>
            <Switch
              checked={settings?.allow_gateway_fallback_content ?? true}
              onCheckedChange={(checked) => handleToggle("allow_gateway_fallback_content", checked)}
              disabled={updateSettingsMutation.isPending}
            />
          </div>

          {/* Require Personal Key */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-500" />
                <Label className="font-medium">Require Personal API Key</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Force users to provide their own API key to use AI content generation
              </p>
            </div>
            <Switch
              checked={settings?.require_personal_key ?? false}
              onCheckedChange={(checked) => handleToggle("require_personal_key", checked)}
              disabled={updateSettingsMutation.isPending || !settings?.allow_personal_api_key}
            />
          </div>
        </div>

        <Separator />

        {/* Info Boxes */}
        <div className="space-y-3">
          {settings?.allow_personal_api_key && (
            <Alert className="border-green-500/30 bg-green-500/5">
              <Sparkles className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-600 dark:text-green-400">
                <span className="font-medium">Personal API Keys Enabled:</span> Users can now add their own Gemini API key in AI Content Writer settings. Generation with personal keys costs 0 credits.
              </AlertDescription>
            </Alert>
          )}

          {!settings?.allow_gateway_fallback_content && (
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-600 dark:text-amber-400">
                <span className="font-medium">Gateway Access Disabled:</span> Users without personal API keys cannot generate AI content. They must add their own key first.
              </AlertDescription>
            </Alert>
          )}

          {settings?.require_personal_key && (
            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription>
                <span className="font-medium">Personal Key Required:</span> All users must provide their own Gemini API key. Gateway access is automatically disabled.
              </AlertDescription>
            </Alert>
          )}

          <Alert className="border-muted">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-muted-foreground text-sm">
              <span className="font-medium">How it works:</span>
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                <li>Personal API key: User pays Google directly, 0 app credits used</li>
                <li>Gateway access: User pays with app credits (1 credit per generation)</li>
                <li>When personal key is required, the settings icon appears for users to add their key</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  );
}
