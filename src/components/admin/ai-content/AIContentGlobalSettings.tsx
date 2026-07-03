import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, Key, Zap, Shield, AlertTriangle, Info } from "lucide-react";

interface AIModelSettings {
  id: string;
  selected_model: string;
  allow_personal_api_key: boolean | null;
  allow_gateway_fallback_content: boolean | null;
  require_personal_key: boolean | null;
  updated_at: string | null;
  updated_by: string | null;
}

export function AIContentGlobalSettings() {
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
      if (!settings?.id) throw new Error("No settings found");
      
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
      toast.success("Settings updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update settings: " + error.message);
    },
  });

  const handleToggle = (key: keyof AIModelSettings, value: boolean) => {
    if (key === 'require_personal_key' && value) {
      updateSettingsMutation.mutate({ 
        require_personal_key: true,
        allow_gateway_fallback_content: false 
      });
    } else if (key === 'allow_gateway_fallback_content' && value && settings?.require_personal_key) {
      updateSettingsMutation.mutate({ 
        allow_gateway_fallback_content: true,
        require_personal_key: false 
      });
    } else {
      updateSettingsMutation.mutate({ [key]: value });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Global AI Content Settings
        </CardTitle>
        <CardDescription>
          Configure how users can access the AI content generation feature
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Settings Overview */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={settings?.allow_personal_api_key ? "default" : "secondary"}>
            <Key className="mr-1 h-3 w-3" />
            Personal Keys: {settings?.allow_personal_api_key ? "Allowed" : "Disabled"}
          </Badge>
          <Badge variant={settings?.allow_gateway_fallback_content ? "default" : "secondary"}>
            <Zap className="mr-1 h-3 w-3" />
            Gateway: {settings?.allow_gateway_fallback_content ? "Enabled" : "Disabled"}
          </Badge>
          {settings?.require_personal_key && (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Personal Key Required
            </Badge>
          )}
        </div>

        {/* Settings Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <div className="space-y-1">
              <Label htmlFor="allow-personal-key" className="text-base font-medium">
                Allow Personal API Keys
              </Label>
              <p className="text-sm text-muted-foreground">
                Users can use their own Gemini API keys for generation
              </p>
            </div>
            <Switch
              id="allow-personal-key"
              checked={settings?.allow_personal_api_key ?? false}
              onCheckedChange={(checked) => handleToggle('allow_personal_api_key', checked)}
              disabled={updateSettingsMutation.isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <div className="space-y-1">
              <Label htmlFor="allow-gateway" className="text-base font-medium">
                Allow Gateway (Uses Credits)
              </Label>
              <p className="text-sm text-muted-foreground">
                Users without personal keys can use the app's AI gateway (costs credits)
              </p>
            </div>
            <Switch
              id="allow-gateway"
              checked={settings?.allow_gateway_fallback_content ?? false}
              onCheckedChange={(checked) => handleToggle('allow_gateway_fallback_content', checked)}
              disabled={updateSettingsMutation.isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <div className="space-y-1">
              <Label htmlFor="require-personal-key" className="text-base font-medium">
                Require Personal Key
              </Label>
              <p className="text-sm text-muted-foreground">
                Force all users to use their own API keys (disables gateway)
              </p>
            </div>
            <Switch
              id="require-personal-key"
              checked={settings?.require_personal_key ?? false}
              onCheckedChange={(checked) => handleToggle('require_personal_key', checked)}
              disabled={updateSettingsMutation.isPending}
            />
          </div>
        </div>

        {/* Info Alerts */}
        {settings?.require_personal_key && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Personal API key is required. Users without a key cannot use AI content generation.
            </AlertDescription>
          </Alert>
        )}

        {!settings?.allow_personal_api_key && !settings?.allow_gateway_fallback_content && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              AI content generation is currently disabled for all users. Enable at least one option.
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>How it works:</strong> Global settings apply to all users by default. 
            Use the "Users" tab to override settings for specific users.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
