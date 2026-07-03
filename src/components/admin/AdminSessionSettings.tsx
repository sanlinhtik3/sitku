import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Clock, Smartphone, AlertTriangle, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface SessionSettings {
  id: string;
  global_enforce_single_device: boolean;
  default_session_timeout_minutes: number;
  max_concurrent_sessions_default: number;
  suspicious_login_threshold: number;
}

export function AdminSessionSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('session_settings')
        .select('*')
        .single();

      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load session settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings || !user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('session_settings')
        .update({
          global_enforce_single_device: settings.global_enforce_single_device,
          default_session_timeout_minutes: settings.default_session_timeout_minutes,
          max_concurrent_sessions_default: settings.max_concurrent_sessions_default,
          suspicious_login_threshold: settings.suspicious_login_threshold,
          updated_at: new Date().toISOString(),
          updated_by: user.id
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast.success('Session settings updated successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">No session settings found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Session Management Settings</h2>
          <p className="text-muted-foreground mt-1">
            Configure global session security and behavior
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Single Device Enforcement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Single Device Mode
            </CardTitle>
            <CardDescription>
              Restrict users to one active session at a time
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="enforce-single">
                Enforce globally for all users
              </Label>
              <Switch
                id="enforce-single"
                checked={settings.global_enforce_single_device}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, global_enforce_single_device: checked })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              When enabled, users will be automatically logged out from previous devices when logging in from a new device. Individual user settings can override this.
            </p>
          </CardContent>
        </Card>

        {/* Session Timeout */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Session Timeout
            </CardTitle>
            <CardDescription>
              Default session duration in minutes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (minutes)</Label>
              <Input
                id="timeout"
                type="number"
                min="1"
                value={settings.default_session_timeout_minutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_session_timeout_minutes: parseInt(e.target.value) || 10080
                  })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Default: 10080 minutes (7 days). Sessions will automatically expire after this duration of inactivity.
            </p>
          </CardContent>
        </Card>

        {/* Max Concurrent Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Concurrent Sessions
            </CardTitle>
            <CardDescription>
              Maximum active sessions per user
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="max-sessions">Max Sessions</Label>
              <Input
                id="max-sessions"
                type="number"
                min="1"
                max="20"
                value={settings.max_concurrent_sessions_default}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_concurrent_sessions_default: parseInt(e.target.value) || 5
                  })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              When a user exceeds this limit, the oldest sessions will be automatically logged out.
            </p>
          </CardContent>
        </Card>

        {/* Suspicious Login Threshold */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Security Alerts
            </CardTitle>
            <CardDescription>
              Suspicious login detection threshold
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="threshold">Alert Threshold</Label>
              <Input
                id="threshold"
                type="number"
                min="1"
                max="10"
                value={settings.suspicious_login_threshold}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    suspicious_login_threshold: parseInt(e.target.value) || 3
                  })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Number of failed login attempts before flagging as suspicious activity.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-sm">Session Management Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>✓ Automatic session tracking with geolocation</p>
          <p>✓ Device type and browser detection</p>
          <p>✓ Real-time session activity monitoring</p>
          <p>✓ Admin controls to revoke user sessions</p>
          <p>✓ Per-user session limits and restrictions</p>
        </CardContent>
      </Card>
    </div>
  );
}