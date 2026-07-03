import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Briefcase, Lock, LayoutDashboard, ListTodo, Users, Settings, Rocket, Sparkles, BarChart3, Trophy, CheckCircle2 } from "lucide-react";
import { WorkspaceSelector } from "@/components/workspace/WorkspaceSelector";
import { WorkspaceCreator } from "@/components/workspace/WorkspaceCreator";
import { UpgradePlanDialog } from "@/components/workspace/UpgradePlanDialog";
import { WorkspaceLimitIndicator } from "@/components/workspace/WorkspaceLimitIndicator";
import { TeamVelocityCard } from "@/components/workspace/TeamVelocityCard";
import { LeaderboardCard } from "@/components/workspace/LeaderboardCard";
import { PerformanceChart } from "@/components/workspace/PerformanceChart";
import { TaskKanban } from "@/components/workspace/TaskKanban";
import { TeamMembers } from "@/components/workspace/TeamMembers";
import { WorkspaceSettings } from "@/components/workspace/WorkspaceSettings";
import { WorkspaceInvitationBanner } from "@/components/workspace/WorkspaceInvitationBanner";
import { TransferRequestBanner } from "@/components/workspace/TransferRequestBanner";
import { MonthSelector } from "@/components/workspace/MonthSelector";
import { useWorkspaceLimits, useMemberLimits } from "@/hooks/useWorkspaceLimits";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { startOfMonth, endOfMonth, isSameMonth, isBefore, startOfDay } from "date-fns";

// Local storage key for persisting selected workspace
const SELECTED_WORKSPACE_KEY = "selected_workspace_id";

export default function TeamWorkspace() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<"workspaces" | "members">("workspaces");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  
  // Workspace data states
  const [members, setMembers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Persist selected workspace to localStorage
  useEffect(() => {
    if (selectedWorkspace?.id) {
      localStorage.setItem(SELECTED_WORKSPACE_KEY, selectedWorkspace.id);
    }
  }, [selectedWorkspace]);

  const { workspaceLimits, refetch: refetchLimits } = useWorkspaceLimits();
  const { memberLimits } = useMemberLimits(selectedWorkspace?.id);

  // Solo mode detection - only count accepted members
  const acceptedMembersCount = members.filter(m => m.status === "accepted" || !m.status).length;
  const isSoloMode = acceptedMembersCount <= 1;

  useEffect(() => {
    if (user) {
      fetchWorkspaces();
      setupRealtimeSubscription();
    }
  }, [user]);

  useEffect(() => {
    if (selectedWorkspace) {
      fetchWorkspaceData();
    }
  }, [selectedWorkspace, selectedMonth]);

  const fetchWorkspaces = async (preserveSelection = true) => {
    try {
      // Store current selection before fetching
      const currentSelectionId = preserveSelection ? selectedWorkspace?.id : null;
      
      // Only fetch accepted memberships for workspace list and exclude archived
      const { data: memberData, error: memberError } = await supabase
        .from("workspace_members")
        .select(`
          workspace_id,
          role,
          status,
          workspaces!inner (*)
        `)
        .eq("user_id", user?.id)
        .eq("status", "accepted")
        .is("workspaces.archived_at", null);

      if (memberError) throw memberError;

      const workspaceList = memberData?.map((m: any) => ({
        ...m.workspaces,
        userRole: m.role,
      })) || [];

      setWorkspaces(workspaceList);
      
      if (workspaceList.length > 0) {
        // Try to restore current selection first
        if (currentSelectionId) {
          const currentWorkspace = workspaceList.find((w: any) => w.id === currentSelectionId);
          if (currentWorkspace) {
            setSelectedWorkspace(currentWorkspace);
            return;
          }
        }
        
        // Try to restore from localStorage
        const savedId = localStorage.getItem(SELECTED_WORKSPACE_KEY);
        if (savedId) {
          const savedWorkspace = workspaceList.find((w: any) => w.id === savedId);
          if (savedWorkspace) {
            setSelectedWorkspace(savedWorkspace);
            return;
          }
        }
        
        // Fallback to first workspace only if no selection exists
        if (!selectedWorkspace) {
          setSelectedWorkspace(workspaceList[0]);
        }
      }
    } catch (error: any) {
      console.error("Error fetching workspaces:", error);
      toast.error("Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaceData = async () => {
    if (!selectedWorkspace) return;
    
    try {
      setDataLoading(true);

      // Fetch members with status (no FK join - fetch profiles separately)
      const { data: membersData, error: membersError } = await supabase
        .from("workspace_members")
        .select("*")
        .eq("workspace_id", selectedWorkspace.id)
        .order("personal_score", { ascending: false });

      if (membersError) {
        console.error("Error fetching members:", membersError);
      }

      // Fetch profiles separately for all members
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

      // Filter to only accepted members for the count
      const acceptedMembers = membersWithProfiles?.filter(m => m.status === "accepted" || !m.status) || [];
      setMembers(membersWithProfiles);

      // Calculate month boundaries for filtering
      const monthStart = startOfMonth(selectedMonth);
      const monthEnd = endOfMonth(selectedMonth);
      const now = new Date();
      const isCurrentMonth = isSameMonth(selectedMonth, now);

      // Fetch ALL tasks first, then filter client-side for complex overdue logic
      const { data: tasksData, error: tasksError } = await supabase
        .from("workspace_tasks")
        .select("*")
        .eq("workspace_id", selectedWorkspace.id)
        .order("created_at", { ascending: false });

      if (tasksError) {
        console.error("Error fetching tasks:", tasksError);
      }

      // Apply smart month filtering
      let filteredTasks = (tasksData || []).filter(task => {
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const createdAt = new Date(task.created_at);
        const completedAt = task.completed_at ? new Date(task.completed_at) : null;

        if (isCurrentMonth) {
          // CURRENT MONTH LOGIC:
          // 1. Tasks with due_date in current month
          if (dueDate && dueDate >= monthStart && dueDate <= monthEnd) return true;
          
          // 2. Overdue tasks (due in past + still incomplete)
          if (dueDate && dueDate < monthStart && task.status !== "completed") return true;
          
          // 3. Tasks without due_date but created in current month
          if (!dueDate && createdAt >= monthStart && createdAt <= monthEnd) return true;
          
          // 4. Tasks completed this month (even if created earlier)
          if (completedAt && completedAt >= monthStart && completedAt <= monthEnd) return true;
          
          return false;
        } else {
          // HISTORICAL MONTH LOGIC:
          // 1. Tasks with due_date in selected month
          if (dueDate && dueDate >= monthStart && dueDate <= monthEnd) return true;
          
          // 2. Tasks completed in selected month
          if (completedAt && completedAt >= monthStart && completedAt <= monthEnd) return true;
          
          // 3. Tasks without due_date but created in selected month
          if (!dueDate && createdAt >= monthStart && createdAt <= monthEnd) return true;
          
          return false;
        }
      });

      // Fetch assignee profiles separately for filtered tasks with assignee_id
      if (filteredTasks.length > 0) {
        const assigneeIds = filteredTasks
          .filter(t => t.assignee_id)
          .map(t => t.assignee_id);
        
        if (assigneeIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("user_id, full_name, avatar_url")
            .in("user_id", assigneeIds);
          
          const profileMap = new Map(
            profilesData?.map(p => [p.user_id, p]) || []
          );
          
          const tasksWithAssignees = filteredTasks.map(task => ({
            ...task,
            assignee: task.assignee_id ? profileMap.get(task.assignee_id) || null : null
          }));
          
          setTasks(tasksWithAssignees);
        } else {
          setTasks(filteredTasks.map(t => ({ ...t, assignee: null })));
        }
      } else {
        setTasks([]);
      }

      // Fetch recent completions for selected month
      const { data: completionsData } = await supabase
        .from("task_completions")
        .select("*")
        .eq("workspace_id", selectedWorkspace.id)
        .gte("completed_at", monthStart.toISOString())
        .lte("completed_at", monthEnd.toISOString())
        .order("completed_at", { ascending: true });

      setCompletions(completionsData || []);
    } catch (error) {
      console.error("Error fetching workspace data:", error);
    } finally {
      setDataLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("workspaces-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspaces" },
        () => fetchWorkspaces()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_members", filter: `user_id=eq.${user?.id}` },
        () => fetchWorkspaces()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // Setup workspace-specific realtime with instant updates
  useEffect(() => {
    if (!selectedWorkspace) return;

    const channel = supabase
      .channel(`workspace-realtime-${selectedWorkspace.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "workspace_tasks", filter: `workspace_id=eq.${selectedWorkspace.id}` },
        async (payload) => {
          const newTask = payload.new as any;
          let assignee = null;
          if (newTask.assignee_id) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("user_id, full_name, avatar_url")
              .eq("user_id", newTask.assignee_id)
              .single();
            assignee = profileData;
          }
          
          setTasks(prev => [{ ...newTask, assignee }, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workspace_tasks", filter: `workspace_id=eq.${selectedWorkspace.id}` },
        async (payload) => {
          const updatedTask = payload.new as any;
          let assignee = null;
          if (updatedTask.assignee_id) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("user_id, full_name, avatar_url")
              .eq("user_id", updatedTask.assignee_id)
              .single();
            assignee = profileData;
          }
          
          setTasks(prev => prev.map(t => 
            t.id === updatedTask.id ? { ...updatedTask, assignee } : t
          ));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "workspace_tasks", filter: `workspace_id=eq.${selectedWorkspace.id}` },
        (payload) => {
          const deletedId = (payload.old as any).id;
          setTasks(prev => prev.filter(t => t.id !== deletedId));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_members", filter: `workspace_id=eq.${selectedWorkspace.id}` },
        () => fetchWorkspaceData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_completions", filter: `workspace_id=eq.${selectedWorkspace.id}` },
        () => fetchWorkspaceData()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedWorkspace?.id]);

  const handleWorkspaceCreated = () => {
    setShowCreator(false);
    fetchWorkspaces();
    refetchLimits();
    toast.success("Workspace created successfully!");
  };

  const handleCreateWorkspaceClick = () => {
    if (workspaceLimits && !workspaceLimits.canCreateWorkspace) {
      setUpgradeFeature("workspaces");
      setShowUpgradeDialog(true);
    } else {
      setShowCreator(true);
    }
  };

  const handleMembersTabClick = () => {
    if (memberLimits && !memberLimits.canAddMember && members.length <= 1) {
      setUpgradeFeature("members");
      setShowUpgradeDialog(true);
      return;
    }
    setActiveTab("members");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 pb-24 lg:pb-6 space-y-3 sm:space-y-4">
      {/* Pending Invitations & Transfer Requests */}
      <WorkspaceInvitationBanner />
      <TransferRequestBanner />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/40 backdrop-blur-sm border border-primary/30 flex items-center justify-center shadow-lg shadow-primary/20">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Studio Hub
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {isSoloMode ? "Your personal productivity center" : "Team productivity command center"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {workspaceLimits && (
            <WorkspaceLimitIndicator
              current={workspaceLimits.currentWorkspaces}
              max={workspaceLimits.maxWorkspaces}
            />
          )}
          
          {workspaces.length > 1 && (
            <WorkspaceSelector
              workspaces={workspaces}
              selectedWorkspace={selectedWorkspace}
              onSelect={setSelectedWorkspace}
            />
          )}
          
          {workspaceLimits && !workspaceLimits.canCreateWorkspace ? (
            <Card
              onClick={() => { setUpgradeFeature("workspaces"); setShowUpgradeDialog(true); }}
              className="flex items-center gap-2 px-4 py-2 cursor-pointer opacity-70 hover:opacity-90 transition-opacity bg-muted/50 border-dashed border-2 border-muted-foreground/30"
            >
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">New Workspace</span>
            </Card>
          ) : (
            <Button
              onClick={handleCreateWorkspaceClick}
              variant="outline"
              className="border-primary/30 hover:border-primary/50"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Workspace
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      {selectedWorkspace ? (
        <div className="space-y-3 sm:space-y-4">
          {/* Month Selector */}
          <MonthSelector
            selectedDate={selectedMonth}
            onMonthChange={setSelectedMonth}
            overdueCount={tasks.filter(t => {
              if (!t.due_date || t.status === "completed") return false;
              return isBefore(new Date(t.due_date), startOfDay(new Date()));
            }).length}
          />

          {/* Glassmorphism Hub Container */}
          <Card className="bg-background/30 backdrop-blur-md border-primary/20 shadow-xl shadow-primary/5 overflow-hidden">
            <div className="p-3 sm:p-4">
              {/* Hub Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className={cn(
                  "grid w-full bg-muted/30 border border-primary/10 p-1",
                  isSoloMode ? "grid-cols-3" : "grid-cols-4"
                )}>
                  <TabsTrigger value="dashboard" className="gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </TabsTrigger>
                  <TabsTrigger value="tasks" className="gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <ListTodo className="h-4 w-4" />
                    <span className="hidden sm:inline">Tasks</span>
                  </TabsTrigger>
                  {!isSoloMode && (
                    <TabsTrigger 
                      value="members" 
                      onClick={(e) => {
                        e.preventDefault();
                        handleMembersTabClick();
                      }}
                      className="gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
                    >
                      <Users className="h-4 w-4" />
                      <span className="hidden sm:inline">Team</span>
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="settings" className="gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Settings</span>
                  </TabsTrigger>
                </TabsList>

                {/* Dashboard Tab */}
                <TabsContent value="dashboard" className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
                  {/* Stats Cards Row */}
                  <div className={`grid gap-3 sm:gap-4 ${isSoloMode ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                    <TeamVelocityCard 
                      workspace={selectedWorkspace}
                      completions={completions}
                      isSoloMode={isSoloMode}
                      selectedMonth={selectedMonth}
                    />
                    {!isSoloMode && (
                      <LeaderboardCard 
                        members={members}
                        completions={completions}
                        selectedMonth={selectedMonth}
                      />
                    )}
                  </div>
                  {/* Full-Width Chart */}
                  <PerformanceChart 
                    completions={completions}
                    tasks={tasks}
                    isSoloMode={isSoloMode}
                    selectedMonth={selectedMonth}
                  />
                </TabsContent>

                {/* Tasks Tab */}
                <TabsContent value="tasks" className="mt-3 sm:mt-4">
                  <TaskKanban 
                    workspace={selectedWorkspace}
                    tasks={tasks}
                    members={members}
                    isSoloMode={isSoloMode}
                    onRefresh={fetchWorkspaceData}
                    selectedMonth={selectedMonth}
                  />
                </TabsContent>

                {/* Team Tab */}
                {!isSoloMode && (
                  <TabsContent value="members" className="mt-3 sm:mt-4">
                    <TeamMembers 
                      workspace={selectedWorkspace}
                      members={members}
                      onRefresh={fetchWorkspaceData}
                    />
                  </TabsContent>
                )}

                {/* Settings Tab */}
                <TabsContent value="settings" className="mt-3 sm:mt-4">
                  <WorkspaceSettings 
                    workspace={selectedWorkspace}
                    onUpdate={fetchWorkspaces}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </Card>
        </div>
      ) : (
        /* Empty State - No Workspaces */
        <Card className="bg-background/30 backdrop-blur-md border-primary/20 shadow-xl shadow-primary/5 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Rocket className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Welcome to Your Studio Hub</h2>
            <p className="text-muted-foreground mb-8">
              Your personal productivity command center. Create your first workspace to get started with task management, team collaboration, and performance tracking.
            </p>
            
            <div className="grid grid-cols-2 gap-4 mb-8 text-left">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                <ListTodo className="h-5 w-5 text-primary mb-2" />
                <p className="text-sm font-medium">Kanban Boards</p>
                <p className="text-xs text-muted-foreground">Organize tasks visually</p>
              </div>
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                <Users className="h-5 w-5 text-primary mb-2" />
                <p className="text-sm font-medium">Team Collaboration</p>
                <p className="text-xs text-muted-foreground">Work together seamlessly</p>
              </div>
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                <BarChart3 className="h-5 w-5 text-primary mb-2" />
                <p className="text-sm font-medium">Analytics</p>
                <p className="text-xs text-muted-foreground">Track your progress</p>
              </div>
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                <Trophy className="h-5 w-5 text-primary mb-2" />
                <p className="text-sm font-medium">Gamification</p>
                <p className="text-xs text-muted-foreground">Earn points & compete</p>
              </div>
            </div>

            <Button 
              onClick={handleCreateWorkspaceClick}
              size="lg"
              className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Create Your First Workspace
            </Button>
          </div>
        </Card>
      )}

      {/* Dialogs */}
      <WorkspaceCreator 
        open={showCreator}
        onClose={() => setShowCreator(false)}
        onCreated={handleWorkspaceCreated}
      />

      <UpgradePlanDialog
        open={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        feature={upgradeFeature}
      />
    </div>
  );
}
