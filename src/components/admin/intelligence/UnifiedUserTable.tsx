import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/auditLog";
import {
  IconSearch,
  IconPlayerPause,
  IconPlayerPlay,
  IconKey,
  IconGift,
  IconRocket,
  IconAlertCircle,
  IconBrain,
} from "@tabler/icons-react";
import { Loader2 } from "lucide-react";
import type { UnifiedUser } from "./useUnifiedIntelligenceData";

interface Props {
  users: UnifiedUser[] | undefined;
  isLoading: boolean;
  enableFreeTier: boolean;
  hasSystemKey: boolean;
}

const TIER_BADGES: Record<string, { label: string; className: string }> = {
  explorer: { label: "Explorer", className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  analyst: { label: "Analyst (Pro)", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  alpha: { label: "Alpha (Pro+)", className: "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30" },
  admin: { label: "Sovereign", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  sovereign: { label: "Sovereign", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
};

export function UnifiedUserTable({ users, isLoading, enableFreeTier, hasSystemKey }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkPause, setShowBulkPause] = useState(false);
  const [showBulkResume, setShowBulkResume] = useState(false);

  const filtered = users?.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.full_name?.toLowerCase() || "").includes(q) ||
      (u.email?.toLowerCase() || "").includes(q)
    );
  });

  const toggleSelect = (id: string) => {
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered?.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered?.map((u) => u.user_id)));
  };

  const pauseMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("ai_user_settings")
        .update({ is_paused: true, updated_at: new Date().toISOString() })
        .in("user_id", ids);
      if (error) throw error;
      await logAdminAction("pause_access", "ai_user_settings", null, { user_ids: ids, count: ids.length });
    },
    onSuccess: (_, ids) => {
      setSelectedIds(new Set());
      setShowBulkPause(false);
      queryClient.invalidateQueries({ queryKey: ["unified-intelligence-users"] });
      toast({ title: `⏸️ ${ids.length} user(s) paused` });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("ai_user_settings")
        .update({ is_paused: false, updated_at: new Date().toISOString() })
        .in("user_id", ids);
      if (error) throw error;
      await logAdminAction("resume_access", "ai_user_settings", null, { user_ids: ids, count: ids.length });
    },
    onSuccess: (_, ids) => {
      setSelectedIds(new Set());
      setShowBulkResume(false);
      queryClient.invalidateQueries({ queryKey: ["unified-intelligence-users"] });
      toast({ title: `▶️ ${ids.length} user(s) resumed` });
    },
  });

  const getKeySource = (u: UnifiedUser) => {
    if (u.has_personal_key) return { icon: <IconKey className="h-3.5 w-3.5" />, label: "Personal Key", cls: "text-amber-500" };
    if (u.granted_by && !u.is_paused) return { icon: <IconGift className="h-3.5 w-3.5" />, label: "System Gift", cls: "text-green-500" };
    if (u.is_paused) return { icon: <IconPlayerPause className="h-3.5 w-3.5" />, label: "Paused", cls: "text-yellow-500" };
    if (hasSystemKey && enableFreeTier) return { icon: <IconRocket className="h-3.5 w-3.5" />, label: "Free Tier", cls: "text-blue-500" };
    return { icon: <IconAlertCircle className="h-3.5 w-3.5" />, label: "No Access", cls: "text-destructive" };
  };

  const getTierBadge = (tier: string | null) => TIER_BADGES[tier || "explorer"] || TIER_BADGES.explorer;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <IconBrain className="h-5 w-5 text-primary" />
                User Intelligence Manager
              </CardTitle>
              <CardDescription>
                Unified view of all users — Tier, IU, Model, Key Source & Status
              </CardDescription>
            </div>
            <div className="relative max-w-xs w-full">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-muted/50 border">
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
              <Button variant="outline" size="sm" onClick={() => setShowBulkPause(true)} className="text-amber-500 border-amber-500/30">
                <IconPlayerPause className="h-4 w-4 mr-1" /> Pause
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowBulkResume(true)} className="text-green-500 border-green-500/30">
                <IconPlayerPlay className="h-4 w-4 mr-1" /> Resume
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          )}

          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={!!filtered?.length && selectedIds.size === filtered.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Key Source</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>IU Today</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : !filtered?.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((u) => {
                    const tier = getTierBadge(u.tier_key);
                    const source = getKeySource(u);
                    const limit = u.daily_limit || 10;
                    const consumed = u.iu_consumed_today;
                    const pct = Math.min((consumed / limit) * 100, 100);
                    const model = u.model_used || u.gemini_model || u.preferred_model || "default";

                    return (
                      <TableRow key={u.user_id} className={u.is_paused ? "opacity-60" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(u.user_id)}
                            onCheckedChange={() => toggleSelect(u.user_id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm">🐝</div>
                            <div>
                              <p className="font-medium text-sm">{u.full_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={tier.className}>{tier.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 text-sm ${source.cls}`}>
                            {source.icon}
                            <span>{source.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {model.replace("gemini-", "").replace("-preview", "")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 min-w-[100px]">
                            <span className="text-xs">{consumed.toFixed(1)} / {limit} IU</span>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_paused ? "destructive" : "default"}>
                            {u.is_paused ? "Paused" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {u.is_paused ? (
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => resumeMutation.mutate([u.user_id])}
                              disabled={resumeMutation.isPending}
                              className="text-green-500 hover:text-green-600"
                            >
                              <IconPlayerPlay className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => pauseMutation.mutate([u.user_id])}
                              disabled={pauseMutation.isPending}
                              className="text-amber-500 hover:text-amber-600"
                            >
                              <IconPlayerPause className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Bulk Pause Dialog */}
      <AlertDialog open={showBulkPause} onOpenChange={setShowBulkPause}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <IconPlayerPause className="h-5 w-5 text-amber-500" />
              Pause {selectedIds.size} User(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will temporarily pause AI access for selected users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600"
              onClick={() => pauseMutation.mutate(Array.from(selectedIds))}
            >
              Pause Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Resume Dialog */}
      <AlertDialog open={showBulkResume} onOpenChange={setShowBulkResume}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <IconPlayerPlay className="h-5 w-5 text-green-500" />
              Resume {selectedIds.size} User(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will resume AI access for selected users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-500 hover:bg-green-600"
              onClick={() => resumeMutation.mutate(Array.from(selectedIds))}
            >
              Resume Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
