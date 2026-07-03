import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { 
  Loader2, Search, Key, Zap, Crown, Trash2, Users, 
  KeyRound, ShieldCheck, ShieldOff 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AIUserSettings {
  id: string;
  user_id: string;
  gemini_api_key: string | null;
  gemini_model: string | null;
  prefer_personal_key: boolean | null;
  allow_gateway_access: boolean | null;
  is_premium: boolean | null;
  total_generations: number | null;
  last_generation_at: string | null;
  granted_by: string | null;
  granted_at: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

export function AIContentUserManager() {
  const [search, setSearch] = useState("");
  const [clearKeyDialog, setClearKeyDialog] = useState<AIUserSettings | null>(null);
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["ai-user-settings"],
    queryFn: async () => {
      // Fetch AI settings
      const { data: aiSettings, error: settingsError } = await supabase
        .from("ai_user_settings")
        .select("*")
        .order("updated_at", { ascending: false });
      
      if (settingsError) throw settingsError;
      if (!aiSettings || aiSettings.length === 0) return [];
      
      // Fetch profiles for all users
      const userIds = aiSettings.map((s) => s.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, avatar_url")
        .in("user_id", userIds);
      
      if (profilesError) throw profilesError;
      
      // Merge profiles with settings
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
      
      return aiSettings.map((setting) => ({
        ...setting,
        profiles: profileMap.get(setting.user_id) || null,
      })) as AIUserSettings[];
    },
  });

  const toggleGatewayMutation = useMutation({
    mutationFn: async ({ userId, allowGateway }: { userId: string; allowGateway: boolean }) => {
      const { data, error } = await supabase.rpc("admin_toggle_ai_user_gateway", {
        p_target_user_id: userId,
        p_allow_gateway: allowGateway,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-user-settings"] });
      toast.success("Gateway access updated");
    },
    onError: (error) => {
      toast.error("Failed to update gateway access: " + error.message);
    },
  });

  const togglePremiumMutation = useMutation({
    mutationFn: async ({ userId, isPremium }: { userId: string; isPremium: boolean }) => {
      const { data, error } = await supabase.rpc("admin_toggle_ai_user_premium", {
        p_target_user_id: userId,
        p_is_premium: isPremium,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-user-settings"] });
      toast.success("Premium status updated");
    },
    onError: (error) => {
      toast.error("Failed to update premium status: " + error.message);
    },
  });

  const clearApiKeyMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.rpc("admin_clear_ai_user_key", {
        p_target_user_id: userId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-user-settings"] });
      toast.success("API key cleared");
      setClearKeyDialog(null);
    },
    onError: (error) => {
      toast.error("Failed to clear API key: " + error.message);
    },
  });

  const filteredUsers = users?.filter((user) => {
    const searchLower = search.toLowerCase();
    const name = user.profiles?.full_name?.toLowerCase() || "";
    const email = user.profiles?.email?.toLowerCase() || "";
    return name.includes(searchLower) || email.includes(searchLower);
  });

  // Stats
  const stats = {
    totalUsers: users?.length || 0,
    withApiKey: users?.filter((u) => u.gemini_api_key).length || 0,
    premiumUsers: users?.filter((u) => u.is_premium).length || 0,
    gatewayBlocked: users?.filter((u) => u.allow_gateway_access === false).length || 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.totalUsers}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <KeyRound className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.withApiKey}</p>
                <p className="text-xs text-muted-foreground">With API Key</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Crown className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{stats.premiumUsers}</p>
                <p className="text-xs text-muted-foreground">Premium Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldOff className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats.gatewayBlocked}</p>
                <p className="text-xs text-muted-foreground">Gateway Blocked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Management Table */}
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            User AI Settings
          </CardTitle>
          <CardDescription>
            Manage individual user's AI content generation permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>User</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead>Gateway Access</TableHead>
                  <TableHead>Premium</TableHead>
                  <TableHead>Generations</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No users found with AI settings
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.profiles?.avatar_url || undefined} />
                            <AvatarFallback>
                              {user.profiles?.full_name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {user.profiles?.full_name || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {user.profiles?.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.gemini_api_key ? (
                          <Badge variant="outline" className="gap-1 border-green-500/50 text-green-500">
                            <Key className="h-3 w-3" />
                            {user.gemini_model || "gemini-3.5-flash"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Key className="h-3 w-3" />
                            No Key
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.allow_gateway_access !== false}
                            onCheckedChange={(checked) =>
                              toggleGatewayMutation.mutate({
                                userId: user.user_id,
                                allowGateway: checked,
                              })
                            }
                            disabled={toggleGatewayMutation.isPending}
                          />
                          {user.allow_gateway_access === false ? (
                            <ShieldOff className="h-4 w-4 text-red-500" />
                          ) : (
                            <ShieldCheck className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.is_premium === true}
                            onCheckedChange={(checked) =>
                              togglePremiumMutation.mutate({
                                userId: user.user_id,
                                isPremium: checked,
                              })
                            }
                            disabled={togglePremiumMutation.isPending}
                          />
                          {user.is_premium && (
                            <Crown className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium">{user.total_generations || 0}</p>
                          {user.last_generation_at && (
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(user.last_generation_at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {user.gemini_api_key && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setClearKeyDialog(user)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Clear API Key Dialog */}
      <AlertDialog open={!!clearKeyDialog} onOpenChange={() => setClearKeyDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear the API key for{" "}
              <strong>{clearKeyDialog?.profiles?.full_name || "this user"}</strong>?
              They will need to enter a new key to use personal API access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => clearKeyDialog && clearApiKeyMutation.mutate(clearKeyDialog.user_id)}
            >
              {clearApiKeyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Clear Key"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
