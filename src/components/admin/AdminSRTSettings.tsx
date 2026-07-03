import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Users,
  Cpu,
  Wifi,
  WifiOff,
  Key,
  Loader2,
  Save,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { GEMINI_MODELS } from "@/hooks/useSRTSettings";

interface GlobalSettings {
  id: string;
  allow_personal_api_key: boolean;
  allow_gateway_access: boolean;
  gateway_model: string;
  updated_at: string;
  updated_by: string | null;
}

interface UserSettings {
  id: string;
  user_id: string;
  gemini_api_key: string | null;
  gemini_model: string;
  allow_gateway_fallback: boolean;
  total_translations: number;
  last_translation_at: string | null;
  created_at: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

export function AdminSRTSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch global settings
  const { data: globalSettings, isLoading: globalLoading } = useQuery({
    queryKey: ["admin-srt-global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("srt_global_settings")
        .select("*")
        .single();
      if (error) throw error;
      return data as GlobalSettings;
    },
  });

  // Fetch user settings with profiles
  const { data: userSettingsList, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-srt-user-settings"],
    queryFn: async () => {
      const { data: settings, error } = await supabase
        .from("srt_user_settings")
        .select("*")
        .order("total_translations", { ascending: false });
      if (error) throw error;

      // Fetch profiles separately
      const userIds = settings.map((s) => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, avatar_url")
        .in("user_id", userIds);

      // Merge profiles with settings
      return settings.map((setting) => ({
        ...setting,
        profiles: profiles?.find((p) => p.user_id === setting.user_id) || null,
      })) as UserSettings[];
    },
  });

  // Update global settings
  const updateGlobalSettings = useMutation({
    mutationFn: async (updates: Partial<GlobalSettings>) => {
      const { error } = await supabase
        .from("srt_global_settings")
        .update({
          ...updates,
          updated_by: user?.id,
        })
        .eq("id", globalSettings?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-srt-global-settings"] });
      toast.success("Global settings updated");
    },
    onError: (error: any) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  // Toggle user gateway access
  const toggleUserGateway = useMutation({
    mutationFn: async ({ userId, allow }: { userId: string; allow: boolean }) => {
      const { error } = await supabase
        .from("srt_user_settings")
        .update({
          allow_gateway_fallback: allow,
          granted_at: allow ? new Date().toISOString() : null,
          granted_by: allow ? user?.id : null,
        })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-srt-user-settings"] });
      toast.success("User access updated");
    },
    onError: (error: any) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const filteredUsers = userSettingsList?.filter((u) => {
    if (!searchQuery) return true;
    const name = u.profiles?.full_name?.toLowerCase() || "";
    const email = u.profiles?.email?.toLowerCase() || "";
    return name.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase());
  });

  // Stats
  const totalUsers = userSettingsList?.length || 0;
  const usersWithKey = userSettingsList?.filter((u) => u.gemini_api_key).length || 0;
  const usersWithGateway = userSettingsList?.filter((u) => u.allow_gateway_fallback && !u.gemini_api_key).length || 0;
  const totalTranslations = userSettingsList?.reduce((sum, u) => sum + u.total_translations, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Easy SRT Settings</h1>
        <p className="text-muted-foreground">Manage AI settings for Easy Burmese SRT</p>
      </div>

      <Tabs defaultValue="global" className="space-y-4">
        <TabsList>
          <TabsTrigger value="global" className="gap-2">
            <Settings className="h-4 w-4" />
            Global Settings
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            User Management
          </TabsTrigger>
        </TabsList>

        {/* Global Settings Tab */}
        <TabsContent value="global" className="space-y-4">
          {globalLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-primary">{totalUsers}</div>
                    <p className="text-xs text-muted-foreground">Total Users</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-green-500">{usersWithKey}</div>
                    <p className="text-xs text-muted-foreground">Personal API Key</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-amber-500">{usersWithGateway}</div>
                    <p className="text-xs text-muted-foreground">Gateway Only</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{totalTranslations}</div>
                    <p className="text-xs text-muted-foreground">Total Translations</p>
                  </CardContent>
                </Card>
              </div>

              {/* Settings Card */}
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-amber-500" />
                    Global AI Settings
                  </CardTitle>
                  <CardDescription>
                    Control AI access for all Easy SRT users
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Allow Personal API Keys */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/30">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        Allow Personal API Keys
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Users can use their own Gemini API keys
                      </p>
                    </div>
                    <Switch
                      checked={globalSettings?.allow_personal_api_key}
                      onCheckedChange={(checked) =>
                        updateGlobalSettings.mutate({ allow_personal_api_key: checked })
                      }
                    />
                  </div>

                  {/* Allow Gateway Access */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/30">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-2">
                        {globalSettings?.allow_gateway_access ? (
                          <Wifi className="h-4 w-4 text-green-500" />
                        ) : (
                          <WifiOff className="h-4 w-4" />
                        )}
                        Allow App Gateway Access
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Users without personal keys can use app's AI (costs money!)
                      </p>
                    </div>
                    <Switch
                      checked={globalSettings?.allow_gateway_access}
                      onCheckedChange={(checked) =>
                        updateGlobalSettings.mutate({ allow_gateway_access: checked })
                      }
                    />
                  </div>

                  {/* Warning */}
                  {globalSettings?.allow_gateway_access && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
                    >
                      <div className="flex items-center gap-2 text-amber-500">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Cost Warning</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Gateway ဖွင့်ထားလျှင် app costs တက်နိုင်ပါသည်။ User management tab မှ access ကို control လုပ်ပါ။
                      </p>
                    </motion.div>
                  )}

                  {/* Gateway Model */}
                  <div className="space-y-2">
                    <Label>Gateway Model (when enabled)</Label>
                    <Select
                      value={globalSettings?.gateway_model || "gemini-3.5-flash"}
                      onValueChange={(value) =>
                        updateGlobalSettings.mutate({ gateway_model: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GEMINI_MODELS.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.icon} {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Gateway users တွေ သုံးမယ့် default model
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* User Management Tab */}
        <TabsContent value="users" className="space-y-4">
          {/* Search & Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={() => refetchUsers()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          {/* Users Table */}
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredUsers && filteredUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>API Key</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Translations</TableHead>
                      <TableHead>Gateway</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((userSetting) => (
                      <TableRow key={userSetting.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              {userSetting.profiles?.avatar_url ? (
                                <img
                                  src={userSetting.profiles.avatar_url}
                                  alt=""
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <span className="text-xs font-medium">
                                  {userSetting.profiles?.full_name?.[0] || "?"}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {userSetting.profiles?.full_name || "Unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {userSetting.profiles?.email || userSetting.user_id.slice(0, 8)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {userSetting.gemini_api_key ? (
                            <Badge className="bg-green-500/20 text-green-500 border-0">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Personal
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground">
                              <XCircle className="h-3 w-3 mr-1" />
                              None
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{userSetting.gemini_model}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{userSetting.total_translations}</span>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={userSetting.allow_gateway_fallback}
                            onCheckedChange={(checked) =>
                              toggleUserGateway.mutate({
                                userId: userSetting.user_id,
                                allow: checked,
                              })
                            }
                            disabled={!globalSettings?.allow_gateway_access}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  No users with SRT settings found
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
