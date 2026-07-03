// ═══════════════════════════════════════════════════════════════════════════
// Phase 1.6 — Agentic Era feature-flag toggles (per-user `user_agent_settings`)
// Distinct from the global AdminFeatureFlags table — this targets the three
// boolean columns added by 20260513100000_agent_settings_feature_flags.sql.
//
// Mount this anywhere inside AdminDashboard. It pulls every user's current
// state and lets an admin flip flags for staged rollout.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Workflow, Database, Search } from "lucide-react";

type Tier = "moderate" | "complex" | "deep" | "ultra-deep";

interface AgenticSettingsRow {
  id: string;
  user_id: string;
  bot_name: string | null;
  agentic_sdk_enabled: boolean;
  pge_pipeline_enabled: boolean;
  mcp_postgres_enabled: boolean;
  pge_min_complexity: Tier;
  updated_at: string;
}

const flagDocs = {
  agentic_sdk_enabled: {
    icon: Brain,
    title: "Anthropic SDK path",
    desc: "Phase 1 — Claude calls go through @anthropic-ai/sdk instead of raw fetch.",
  },
  pge_pipeline_enabled: {
    icon: Workflow,
    title: "Planner → Generator → Evaluator",
    desc: "Phase 2 — complex turns dispatch through the PGE subagent triad.",
  },
  mcp_postgres_enabled: {
    icon: Database,
    title: "Postgres MCP",
    desc: "Phase 1.6 — knowledge search routes through MCP Postgres client.",
  },
} as const;

export function AgenticFeatureFlags() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "agentic-flags"],
    queryFn: async (): Promise<AgenticSettingsRow[]> => {
      const { data, error } = await supabase
        .from("user_agent_settings")
        .select("id,user_id,bot_name,agentic_sdk_enabled,pge_pipeline_enabled,mcp_postgres_enabled,pge_min_complexity,updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AgenticSettingsRow[];
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<AgenticSettingsRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("user_agent_settings").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "agentic-flags"] });
      toast.success("Flag updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const filtered = (data ?? []).filter((row) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return row.user_id.toLowerCase().includes(s) || (row.bot_name ?? "").toLowerCase().includes(s);
  });

  return (
    <Card className="bg-card/40 backdrop-blur-xl border-border/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-emerald-400" />
              Agentic Era Feature Flags
            </CardTitle>
            <CardDescription className="mt-1">
              Per-user rollout of the 3 Agentic-Era upgrades. See <code>docs/AGENTIC_AUDIT.md</code>.
            </CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user id or bot name…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
          {(Object.keys(flagDocs) as Array<keyof typeof flagDocs>).map((k) => {
            const Icon = flagDocs[k].icon;
            return (
              <div key={k} className="flex items-start gap-2 p-2 rounded-md bg-background/40 border border-border/40">
                <Icon className="h-4 w-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                <div className="text-[11px] leading-snug">
                  <div className="font-medium">{flagDocs[k].title}</div>
                  <div className="text-muted-foreground">{flagDocs[k].desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No user_agent_settings rows yet.</div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-2">
              <div className="col-span-3">User</div>
              <div className="col-span-2 text-center">SDK</div>
              <div className="col-span-2 text-center">PGE</div>
              <div className="col-span-2 text-center">MCP-PG</div>
              <div className="col-span-3 text-center">PGE Min Tier</div>
            </div>
            {filtered.map((row) => (
              <div key={row.id} className="grid grid-cols-12 gap-2 items-center px-2 py-2 rounded-md hover:bg-background/30 border border-border/20">
                <div className="col-span-3 text-xs font-mono truncate" title={row.user_id}>
                  {row.bot_name ? <Badge variant="outline" className="mr-1">{row.bot_name}</Badge> : null}
                  {row.user_id.slice(0, 12)}…
                </div>
                <div className="col-span-2 flex justify-center">
                  <Switch
                    checked={row.agentic_sdk_enabled}
                    onCheckedChange={(v) => update.mutate({ id: row.id, agentic_sdk_enabled: v })}
                    disabled={update.isPending}
                  />
                </div>
                <div className="col-span-2 flex justify-center">
                  <Switch
                    checked={row.pge_pipeline_enabled}
                    onCheckedChange={(v) => update.mutate({ id: row.id, pge_pipeline_enabled: v })}
                    disabled={update.isPending}
                  />
                </div>
                <div className="col-span-2 flex justify-center">
                  <Switch
                    checked={row.mcp_postgres_enabled}
                    onCheckedChange={(v) => update.mutate({ id: row.id, mcp_postgres_enabled: v })}
                    disabled={update.isPending}
                  />
                </div>
                <div className="col-span-3 flex justify-center">
                  <Select
                    value={row.pge_min_complexity ?? "complex"}
                    onValueChange={(v) => update.mutate({ id: row.id, pge_min_complexity: v as Tier })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moderate">moderate</SelectItem>
                      <SelectItem value="complex">complex</SelectItem>
                      <SelectItem value="deep">deep</SelectItem>
                      <SelectItem value="ultra-deep">ultra-deep</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
