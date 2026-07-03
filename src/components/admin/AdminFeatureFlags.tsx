import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Search, RefreshCw, Settings2, Wrench, Clock, Sparkles, AlertTriangle, Check, X, Power, PowerOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeatureFlag, FeatureStatus } from "@/hooks/useFeatureFlags";
import * as LucideIcons from "lucide-react";

const statusOptions: { value: FeatureStatus; label: string; labelMy: string; icon: React.ElementType; color: string }[] = [
  { value: "active", label: "Active", labelMy: "ပုံမှန်", icon: Check, color: "text-emerald-500" },
  { value: "beta", label: "Beta", labelMy: "စမ်းသပ်ဆဲ", icon: Sparkles, color: "text-blue-500" },
  { value: "maintenance", label: "Maintenance", labelMy: "ပြုပြင်နေ", icon: Wrench, color: "text-orange-500" },
  { value: "coming_soon", label: "Coming Soon", labelMy: "မကြာမီလာမည်", icon: Clock, color: "text-purple-500" },
  { value: "deprecated", label: "Deprecated", labelMy: "ဖယ်ရှားတော့မည်", icon: AlertTriangle, color: "text-red-500" },
];

const categoryLabels: Record<string, string> = {
  learning: "🎓 Learning",
  ai_tools: "🤖 AI Tools",
  collaboration: "👥 Collaboration",
  engagement: "🏆 Engagement",
  monetization: "💳 Monetization",
  general: "⚙️ General",
};

// Dynamic icon component
const DynamicIcon = ({ iconName, className }: { iconName: string; className?: string }) => {
  const icons = LucideIcons as unknown as Record<string, React.ElementType>;
  const IconComponent = icons[iconName];
  if (!IconComponent || typeof IconComponent !== "function") return <Settings2 className={className} />;
  return <IconComponent className={className} />;
};

export function AdminFeatureFlags() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>(["learning", "ai_tools"]);
  const [editingFeature, setEditingFeature] = useState<FeatureFlag | null>(null);
  const [editForm, setEditForm] = useState<{
    status: FeatureStatus;
    is_enabled: boolean;
    show_in_nav: boolean;
    show_on_dashboard: boolean;
    maintenance_message: string;
    maintenance_message_my: string;
  }>({ status: "active", is_enabled: true, show_in_nav: true, show_on_dashboard: true, maintenance_message: "", maintenance_message_my: "" });

  // Confirmation dialog state
  const [confirmToggle, setConfirmToggle] = useState<{
    flag: FeatureFlag;
    newState: boolean;
  } | null>(null);

  // Bulk action confirmation
  const [bulkAction, setBulkAction] = useState<"enable" | "disable" | null>(null);

  // Fetch all feature flags
  const { data: flags = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as FeatureFlag[];
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<FeatureFlag> & { feature_key: string }) => {
      const { feature_key, ...updateData } = updates;
      const { error } = await supabase
        .from("feature_flags")
        .update({
          ...updateData,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
          ...(updateData.is_enabled === false ? { disabled_at: new Date().toISOString(), disabled_by: user?.id } : {}),
          ...(updateData.is_enabled === true ? { enabled_at: new Date().toISOString() } : {}),
        })
        .eq("feature_key", feature_key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
      toast.success("Feature updated successfully");
      setEditingFeature(null);
      setConfirmToggle(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      const { error } = await supabase
        .from("feature_flags")
        .update({
          is_enabled: enable,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
          ...(enable ? { enabled_at: new Date().toISOString() } : { disabled_at: new Date().toISOString(), disabled_by: user?.id }),
        })
        .neq("feature_key", "dashboard"); // Don't disable dashboard
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
      toast.success(`All features ${bulkAction === "enable" ? "enabled" : "disabled"}`);
      setBulkAction(null);
    },
    onError: (error: Error) => {
      toast.error(`Bulk update failed: ${error.message}`);
      setBulkAction(null);
    },
  });

  // Group flags by category
  const groupedFlags = useMemo(() => {
    const majorFlags = flags.filter(f => !f.parent_feature_key);
    const grouped: Record<string, FeatureFlag[]> = {};

    majorFlags.forEach(flag => {
      if (!grouped[flag.category]) {
        grouped[flag.category] = [];
      }
      grouped[flag.category].push(flag);
    });

    return grouped;
  }, [flags]);

  // Get sub-features for a parent
  const getSubFeatures = (parentKey: string) => {
    return flags.filter(f => f.parent_feature_key === parentKey);
  };

  // Check if parent is disabled
  const isParentDisabled = (flag: FeatureFlag) => {
    if (!flag.parent_feature_key) return false;
    const parent = flags.find(f => f.feature_key === flag.parent_feature_key);
    return parent ? !parent.is_enabled : false;
  };

  // Filter by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery) return groupedFlags;

    const filtered: Record<string, FeatureFlag[]> = {};
    Object.entries(groupedFlags).forEach(([category, categoryFlags]) => {
      const matchingFlags = categoryFlags.filter(f =>
        f.feature_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.feature_key.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matchingFlags.length > 0) {
        filtered[category] = matchingFlags;
      }
    });
    return filtered;
  }, [groupedFlags, searchQuery]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  // Show confirmation before toggling
  const handleQuickToggle = (flag: FeatureFlag) => {
    setConfirmToggle({ flag, newState: !flag.is_enabled });
  };

  // Confirm the toggle
  const confirmToggleAction = () => {
    if (!confirmToggle) return;
    updateMutation.mutate({
      feature_key: confirmToggle.flag.feature_key,
      is_enabled: confirmToggle.newState,
    });
  };

  const openEditDialog = (flag: FeatureFlag) => {
    setEditingFeature(flag);
    setEditForm({
      status: flag.status,
      is_enabled: flag.is_enabled,
      show_in_nav: flag.show_in_nav,
      show_on_dashboard: flag.show_on_dashboard,
      maintenance_message: flag.maintenance_message || "",
      maintenance_message_my: flag.maintenance_message_my || "",
    });
  };

  const handleSaveEdit = () => {
    if (!editingFeature) return;
    updateMutation.mutate({
      feature_key: editingFeature.feature_key,
      ...editForm,
    });
  };

  const handleBulkAction = (action: "enable" | "disable") => {
    setBulkAction(action);
  };

  const confirmBulkAction = () => {
    if (!bulkAction) return;
    bulkUpdateMutation.mutate(bulkAction === "enable");
  };

  const getStatusBadge = (status: FeatureStatus, isEnabled: boolean) => {
    const config = statusOptions.find(s => s.value === status);
    if (!config) return null;

    if (!isEnabled) {
      return (
        <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted">
          <X className="h-3 w-3 mr-1" />
          Disabled
        </Badge>
      );
    }

    const Icon = config.icon;
    return (
      <Badge variant="outline" className={cn("border", config.color, `bg-${config.color.split("-")[1]}-500/10`)}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Feature Management</h1>
          <p className="text-muted-foreground">Enable, disable, and configure app features</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleBulkAction("enable")} className="text-emerald-500 hover:text-emerald-600">
            <Power className="h-4 w-4 mr-2" />
            Enable All
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleBulkAction("disable")} className="text-destructive hover:text-destructive">
            <PowerOff className="h-4 w-4 mr-2" />
            Disable All
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search features..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Feature Groups */}
      <div className="space-y-4">
        {Object.entries(filteredCategories).map(([category, categoryFlags]) => (
          <Card key={category} className="overflow-hidden">
            <Collapsible
              open={expandedCategories.includes(category)}
              onOpenChange={() => toggleCategory(category)}
            >
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {expandedCategories.includes(category) ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                      <CardTitle className="text-lg">
                        {categoryLabels[category] || category}
                      </CardTitle>
                      <Badge variant="secondary">{categoryFlags.length}</Badge>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="space-y-3 pt-0">
                  {categoryFlags.map((flag) => {
                    const subFeatures = getSubFeatures(flag.feature_key);
                    const hasSubFeatures = subFeatures.length > 0;

                    return (
                      <div key={flag.feature_key} className="space-y-2">
                        {/* Main Feature Row */}
                        <div
                          className={cn(
                            "flex items-center justify-between p-4 rounded-lg border transition-all",
                            flag.is_enabled ? "bg-card" : "bg-muted/30 opacity-70"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-10 w-10 rounded-lg flex items-center justify-center",
                              flag.is_enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                              <DynamicIcon iconName={flag.icon} className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{flag.feature_name}</span>
                                {flag.feature_name_my && (
                                  <span className="text-sm text-muted-foreground">
                                    ({flag.feature_name_my})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {getStatusBadge(flag.status, flag.is_enabled)}
                                {hasSubFeatures && (
                                  <span className="text-xs text-muted-foreground">
                                    {subFeatures.length} sub-features
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(flag)}
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                            <Switch
                              checked={flag.is_enabled}
                              onCheckedChange={() => handleQuickToggle(flag)}
                              disabled={updateMutation.isPending}
                            />
                          </div>
                        </div>

                        {/* Sub-features */}
                        {hasSubFeatures && flag.is_enabled && (
                          <div className="ml-8 space-y-2">
                            {subFeatures.map((subFlag) => {
                              const parentDisabled = isParentDisabled(subFlag);
                              return (
                                <div
                                  key={subFlag.feature_key}
                                  className={cn(
                                    "flex items-center justify-between p-3 rounded-lg border-l-2 bg-muted/20",
                                    subFlag.is_enabled && !parentDisabled ? "border-primary/50" : "border-muted opacity-60"
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <DynamicIcon iconName={subFlag.icon} className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">{subFlag.feature_name}</span>
                                    {getStatusBadge(subFlag.status, subFlag.is_enabled)}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => openEditDialog(subFlag)}
                                    >
                                      <Settings2 className="h-3 w-3" />
                                    </Button>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span>
                                          <Switch
                                            checked={subFlag.is_enabled}
                                            onCheckedChange={() => handleQuickToggle(subFlag)}
                                            disabled={updateMutation.isPending || parentDisabled}
                                            className="scale-90"
                                          />
                                        </span>
                                      </TooltipTrigger>
                                      {parentDisabled && (
                                        <TooltipContent>
                                          <p>Enable parent feature first</p>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {/* Toggle Confirmation Dialog */}
      <AlertDialog open={!!confirmToggle} onOpenChange={() => setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.newState ? "Enable" : "Disable"} Feature?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.newState
                ? `Are you sure you want to enable "${confirmToggle?.flag.feature_name}"? Users will be able to access this feature.`
                : `Are you sure you want to disable "${confirmToggle?.flag.feature_name}"? Users will no longer be able to access this feature.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleAction}
              className={confirmToggle?.newState ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:bg-destructive/90"}
            >
              {confirmToggle?.newState ? "Enable" : "Disable"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Action Confirmation Dialog */}
      <AlertDialog open={!!bulkAction} onOpenChange={() => setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "enable" ? "Enable All Features?" : "Disable All Features?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "enable"
                ? "This will enable all features. Users will be able to access all functionality."
                : "This will disable all features except Dashboard. Users will not be able to access any features."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkAction}
              className={bulkAction === "enable" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:bg-destructive/90"}
            >
              {bulkAction === "enable" ? "Enable All" : "Disable All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingFeature} onOpenChange={() => setEditingFeature(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Feature: {editingFeature?.feature_name}</DialogTitle>
            <DialogDescription>
              Configure the status and availability of this feature.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch
                checked={editForm.is_enabled}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_enabled: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Show in Navigation</Label>
              <Switch
                checked={editForm.show_in_nav}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, show_in_nav: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Show Widget on Dashboard</Label>
              <Switch
                checked={editForm.show_on_dashboard}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, show_on_dashboard: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(value: FeatureStatus) => setEditForm(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", option.color)} />
                          <span>{option.label}</span>
                          <span className="text-muted-foreground">({option.labelMy})</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {(editForm.status === "maintenance" || editForm.status === "coming_soon") && (
              <>
                <div className="space-y-2">
                  <Label>Message (English)</Label>
                  <Textarea
                    placeholder="Optional message explaining the status..."
                    value={editForm.maintenance_message}
                    onChange={(e) => setEditForm(prev => ({ ...prev, maintenance_message: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Message (Myanmar)</Label>
                  <Textarea
                    placeholder="မြန်မာဘာသာဖြင့် ရှင်းလင်းချက်..."
                    value={editForm.maintenance_message_my}
                    onChange={(e) => setEditForm(prev => ({ ...prev, maintenance_message_my: e.target.value }))}
                    rows={2}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFeature(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
