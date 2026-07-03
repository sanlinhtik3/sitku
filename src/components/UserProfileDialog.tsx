import { useAuth } from "@/hooks/useAuth";
import { usePremiumStatus } from "@/hooks/usePremiumStatus";
import { useCourseProgress } from "@/hooks/useCourseProgress";
import { useLoginHistory } from "@/hooks/useLoginHistory";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useUserCredits } from "@/hooks/useUserCredits";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCertificates } from "@/hooks/useCertificates";
import { useAchievements } from "@/hooks/useAchievements";
import { useLearningStreak } from "@/hooks/useLearningStreak";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TwoFactorSetup } from "@/components/admin/TwoFactorSetup";
import { SessionManagement } from "@/components/admin/SessionManagement";
import { PlanStatusWidget } from "@/components/profile/PlanStatusWidget";
import { CreditsWidget } from "@/components/profile/CreditsWidget";
import { SubscriptionWidget } from "@/components/profile/SubscriptionWidget";
import { PaymentsWidget } from "@/components/profile/PaymentsWidget";
import { ReferralsWidget } from "@/components/profile/ReferralsWidget";
import { LearningStreakWidget } from "@/components/profile/LearningStreakWidget";
import { AchievementsWidget } from "@/components/profile/AchievementsWidget";
import { RecentRunTraces } from "@/components/profile/RecentRunTraces";

import { FeedbackWidget } from "@/components/profile/FeedbackWidget";
import { CourseRecommendations } from "@/components/profile/CourseRecommendations";
import { useAnalyticsData } from "@/components/agent-chat/analytics/useAnalyticsData";
import { UsageLimitsPanel } from "@/components/agent-chat/analytics/UsageLimitsPanel";
import { AnalyticsStatsCards } from "@/components/agent-chat/analytics/AnalyticsStatsCards";
import { StreamingPerformanceCard } from "@/components/agent-chat/analytics/StreamingPerformanceCard";
// Recharts-heavy analytics charts are lazy — pulled in only when the analytics tab opens.
const DailyTrendChart = lazy(() => import("@/components/agent-chat/analytics/DailyTrendChart").then((m) => ({ default: m.DailyTrendChart })));
const SourceModelCharts = lazy(() => import("@/components/agent-chat/analytics/SourceModelCharts").then((m) => ({ default: m.SourceModelCharts })));
const _ChartSkeleton = () => <div className="h-56 animate-pulse rounded-xl bg-[#0e0e0e]" aria-label="Loading chart" />;
import { CourseHubDialog } from "@/components/dashboard/CourseHubDialog";
import { MemoryVaultWidget } from "@/components/profile/MemoryVaultWidget";
import { SkillsManager } from "@/components/profile/SkillsManager";
import { AIModelsTab } from "@/components/profile/AIModelsTab";

import { 
  CheckCircle2, 
  XCircle, 
  Mail, 
  Calendar, 
  Shield, 
  Crown, 
  History,
  User,
  BookOpen,
  Brain,
  CreditCard,
  Zap,
  Cpu,
  Bell,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Clock,
  Smartphone,
  Key,
  ExternalLink,
  Hash,
  Copy,
  Check,
  Flame,
  Trophy,
  GraduationCap,
  AlertTriangle,
  ShieldCheck,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: TabType;
  onTabChange?: (tab: string) => void;
}

type TabType = "profile" | "billing" | "usage" | "security" | "notifications" | "learning" | "memory" | "skills" | "ai-models";

const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { id: "billing", label: "Credits & Billing", icon: <CreditCard className="h-4 w-4" /> },
  { id: "usage", label: "Usage", icon: <Zap className="h-4 w-4" /> },
  { id: "learning", label: "Learning", icon: <BookOpen className="h-4 w-4" /> },
  { id: "memory", label: "Memory", icon: <Brain className="h-4 w-4" /> },
  { id: "ai-models", label: "AI Models", icon: <Cpu className="h-4 w-4" /> },
  { id: "skills", label: "Skills", icon: <Sparkles className="h-4 w-4" /> },
  { id: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
];

export const UserProfileDialog = ({ open, onOpenChange, initialTab, onTabChange }: UserProfileDialogProps) => {
  const { user, isAdmin, emailVerified } = useAuth();
  const { isPremium, daysRemaining, closestExpiryDate } = usePremiumStatus();
  const { data: courseProgress = [] } = useCourseProgress(user?.id);
  const { data: loginHistory } = useLoginHistory(user?.email);
  const { preferences, updatePreferences } = useUserPreferences(user?.id);
  const { balance, totalEarned, totalSpent, isTrialUser } = useUserCredits(user?.id);
  const { certificates } = useCertificates();
  const { earnedAchievements, lockedAchievements } = useAchievements();
  const { currentStreak, longestStreak } = useLearningStreak();
  const { permission, isSupported, isSubscribed, requestPermission, unsubscribe, sendTestNotification } = usePushNotifications();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTabInternal] = useState<TabType>(initialTab || "profile");

  // Sync activeTab when initialTab changes (hash-driven)
  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTabInternal(initialTab);
    }
  }, [initialTab]);

  const setActiveTab = useCallback((tab: TabType) => {
    setActiveTabInternal(tab);
    onTabChange?.(tab);
  }, [onTabChange]);
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  
  const [courseHubDialogOpen, setCourseHubDialogOpen] = useState(false);

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Fetch invite code and full_name
  const { } = useQuery({
    queryKey: ["invite-code", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('invite_code, full_name')
        .eq('user_id', user.id)
        .single();
      if (data?.invite_code) setInviteCode(data.invite_code);
      if (data?.full_name) setFullName(data.full_name);
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch credit orders
  const { data: creditOrders } = useQuery({
    queryKey: ["credit-orders", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("credit_orders")
        .select("*, credit_plans(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch recent transactions
  const { data: recentTransactions } = useQuery({
    queryKey: ["recent-transactions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });


  // Fetch 2FA status
  const { data: twoFactorStatus } = useQuery({
    queryKey: ["2fa-status", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("user_2fa")
        .select("is_enabled, enabled_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch active sessions count
  const { data: sessionsCount } = useQuery({
    queryKey: ["sessions-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from("user_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
  });

  // Fetch user profile settings (single device mode)
  const { data: profileSettings } = useQuery({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('enforce_single_device, max_concurrent_sessions')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  // Update enforce single device
  const updateEnforceSingleDevice = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!user?.id) throw new Error("No user");
      const { error } = await supabase
        .from('profiles')
        .update({ enforce_single_device: enabled })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: (_, enabled) => {
      toast.success(
        enabled 
          ? "Single device mode enabled."
          : "Single device mode disabled."
      );
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
    onError: () => toast.error("Failed to update single device mode"),
  });

  // Update max concurrent sessions
  const updateMaxSessions = useMutation({
    mutationFn: async (max: number) => {
      if (!user?.id) throw new Error("No user");
      const { error } = await supabase
        .from('profiles')
        .update({ max_concurrent_sessions: max })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Maximum concurrent sessions updated");
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
    onError: () => toast.error("Failed to update session limit"),
  });

  if (!user) return null;

  const getInitials = (email: string) => email.substring(0, 2).toUpperCase();

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Profile updated successfully");
      setIsEditing(false);
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }
    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });
      if (error) throw error;
      toast.success("Password updated successfully");
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const copyInviteCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      setCodeCopied(true);
      toast.success("Invite code copied!");
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "pending": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "rejected": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const totalLessons = courseProgress.reduce((sum, course) => sum + course.total_lessons, 0);
  const completedLessons = courseProgress.reduce((sum, course) => sum + course.completed_lessons, 0);
  const overallProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const accountSignals = [
    emailVerified,
    twoFactorStatus?.is_enabled,
    isPremium,
    (balance ?? 0) > 0,
    courseProgress.length > 0 || earnedAchievements.length > 0,
  ];
  const profileScore = Math.round((accountSignals.filter(Boolean).length / accountSignals.length) * 100);
  const profileTone =
    profileScore >= 80 ? "Ready" :
    profileScore >= 50 ? "Almost ready" :
    "Needs setup";
  const surfaceClass = "rounded-[28px] border border-white/[0.075] bg-[#0a0d10]/86 backdrop-blur-2xl shadow-[0_20px_70px_rgba(0,0,0,0.34)]";
  const elevatedClass = "rounded-[24px] border border-white/[0.07] bg-white/[0.035] backdrop-blur-xl";
  const iconButtonClass = "h-10 w-10 rounded-full border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors";

  // Profile Section
  const displayName = fullName || user.email?.split("@")[0] || "User";
  
  const ProfileSection = () => (
    <div className="space-y-4 pb-2">
      {/* Hero Profile Card */}
      <div className={cn(surfaceClass, "relative overflow-hidden p-4 sm:p-5")}>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent pointer-events-none" />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <Avatar className="h-[76px] w-[76px] ring-1 ring-white/15 shadow-[0_0_0_6px_rgba(255,255,255,0.025)]">
              <AvatarFallback className="bg-[#10161c] text-primary text-2xl font-bold">
                {getInitials(user.email || "")}
              </AvatarFallback>
            </Avatar>
          
            <div className="flex-1 min-w-0 space-y-3 text-center sm:text-left">
              <div className="min-w-0">
                <div className="flex items-center justify-center sm:justify-start gap-2 min-w-0">
                  <h3 className="text-xl font-semibold tracking-[-0.01em] truncate">{displayName}</h3>
                  {emailVerified && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground/75 truncate mt-0.5">{user.email}</p>
              </div>
            
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                <Badge className={cn(
                  "gap-1 border text-[10px] rounded-full px-2.5 h-6",
                  isPremium
                    ? "bg-amber-400/12 text-amber-300 border-amber-400/25"
                    : "bg-white/[0.045] text-muted-foreground border-white/[0.08]"
                )}>
                  <Crown className="h-3 w-3" />
                  {isPremium ? "Premium" : "Free"}
                </Badge>
                {isAdmin && (
                  <Badge className="gap-1 text-[10px] rounded-full px-2.5 h-6 bg-primary/12 text-primary border border-primary/25">
                    <Shield className="h-3 w-3" />
                    Admin
                  </Badge>
                )}
                <Badge className="gap-1 text-[10px] rounded-full px-2.5 h-6 bg-emerald-400/10 text-emerald-300 border border-emerald-400/20">
                  <ShieldCheck className="h-3 w-3" />
                  {profileTone}
                </Badge>
              </div>

              {isEditing ? (
                <div className="space-y-2 rounded-[20px] border border-white/[0.07] bg-black/20 p-3">
                  <Label htmlFor="fullName" className="text-[11px] text-muted-foreground/80 font-semibold">Display Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your name"
                    className="h-10 bg-black/30 border-white/[0.08] rounded-[18px] text-sm focus-visible:ring-1 focus-visible:ring-primary/35"
                  />
                  <div className="flex gap-2 justify-center sm:justify-start">
                    <Button onClick={handleSaveProfile} disabled={isSaving} size="sm" className="rounded-full px-4 h-9">
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="outline" onClick={() => setIsEditing(false)} size="sm" className="border-white/[0.08] bg-white/[0.035] hover:bg-white/[0.07] rounded-full px-4 h-9">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <Button onClick={() => setIsEditing(true)} size="sm" className="rounded-full px-4 h-9 gap-1.5 shadow-[0_0_22px_hsl(var(--primary)/0.16)]">
                    <User className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  {inviteCode && (
                    <button onClick={copyInviteCode} className={iconButtonClass} title="Copy invite code">
                      {codeCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  )}
                  <button onClick={() => setActiveTab("security")} className={iconButtonClass} title="Security">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/[0.065] bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-[11px] font-semibold text-foreground/90">Account readiness</p>
                <p className="text-[10px] text-muted-foreground/65">Profile, security, credits, learning</p>
              </div>
              <span className="text-lg font-semibold tabular-nums text-foreground">{profileScore}%</span>
            </div>
            <Progress value={profileScore} className="h-2 bg-white/[0.06]" />
          </div>
        </div>
      </div>

      {/* Stats Grid 2x2 */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { icon: Sparkles, label: "Credits", value: balance, color: "text-primary" },
          { icon: Trophy, label: "Achievements", value: earnedAchievements.length, color: "text-yellow-500" },
          { icon: GraduationCap, label: "Certificates", value: certificates.length, color: "text-green-500" },
          { icon: Flame, label: "Day Streak", value: currentStreak, color: "text-orange-500" },
        ].map((stat) => (
          <div key={stat.label} className={cn(elevatedClass, "flex items-center gap-3 p-3.5 transition-all duration-200 hover:border-primary/20 hover:bg-white/[0.055]")}>
            <div className="h-9 w-9 rounded-[16px] bg-white/[0.045] border border-white/[0.06] flex items-center justify-center shrink-0">
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Info Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-[18px] bg-white/[0.035] backdrop-blur-sm border border-white/[0.07] text-xs">
          {emailVerified ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
          )}
          <span className="text-muted-foreground">{emailVerified ? "Verified" : "Unverified"}</span>
        </div>
        
        {user.created_at && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[18px] bg-white/[0.035] backdrop-blur-sm border border-white/[0.07] text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{format(new Date(user.created_at), "MMM yyyy")}</span>
          </div>
        )}
        
        <div className="flex items-center gap-2 px-3 py-2 rounded-[18px] bg-white/[0.035] backdrop-blur-sm border border-white/[0.07] text-xs">
          <ShieldCheck className={cn("h-3.5 w-3.5 shrink-0", twoFactorStatus?.is_enabled ? "text-green-500" : "text-muted-foreground/50")} />
          <span className="text-muted-foreground">2FA {twoFactorStatus?.is_enabled ? "On" : "Off"}</span>
        </div>

        {isPremium && daysRemaining !== null && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[18px] bg-amber-500/10 backdrop-blur-sm border border-amber-500/20 text-xs">
            <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-amber-500">{daysRemaining > 0 ? `${daysRemaining}d left` : "Expired"}</span>
          </div>
        )}
      </div>

      {/* Invite Code */}
      {inviteCode && (
        <div 
          onClick={copyInviteCode}
          className={cn(elevatedClass, "relative overflow-hidden flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.055] transition-all duration-200")}
        >
          <div className="h-10 w-10 rounded-[18px] bg-primary/12 border border-primary/18 flex items-center justify-center shrink-0">
            <Hash className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground/60">Invite Code</p>
            <p className="font-mono font-bold text-sm tracking-wider">{inviteCode}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full hover:bg-primary/15">
            {codeCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {/* Plan Status */}
      <PlanStatusWidget userId={user.id} />
    </div>
  );

  // Billing Section
  const BillingSection = () => (
    <div className="space-y-4">
      {/* Credit Balance Card */}
      <div className="p-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur-xl transition-all duration-200 hover:shadow-[0_0_30px_hsl(var(--primary)/0.08)]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-muted-foreground/70">Current Balance</span>
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="text-3xl font-bold text-primary">{balance}</div>
        <p className="text-xs text-muted-foreground/70 mt-1">AI Credits</p>
        
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/20">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground/70">Earned</p>
              <p className="text-sm font-bold">{totalEarned}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground/70">Spent</p>
              <p className="text-sm font-bold">{totalSpent}</p>
            </div>
          </div>
        </div>
      </div>

      {isTrialUser && (
        <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 backdrop-blur-sm">
          <p className="text-sm text-blue-400">🎁 Trial Credits Active</p>
        </div>
      )}

      <Button 
        className="w-full shrink-0" 
        onClick={() => {
          onOpenChange(false);
          navigate("/buy-credits");
        }}
      >
        <CreditCard className="h-4 w-4 mr-2 shrink-0" />
        <span className="whitespace-nowrap">Buy More Credits</span>
      </Button>

      {/* Financial Widgets Grid */}
      <div className="grid grid-cols-2 gap-3">
        <CreditsWidget userId={user.id} />
        <SubscriptionWidget userId={user.id} />
        <PaymentsWidget userId={user.id} />
        <ReferralsWidget userId={user.id} inviteCode={inviteCode} />
      </div>

      {/* Recent Orders */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Recent Orders
        </h4>
        {creditOrders && creditOrders.length > 0 ? (
          <div className="space-y-2">
            {creditOrders.map((order: any) => (
              <div key={order.id} className="p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm transition-all duration-200 hover:border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{order.credit_plans?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-muted-foreground/70">{order.credits_purchased} credits • {format(new Date(order.created_at), "MMM d, yyyy")}</span>
                    </p>
                    {order.amount_paid != null && (
                      <p className="text-xs text-muted-foreground/50 mt-0.5">Paid: ${Number(order.amount_paid).toFixed(2)}</p>
                    )}
                  </div>
                  <Badge className={cn("text-xs", getStatusColor(order.status))}>
                    {order.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No orders yet</p>
        )}
      </div>

      {/* Transaction History */}
      <Separator className="my-2 bg-border/20" />
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4" />
          Transaction History
        </h4>
        {recentTransactions && recentTransactions.length > 0 ? (
          <div className="space-y-2">
            {recentTransactions.map((tx: any) => (
              <div key={tx.id} className="p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm transition-all duration-200 hover:border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{tx.description || tx.transaction_type}</p>
                    <p className="text-xs text-muted-foreground/70">
                      {format(new Date(tx.created_at), "MMM d, yyyy 'at' p")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-sm font-semibold",
                      tx.credits > 0 ? "text-green-500" : "text-red-500"
                    )}>
                      {tx.credits > 0 ? "+" : ""}{tx.credits}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Balance: {tx.balance_after}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>
        )}
      </div>
    </div>
  );

  // Usage Section
  const UsageSection = () => {
    const { data: analytics, isLoading: analyticsLoading } = useAnalyticsData(user?.id || "", !!user?.id);
    return (
      <div className="space-y-6">
        {/* AI Usage Analytics — moved from BeeBot header */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-purple-400" />
            AI Usage Analytics
            <span className="text-xs text-muted-foreground font-normal ml-1">Last 7 days</span>
          </h4>
          <RecentRunTraces userId={user?.id} />
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
            </div>
          ) : analytics ? (
            <div className="space-y-4">
              <UsageLimitsPanel analytics={analytics} />
              <AnalyticsStatsCards analytics={analytics} />
              <StreamingPerformanceCard analytics={analytics} />
              <Suspense fallback={<_ChartSkeleton />}>
                <DailyTrendChart dailyData={analytics.dailyData} />
              </Suspense>
              <Suspense fallback={<_ChartSkeleton />}>
                <SourceModelCharts
                  apiSourceBreakdown={analytics.apiSourceBreakdown}
                  modelBreakdown={analytics.modelBreakdown}
                />
              </Suspense>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No analytics data available</p>
          )}
        </div>

        {/* Course Progress */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Course Progress
          </h4>
          {courseProgress && courseProgress.length > 0 ? (
            <div className="space-y-3">
              {courseProgress.slice(0, 3).map((course) => (
                <div key={course.course_id} className="p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm transition-all duration-200 hover:border-primary/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold truncate max-w-[180px]">{course.course_title}</span>
                    <span className="text-xs text-primary font-semibold">{course.progress_percentage}%</span>
                  </div>
                  <Progress value={Number(course.progress_percentage)} className="h-1.5" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No enrolled courses</p>
          )}
        </div>
      </div>
    );
  };

  // Learning Section (NEW)
  const LearningSection = () => (
    <div className="space-y-4">
      <LearningStreakWidget 
        coursesCount={courseProgress.length}
        certificatesCount={certificates.length}
        overallProgress={overallProgress}
        currentStreak={currentStreak}
        longestStreak={longestStreak}
        onClick={() => setCourseHubDialogOpen(true)}
      />

      <AchievementsWidget 
        earnedCount={earnedAchievements.length}
        totalCount={earnedAchievements.length + lockedAchievements.length}
        onClick={() => setCourseHubDialogOpen(true)}
      />

      <CourseRecommendations />

      <FeedbackWidget />
    </div>
  );

  // Security Section (EXPANDED)
  const SecuritySection = () => (
    <div className="space-y-4">
      {/* Password Change */}
      <div className="p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm space-y-3 transition-all duration-200">
        <div className="flex items-center gap-2 mb-1">
          <Key className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Change Password</h4>
        </div>
        <div className="space-y-2">
          <Input
            type="password"
            value={passwordData.currentPassword}
            onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
            placeholder="Current password"
            className="h-9 text-sm bg-card/30 border-border/20 rounded-xl focus:border-primary/40"
          />
          <Input
            type="password"
            value={passwordData.newPassword}
            onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
            placeholder="New password (min 8 chars)"
            className="h-9 text-sm bg-card/30 border-border/20 rounded-xl focus:border-primary/40"
          />
          <Input
            type="password"
            value={passwordData.confirmPassword}
            onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
            placeholder="Confirm new password"
            className="h-9 text-sm bg-card/30 border-border/20 rounded-xl focus:border-primary/40"
          />
          <Button
            onClick={handlePasswordChange}
            disabled={isChangingPassword || !passwordData.currentPassword || !passwordData.newPassword}
            size="sm"
            className="w-full"
          >
            {isChangingPassword ? "Updating..." : "Update Password"}
          </Button>
        </div>
      </div>

      {/* 2FA Setup */}
      <TwoFactorSetup embedded />

      {/* Single Device Mode */}
      <div className="p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm space-y-3 transition-all duration-200">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Single Device Mode</p>
            <p className="text-xs text-muted-foreground/70">Only allow one active session</p>
          </div>
          <Switch
            checked={profileSettings?.enforce_single_device ?? false}
            onCheckedChange={(checked) => updateEnforceSingleDevice.mutate(checked)}
          />
        </div>

        {profileSettings?.enforce_single_device && (
          <Alert className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Only your most recent login session will remain active.
            </AlertDescription>
          </Alert>
        )}

        {!profileSettings?.enforce_single_device && (
          <div className="space-y-2 pt-2 border-t border-border/20">
            <p className="text-xs text-muted-foreground/70">Max concurrent sessions (1-10)</p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                max="10"
                value={profileSettings?.max_concurrent_sessions ?? 5}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (value >= 1 && value <= 10) {
                    updateMaxSessions.mutate(value);
                  }
                }}
                className="w-20 h-8 text-sm bg-card/30 border-border/20 rounded-xl"
              />
              <span className="text-xs text-muted-foreground/70">devices</span>
            </div>
          </div>
        )}
      </div>

      {/* Session Management */}
      <SessionManagement userId={user?.id} isUserView={true} />

      {/* Login History */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4" />
          Login History
        </h4>
        {loginHistory && loginHistory.length > 0 ? (
          <div className="space-y-2">
            {loginHistory.slice(0, 10).map((attempt) => (
              <div key={attempt.id} className="p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm transition-all duration-200 hover:border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">
                      {attempt.success ? "✓ Successful" : "✗ Failed"}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {format(new Date(attempt.attempt_time), "PPP 'at' p")}
                    </p>
                    {attempt.ip_address && (
                      <p className="text-xs text-muted-foreground">IP: {attempt.ip_address}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {attempt.attempt_type}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No login history</p>
        )}
      </div>
    </div>
  );

  // Notifications Section (EXPANDED with push)
  const NotificationsSection = () => (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm transition-all duration-200 hover:border-primary/20">
          <div>
            <p className="text-sm font-semibold">Email Notifications</p>
            <p className="text-xs text-muted-foreground/70">Receive updates via email</p>
          </div>
          <Switch
            checked={preferences?.email_notifications ?? true}
            onCheckedChange={(checked) => updatePreferences({ email_notifications: checked })}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm transition-all duration-200 hover:border-primary/20">
          <div>
            <p className="text-sm font-semibold">Enrollment Notifications</p>
            <p className="text-xs text-muted-foreground/70">Updates on enrollment status</p>
          </div>
          <Switch
            checked={preferences?.enrollment_notifications ?? true}
            onCheckedChange={(checked) => updatePreferences({ enrollment_notifications: checked })}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm transition-all duration-200 hover:border-primary/20">
          <div>
            <p className="text-sm font-semibold">Course Updates</p>
            <p className="text-xs text-muted-foreground/70">New content notifications</p>
          </div>
          <Switch
            checked={preferences?.course_updates ?? true}
            onCheckedChange={(checked) => updatePreferences({ course_updates: checked })}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm transition-all duration-200 hover:border-primary/20">
          <div>
            <p className="text-sm font-semibold">Push Notifications</p>
            <p className="text-xs text-muted-foreground/70">
              Browser push {permission === "granted" ? "(Enabled)" : "(Disabled)"}
            </p>
          </div>
          <Switch
            checked={permission === "granted" && isSubscribed}
            onCheckedChange={async (checked) => {
              if (checked) {
                await requestPermission();
              } else {
                await unsubscribe();
              }
              updatePreferences({ push_notifications: checked });
            }}
          />
        </div>

        {isSubscribed && (
          <Button onClick={sendTestNotification} variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
            🔔 Send Test Notification
          </Button>
        )}
      </div>
    </div>
  );

  // Render active section content
  const renderContent = () => {
    switch (activeTab) {
      case "profile": return <ProfileSection />;
      case "billing": return <BillingSection />;
      case "usage": return <UsageSection />;
      case "learning": return <LearningSection />;
      case "security": return <SecuritySection />;
      case "notifications": return <NotificationsSection />;
      case "memory": return <MemoryVaultWidget />;
      case "ai-models": return <AIModelsTab />;
      case "skills": return <SkillsManager onClose={() => onOpenChange(false)} />;
      default: return <ProfileSection />;
    }
  };

  // Desktop Content with Sidebar
  const DesktopContent = () => (
    <div className="flex gap-4 flex-1 min-h-0 h-full overflow-hidden">
      {/* Sidebar Navigation */}
      <div className="w-56 min-h-0 shrink-0 overflow-y-auto overscroll-contain rounded-[28px] border border-white/[0.07] bg-black/20 p-2 pr-1.5 space-y-1 custom-scrollbar">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-[20px] text-sm transition-all duration-200 border text-left",
              activeTab === item.id
                ? "bg-primary/12 text-primary font-semibold border-primary/25 shadow-[0_0_18px_hsl(var(--primary)/0.12)]"
                : "text-muted-foreground hover:bg-white/[0.055] hover:text-foreground border-transparent"
            )}
          >
            <span className={cn(
              "h-8 w-8 rounded-[15px] flex items-center justify-center border",
              activeTab === item.id
                ? "bg-primary/14 border-primary/20"
                : "bg-white/[0.035] border-white/[0.05]"
            )}>
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0 min-h-0 relative">
        {activeTab === "memory" ? (
          <div className="absolute inset-0 overflow-y-auto overscroll-contain pr-2 custom-scrollbar">
            {renderContent()}
          </div>
        ) : (
          <div className="absolute inset-0">
            <ScrollArea className="h-full pr-2 custom-scrollbar">
              {renderContent()}
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );

  // Mobile Content with Horizontal Tabs
  const MobileContent = () => (
    <>
      {/* Horizontal Scrollable Tabs */}
      <div className="shrink-0 overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
        <div className="flex gap-2 min-w-max">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-full text-xs whitespace-nowrap transition-all duration-200 shrink-0 border",
                activeTab === item.id
                  ? "bg-primary/15 text-primary font-semibold border-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.1)]"
                  : "bg-white/[0.04] text-muted-foreground border-white/[0.07] backdrop-blur-sm"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content rendered directly — parent handles scrolling */}
      {renderContent()}
    </>
  );

  // Sub-dialogs
  const subDialogs = (
    <>
      {courseHubDialogOpen && (
        <CourseHubDialog
          open={courseHubDialogOpen}
          onOpenChange={setCourseHubDialogOpen}
          userId={user.id}
        />
      )}
    </>
  );

  // Mobile: Bottom Drawer
  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="h-[88vh] flex flex-col bg-[#050708]/96 backdrop-blur-2xl border-white/[0.08] shadow-[0_-24px_80px_rgba(0,0,0,0.55)]">
            <DrawerHeader className="text-left pb-2 shrink-0 px-5">
              <DrawerTitle className="flex items-center gap-2 text-base">
                <span className="h-9 w-9 rounded-[16px] bg-primary/12 border border-primary/20 flex items-center justify-center">
                  <Settings className="h-4 w-4 text-primary" />
                </span>
                <span>My Profile</span>
              </DrawerTitle>
              <DrawerDescription className="text-xs text-muted-foreground/70">
                Account, AI, memory, security
              </DrawerDescription>
            </DrawerHeader>
            {/* Sticky tabs — outside scroll area */}
            <div className="shrink-0 overflow-x-auto scrollbar-hide pb-3 px-5">
              <div className="flex gap-2 min-w-max">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "flex items-center gap-2 px-3.5 py-2 rounded-full text-xs whitespace-nowrap transition-all duration-200 shrink-0 border",
                      activeTab === item.id
                        ? "bg-primary/15 text-primary font-semibold border-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.1)]"
                        : "bg-white/[0.04] text-muted-foreground border-white/[0.07] backdrop-blur-sm"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Scrollable content only */}
            <div className="flex-1 min-h-0 px-5 pb-8 overflow-y-auto overscroll-contain">
              {renderContent()}
            </div>
          </DrawerContent>
        </Drawer>
        {subDialogs}
      </>
    );
  }

  // Desktop: Dialog
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-7xl h-[72vh] flex flex-col !p-0 !gap-0 overflow-hidden rounded-[32px] bg-[#050708]/96 backdrop-blur-2xl border border-white/[0.08] shadow-[0_30px_110px_rgba(0,0,0,0.58)]">
          <DialogHeader className="border-b border-white/[0.065] bg-gradient-to-r from-white/[0.035] via-white/[0.018] to-primary/[0.035] px-4 py-3">
            <DialogTitle className="flex items-center gap-2.5 pr-10 text-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] border border-primary/20 bg-primary/10 shadow-[0_0_22px_hsl(var(--primary)/0.08)]">
                <Settings className="h-3.5 w-3.5 text-primary" />
              </span>
              <span className="min-w-0 truncate font-semibold tracking-[-0.01em]">My Profile</span>
              <span className="hidden min-w-0 truncate text-[11px] font-medium text-muted-foreground/70 sm:inline">
                Account center
              </span>
              <Badge className="ml-auto hidden h-5 shrink-0 rounded-full border border-emerald-400/18 bg-emerald-400/10 px-2 text-[10px] font-semibold text-emerald-300 sm:flex">
                {profileTone} · {profileScore}%
              </Badge>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Account, billing, AI models, memory, security
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden p-5 pt-4">
            <DesktopContent />
          </div>
        </DialogContent>
      </Dialog>
      {subDialogs}
    </>
  );
};
