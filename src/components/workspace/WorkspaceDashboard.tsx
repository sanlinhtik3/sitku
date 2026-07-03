import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamVelocityCard } from "./TeamVelocityCard";
import { LeaderboardCard } from "./LeaderboardCard";
import { PerformanceChart } from "./PerformanceChart";
import { TaskKanban } from "./TaskKanban";
import { TeamMembers } from "./TeamMembers";
import { LayoutDashboard, ListTodo, Users } from "lucide-react";

interface WorkspaceDashboardProps {
  workspace: any;
}

export function WorkspaceDashboard({ workspace }: WorkspaceDashboardProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Solo mode detection - instant client-side check
  const isSoloMode = members.length === 1;

  useEffect(() => {
    if (workspace) {
      fetchWorkspaceData();
      setupRealtimeSubscriptions();
    }
  }, [workspace]);

  const fetchWorkspaceData = async () => {
    try {
      setLoading(true);

      // Fetch members (no FK join - fetch profiles separately)
      const { data: membersData } = await supabase
        .from("workspace_members")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("personal_score", { ascending: false });

      // Fetch profiles separately for members
      let membersWithProfiles: any[] = [];
      if (membersData && membersData.length > 0) {
        const memberUserIds = membersData.map(m => m.user_id);
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url, email")
          .in("user_id", memberUserIds);

        const profileMap = new Map(
          profilesData?.map(p => [p.user_id, p]) || []
        );

        membersWithProfiles = membersData.map(member => ({
          ...member,
          profiles: profileMap.get(member.user_id) || null
        }));
      }

      setMembers(membersWithProfiles);

      // Fetch tasks (no FK join - fetch assignee profiles separately)
      const { data: tasksData } = await supabase
        .from("workspace_tasks")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });

      // Fetch assignee profiles separately
      let tasksWithAssignees: any[] = [];
      if (tasksData && tasksData.length > 0) {
        const assigneeIds = tasksData
          .filter(t => t.assignee_id)
          .map(t => t.assignee_id);

        if (assigneeIds.length > 0) {
          const { data: assigneeProfiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, avatar_url")
            .in("user_id", assigneeIds);

          const assigneeMap = new Map(
            assigneeProfiles?.map(p => [p.user_id, p]) || []
          );

          tasksWithAssignees = tasksData.map(task => ({
            ...task,
            assignee: task.assignee_id ? assigneeMap.get(task.assignee_id) || null : null
          }));
        } else {
          tasksWithAssignees = tasksData.map(t => ({ ...t, assignee: null }));
        }
      }

      setTasks(tasksWithAssignees);

      // Fetch recent completions
      const { data: completionsData } = await supabase
        .from("task_completions")
        .select("*")
        .eq("workspace_id", workspace.id)
        .gte("completed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("completed_at", { ascending: true });

      setCompletions(completionsData || []);
    } catch (error) {
      console.error("Error fetching workspace data:", error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscriptions = () => {
    const channel = supabase
      .channel(`workspace-${workspace.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_tasks",
          filter: `workspace_id=eq.${workspace.id}`,
        },
        () => fetchWorkspaceData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_members",
          filter: `workspace_id=eq.${workspace.id}`,
        },
        () => fetchWorkspaceData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_completions",
          filter: `workspace_id=eq.${workspace.id}`,
        },
        () => fetchWorkspaceData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Stats Row */}
      <div className={`grid gap-6 ${isSoloMode ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
        <TeamVelocityCard workspace={workspace} completions={completions} isSoloMode={isSoloMode} />
        {!isSoloMode && <LeaderboardCard members={members} />}
      </div>

      {/* Performance Chart */}
      <PerformanceChart completions={completions} tasks={tasks} isSoloMode={isSoloMode} />

      {/* Main Tabs - Conditional based on solo/team mode */}
      <Tabs defaultValue="kanban" className="w-full">
        <TabsList className={`grid w-full max-w-md bg-card/50 backdrop-blur-sm ${isSoloMode ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <TabsTrigger value="kanban" className="gap-2">
            <ListTodo className="h-4 w-4" />
            Tasks
          </TabsTrigger>
          {!isSoloMode && (
            <TabsTrigger value="members" className="gap-2">
              <Users className="h-4 w-4" />
              Team
            </TabsTrigger>
          )}
          <TabsTrigger value="analytics" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-6">
          <TaskKanban
            workspace={workspace}
            tasks={tasks}
            members={members}
            onRefresh={fetchWorkspaceData}
            isSoloMode={isSoloMode}
          />
        </TabsContent>

        {!isSoloMode && (
          <TabsContent value="members" className="mt-6">
            <TeamMembers
              workspace={workspace}
              members={members}
              onRefresh={fetchWorkspaceData}
            />
          </TabsContent>
        )}

        <TabsContent value="analytics" className="mt-6">
          <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/50">
            <p className="text-muted-foreground text-center py-8">
              Advanced analytics coming soon...
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
