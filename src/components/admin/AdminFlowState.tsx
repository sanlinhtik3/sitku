import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Wallet,
  Users,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Settings,
  BarChart3,
  Loader2,
  DollarSign,
  Plus,
  Trash2,
  Edit,
} from "lucide-react";
import { toast } from "sonner";

export function AdminFlowState() {
  const queryClient = useQueryClient();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<"income" | "expense">("expense");
  const [newCategoryIcon, setNewCategoryIcon] = useState("📦");

  // Fetch feature flag status
  const { data: featureFlag, isLoading: flagLoading } = useQuery({
    queryKey: ["flowstate-feature-flag"],
    queryFn: async () => {
      const { data } = await supabase.from("feature_flags").select("*").eq("feature_key", "flowstate").single();
      return data;
    },
  });

  // Fetch statistics
  const { data: stats } = useQuery({
    queryKey: ["flowstate-admin-stats"],
    queryFn: async () => {
      const [usersResult, transactionsResult, accountsResult, categoriesResult] = await Promise.all([
        supabase.from("flowstate_settings").select("id", { count: "exact" }),
        supabase.from("user_transactions").select("id", { count: "exact" }),
        supabase.from("financial_accounts").select("id", { count: "exact" }),
        supabase.from("transaction_categories").select("*").eq("is_system", true),
      ]);

      return {
        totalUsers: usersResult.count || 0,
        totalTransactions: transactionsResult.count || 0,
        totalAccounts: accountsResult.count || 0,
        systemCategories: categoriesResult.data || [],
      };
    },
  });

  // Fetch system categories
  const { data: categories = [] } = useQuery({
    queryKey: ["flowstate-system-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("transaction_categories")
        .select("*")
        .eq("is_system", true)
        .order("type", { ascending: true })
        .order("name", { ascending: true });
      return data || [];
    },
  });

  // Toggle feature flag
  const toggleFeature = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("feature_flags")
        .update({
          is_enabled: enabled,
          status: enabled ? "active" : "disabled",
          enabled_at: enabled ? new Date().toISOString() : null,
          disabled_at: enabled ? null : new Date().toISOString(),
        })
        .eq("feature_key", "flowstate");
      if (error) throw error;
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-feature-flag"] });
      toast.success(`FlowState ${enabled ? "enabled" : "disabled"} successfully`);
    },
    onError: () => {
      toast.error("Failed to update feature status");
    },
  });

  // Add system category
  const addCategory = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("transaction_categories").insert([
        {
          name: newCategoryName,
          type: newCategoryType,
          icon: newCategoryIcon,
          color: newCategoryType === "income" ? "#22C55E" : "#EF4444",
          is_system: true,
          is_active: true,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-system-categories"] });
      setNewCategoryName("");
      setNewCategoryIcon("📦");
      toast.success("Category added successfully");
    },
    onError: () => {
      toast.error("Failed to add category");
    },
  });

  // Delete category
  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transaction_categories").delete().eq("id", id).eq("is_system", true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-system-categories"] });
      toast.success("Category deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete category");
    },
  });

  const incomeCategories = categories.filter((c) => c.type === "income");
  const expenseCategories = categories.filter((c) => c.type === "expense");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">FlowState</h2>
            <p className="text-sm text-muted-foreground">Manage income & expense tracker settings</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {flagLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Label htmlFor="flowstate-toggle" className="text-sm">
                {featureFlag?.is_enabled ? "Enabled" : "Disabled"}
              </Label>
              <Switch
                id="flowstate-toggle"
                checked={featureFlag?.is_enabled || false}
                onCheckedChange={(checked) => toggleFeature.mutate(checked)}
                disabled={toggleFeature.isPending}
              />
            </>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalUsers || 0}</p>
                <p className="text-xs text-muted-foreground">Active Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalTransactions || 0}</p>
                <p className="text-xs text-muted-foreground">Transactions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalAccounts || 0}</p>
                <p className="text-xs text-muted-foreground">Accounts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-xs text-muted-foreground">Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="categories" className="space-y-4">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="currencies">Currencies</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          {/* Add Category */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add System Category</CardTitle>
              <CardDescription>Add default categories that all users will see</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Icon"
                  value={newCategoryIcon}
                  onChange={(e) => setNewCategoryIcon(e.target.value)}
                  className="w-20"
                />
                <Select value={newCategoryType} onValueChange={(v) => setNewCategoryType(v as "income" | "expense")}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => addCategory.mutate()} disabled={!newCategoryName || addCategory.isPending}>
                  {addCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Income Categories */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Income Categories ({incomeCategories.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {incomeCategories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 group">
                    <div className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span className="text-sm">{cat.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-rose-500"
                      onClick={() => deleteCategory.mutate(cat.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Expense Categories */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-rose-500" />
                Expense Categories ({expenseCategories.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {expenseCategories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 group">
                    <div className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span className="text-sm">{cat.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-rose-500"
                      onClick={() => deleteCategory.mutate(cat.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="currencies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Supported Currencies
              </CardTitle>
              <CardDescription>Configure supported currencies for FlowState</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🇲🇲</span>
                    <div>
                      <p className="font-medium">MMK</p>
                      <p className="text-xs text-muted-foreground">Myanmar Kyat</p>
                    </div>
                  </div>
                  <Badge variant="secondary">Default</Badge>
                </div>
                <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🇺🇸</span>
                    <div>
                      <p className="font-medium">USD</p>
                      <p className="text-xs text-muted-foreground">US Dollar</p>
                    </div>
                  </div>
                  <Badge variant="outline">Active</Badge>
                </div>
                <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🇹🇭</span>
                    <div>
                      <p className="font-medium">THB</p>
                      <p className="text-xs text-muted-foreground">Thai Baht</p>
                    </div>
                  </div>
                  <Badge variant="outline">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                General Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Allow user custom categories</Label>
                  <p className="text-xs text-muted-foreground">Let users create their own categories</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Show balance on dashboard widget</Label>
                  <p className="text-xs text-muted-foreground">Display balance in the dashboard widget</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable subscriptions tracking</Label>
                  <p className="text-xs text-muted-foreground">Allow users to track recurring payments</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
