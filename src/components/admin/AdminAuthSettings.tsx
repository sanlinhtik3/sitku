import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shield, Save, RefreshCw, AlertTriangle, Chrome, Mail } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface AuthSettings {
  id: string;
  signup_enabled: boolean;
  signin_enabled: boolean;
  rate_limit_enabled: boolean;
  max_login_attempts: number;
  lockout_duration_minutes: number;
  require_email_verification: boolean;
  unverified_cleanup_days: number;
  block_disposable_emails: boolean;
  google_auth_enabled: boolean;
  email_auth_enabled: boolean;
  updated_at: string;
}

interface LoginAttempt {
  id: string;
  email: string;
  ip_address: string;
  attempt_time: string;
  success: boolean;
  attempt_type: string;
}

const AdminAuthSettings = () => {
  const [settings, setSettings] = useState<AuthSettings | null>(null);
  const [recentAttempts, setRecentAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('auth_settings')
        .select('*')
        .single();

      if (error) throw error;
      setSettings(data);
    } catch (error: any) {
      toast.error("Failed to load auth settings");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentAttempts = async () => {
    try {
      const { data, error } = await supabase
        .from('login_attempts')
        .select('*')
        .order('attempt_time', { ascending: false })
        .limit(20);

      if (error) throw error;
      setRecentAttempts(data || []);
    } catch (error: any) {
      console.error("Failed to load login attempts:", error);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchRecentAttempts();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-auth-settings', {
        body: {
          signup_enabled: settings.signup_enabled,
          signin_enabled: settings.signin_enabled,
          rate_limit_enabled: settings.rate_limit_enabled,
          max_login_attempts: settings.max_login_attempts,
          lockout_duration_minutes: settings.lockout_duration_minutes,
          require_email_verification: settings.require_email_verification,
          unverified_cleanup_days: settings.unverified_cleanup_days,
          block_disposable_emails: settings.block_disposable_emails,
          google_auth_enabled: settings.google_auth_enabled,
          email_auth_enabled: settings.email_auth_enabled,
        }
      });

      if (error) throw error;
      
      toast.success("Auth settings updated successfully");
      setSettings(data.data);
    } catch (error: any) {
      toast.error(error.message || "Failed to update settings");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const maskEmail = (email: string) => {
    const [local, domain] = email.split('@');
    if (local.length <= 2) return email;
    return `${local.substring(0, 2)}***@${domain}`;
  };

  if (loading || !settings) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-primary">Loading settings...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Authentication Settings</h1>
          <p className="text-muted-foreground">
            Manage sign-in, sign-up, and rate limiting settings
          </p>
        </div>
        <Button onClick={fetchRecentAttempts} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Settings
          </CardTitle>
          <CardDescription>
            Control authentication access and security policies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Auth Methods Warning */}
          {!settings.google_auth_enabled && !settings.email_auth_enabled && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">Warning: All authentication methods disabled</p>
                <p className="text-sm text-muted-foreground">
                  Users won't be able to sign in if both Google and Email authentication are disabled.
                </p>
              </div>
            </div>
          )}

          {/* Authentication Methods Section */}
          <div className="space-y-4 p-4 border border-border/50 rounded-lg bg-card/50">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Authentication Methods</h3>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="email-auth-enabled">Email/Password Sign-In</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow users to sign in with email and password
                  </p>
                </div>
              </div>
              <Switch
                id="email-auth-enabled"
                checked={settings.email_auth_enabled}
                onCheckedChange={(checked) => 
                  setSettings({ ...settings, email_auth_enabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex items-center gap-3">
                <Chrome className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="google-auth-enabled">Google Sign-In</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow users to sign in with their Google account
                  </p>
                </div>
              </div>
              <Switch
                id="google-auth-enabled"
                checked={settings.google_auth_enabled}
                onCheckedChange={(checked) => 
                  setSettings({ ...settings, google_auth_enabled: checked })
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="signup-enabled">Enable Sign Up</Label>
              <p className="text-sm text-muted-foreground">
                Allow new users to create accounts
              </p>
            </div>
            <Switch
              id="signup-enabled"
              checked={settings.signup_enabled}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, signup_enabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="signin-enabled">Enable Sign In</Label>
              <p className="text-sm text-muted-foreground">
                Allow users to sign in to their accounts
              </p>
            </div>
            <Switch
              id="signin-enabled"
              checked={settings.signin_enabled}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, signin_enabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="rate-limit-enabled">Enable Rate Limiting</Label>
              <p className="text-sm text-muted-foreground">
                Protect against brute force attacks
              </p>
            </div>
            <Switch
              id="rate-limit-enabled"
              checked={settings.rate_limit_enabled}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, rate_limit_enabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="require-email-verification">Require Email Verification</Label>
              <p className="text-sm text-muted-foreground">
                Users must verify email before accessing the app
              </p>
            </div>
            <Switch
              id="require-email-verification"
              checked={settings.require_email_verification}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, require_email_verification: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="block-disposable-emails">Block Disposable Emails</Label>
              <p className="text-sm text-muted-foreground">
                Prevent signups from temporary email services
              </p>
            </div>
            <Switch
              id="block-disposable-emails"
              checked={settings.block_disposable_emails}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, block_disposable_emails: checked })
              }
            />
          </div>

          {settings.rate_limit_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="max-attempts">Maximum Login Attempts</Label>
                <Input
                  id="max-attempts"
                  type="number"
                  min="1"
                  max="20"
                  value={settings.max_login_attempts}
                  onChange={(e) => 
                    setSettings({ 
                      ...settings, 
                      max_login_attempts: parseInt(e.target.value) || 5 
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Number of failed attempts before lockout
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lockout-duration">Lockout Duration (minutes)</Label>
                <Input
                  id="lockout-duration"
                  type="number"
                  min="1"
                  max="1440"
                  value={settings.lockout_duration_minutes}
                  onChange={(e) => 
                    setSettings({ 
                      ...settings, 
                      lockout_duration_minutes: parseInt(e.target.value) || 15 
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  How long users are locked out after exceeding max attempts
                </p>
              </div>
            </>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Login Attempts</CardTitle>
          <CardDescription>
            Monitor authentication activity in your application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentAttempts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No login attempts recorded yet
                  </TableCell>
                </TableRow>
              ) : (
                recentAttempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell className="font-mono text-sm">
                      {maskEmail(attempt.email)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {attempt.ip_address}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {attempt.attempt_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {attempt.success ? (
                        <Badge className="bg-green-500">Success</Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(attempt.attempt_time).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminAuthSettings;
