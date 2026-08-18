import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Settings, 
  FolderOpen, 
  Plus, 
  Trash2, 
  AlertTriangle,
  Globe,
  Bell,
  Eye,
  Loader2,
  ShieldCheck,
  Download,
  Upload,
  Wallet,
  TrendingUp,
  Sparkles,
  BarChart3,
  PiggyBank,
  CreditCard,
  Repeat2,
  Calendar,
  type LucideIcon,
} from "@/components/flowstate/solarIcons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { exportAndDownload, readBackupFile, importBackup } from "@/lib/dataBackup";
import { onDurabilityChange, refreshDurabilityStatus, type DurabilityStatus } from "@/lib/storageDurability";
import { toast } from "sonner";
import type { TransactionCategory, FlowStateSettings } from "@/hooks/useFlowState";
import { AddCategoryDialog } from "./AddCategoryDialog";
import { CategoryIcon } from "./CategoryIcon";
import { cn } from "@/lib/utils";
import { FLOWSTATE_WIDGETS, readFlowStateWidgetVisibility, writeFlowStateWidgetVisibility, type FlowStateWidgetKey } from "@/lib/flowStateOverviewWidgets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface FlowStateManageProps {
  userId: string;
  categories: TransactionCategory[];
  settings: FlowStateSettings | null;
  onRefetch: () => void;
}

const CURRENCIES = [
  { code: "MMK", label: "Myanmar Kyat (Ks)" },
  { code: "THB", label: "Thai Baht (฿)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "USDT", label: "Tether (₮)" },
];

const WIDGET_ICONS: Record<FlowStateWidgetKey, LucideIcon> = {
  net: Wallet,
  income: TrendingUp,
  incomeIntel: Sparkles,
  spending: BarChart3,
  trend: TrendingUp,
  goal: PiggyBank,
  subs: CreditCard,
  txns: Repeat2,
  calendar: Calendar,
};

function groupCategories(rows: TransactionCategory[]) {
  const groups = new Map<string, TransactionCategory[]>();
  for (const category of rows) {
    const group = category.group || (category.is_system ? "Legacy & general" : "Custom");
    groups.set(group, [...(groups.get(group) || []), category]);
  }
  return [...groups.entries()];
}

export function FlowStateManage({ userId, categories, settings, onRefetch }: FlowStateManageProps) {
  const queryClient = useQueryClient();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCategoryType, setAddCategoryType] = useState<"income" | "expense">("expense");
  
  // Backup & restore
  const [backupBusy, setBackupBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [durability, setDurability] = useState<DurabilityStatus | null>(null);
  useEffect(() => {
    const off = onDurabilityChange(setDurability);
    void refreshDurabilityStatus();
    return off;
  }, []);
  const atEvictionRisk = durability?.supported && !durability.persisted;

  const handleExport = async () => {
    setBackupBusy(true);
    try {
      const s = await exportAndDownload();
      toast.success(`Backup saved — ${s.notes} notes · ${s.transactions} transactions · ${s.posts} posts · ${s.evMessages} E.V messages`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setBackupBusy(true);
    try {
      const backup = await readBackupFile(file);
      const s = await importBackup(backup);
      queryClient.invalidateQueries(); // refresh every view from restored data
      toast.success(`Restored — ${s.notes} notes · ${s.transactions} transactions · ${s.posts} posts · ${s.evMessages} E.V messages`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBackupBusy(false);
    }
  };

  // Local settings state
  const [primaryCurrency, setPrimaryCurrency] = useState(settings?.primary_currency || "MMK");
  const [monthlyBudget, setMonthlyBudget] = useState(String(settings?.monthly_budget || ""));
  const [showOnDashboard, setShowOnDashboard] = useState(settings?.show_balance_on_dashboard ?? true);
  const [visibleWidgets, setVisibleWidgets] = useState(readFlowStateWidgetVisibility);

  const toggleWidget = (key: FlowStateWidgetKey) => {
    setVisibleWidgets((current) => {
      const next = { ...current, [key]: !current[key] };
      writeFlowStateWidgetVisibility(next);
      return next;
    });
  };

  const incomeCategories = categories.filter(c => c.type === "income");
  const expenseCategories = categories.filter(c => c.type === "expense");
  const incomeGroups = groupCategories(incomeCategories);
  const expenseGroups = groupCategories(expenseCategories);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<FlowStateSettings>) => {
      await financeStore.updateSettings(userId, {
        primary_currency: newSettings.primary_currency || primaryCurrency,
        monthly_budget: newSettings.monthly_budget !== undefined ? newSettings.monthly_budget : (monthlyBudget ? Number(monthlyBudget) : null),
        show_balance_on_dashboard: newSettings.show_balance_on_dashboard !== undefined ? newSettings.show_balance_on_dashboard : showOnDashboard,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-settings"] });
      toast.success("Settings updated");
    },
    onError: () => {
      toast.error("Failed to update settings");
    },
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      await financeStore.deleteCategory(categoryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-categories"] });
      toast.success("Category deleted");
    },
    onError: () => {
      toast.error("Failed to delete category");
    },
  });

  // Clear all transactions mutation
  const clearTransactionsMutation = useMutation({
    mutationFn: async () => {
      await financeStore.clearAllTransactions(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flowstate-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-income-intel"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-source-flow"] });
      queryClient.invalidateQueries({ queryKey: ["flowstate-goal"] });
      queryClient.invalidateQueries({ queryKey: ["spending-calendar"] });
      toast.success("All transactions cleared");
    },
    onError: () => {
      toast.error("Failed to clear transactions");
    },
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      primary_currency: primaryCurrency,
      monthly_budget: monthlyBudget ? Number(monthlyBudget) : null,
      show_balance_on_dashboard: showOnDashboard,
    });
  };

  return (
    <div className="flowstate-manage-view space-y-[14px]">
      {/* Categories Section */}
      <Card className="flowstate-manage-card flowstate-manage-categories p-4 border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="h-4 w-4 text-blue-500" />
          <h4 className="font-medium">Categories</h4>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h5 className="text-sm font-medium">Income</h5>
              <p className="text-[11px] text-muted-foreground">{incomeCategories.length} categories · grouped by source</p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setAddCategoryType("income");
                setAddCategoryOpen(true);
              }}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {incomeGroups.map(([group, rows]) => (
              <div key={group} className="rounded-[var(--radius)] border border-border/40 bg-muted/15 p-2">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase text-muted-foreground">{group}</p>
                <div className="space-y-0.5">
                  {rows.map((cat) => (
                    <div key={cat.id} className="flex min-h-10 items-center gap-2 rounded-[var(--radius)] px-2 hover:bg-muted/50">
                      <CategoryIcon icon={cat.icon} color={cat.color} containerClassName="h-7 w-7 shrink-0 rounded-[var(--radius)]" style={{ backgroundColor: `${cat.color}18` }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{cat.name}</span>
                        {cat.name_my && <span className="block truncate text-[9px] text-muted-foreground">{cat.name_my}</span>}
                      </span>
                      {!cat.is_system && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteCategoryMutation.mutate(cat.id)} disabled={deleteCategoryMutation.isPending} aria-label={`Delete ${cat.name}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h5 className="text-sm font-medium">Expenses</h5>
              <p className="text-[11px] text-muted-foreground">{expenseCategories.length} categories · specific bills, rent and daily spend</p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setAddCategoryType("expense");
                setAddCategoryOpen(true);
              }}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {expenseGroups.map(([group, rows]) => (
              <div key={group} className="rounded-[var(--radius)] border border-border/40 bg-muted/15 p-2">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase text-muted-foreground">{group}</p>
                <div className="space-y-0.5">
                  {rows.map((cat) => (
                    <div key={cat.id} className="flex min-h-10 items-center gap-2 rounded-[var(--radius)] px-2 hover:bg-muted/50">
                      <CategoryIcon icon={cat.icon} color={cat.color} containerClassName="h-7 w-7 shrink-0 rounded-[var(--radius)]" style={{ backgroundColor: `${cat.color}18` }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{cat.name}</span>
                        {cat.name_my && <span className="block truncate text-[9px] text-muted-foreground">{cat.name_my}</span>}
                      </span>
                      {!cat.is_system && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteCategoryMutation.mutate(cat.id)} disabled={deleteCategoryMutation.isPending} aria-label={`Delete ${cat.name}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Overview widget visibility — mirrors the handoff and updates the dashboard immediately. */}
      <Card className="flowstate-manage-card flowstate-widget-manager p-4 border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1">
          <Eye className="h-4 w-4 text-violet-300" />
          <h4 className="font-medium">Overview Widgets</h4>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Choose which cards appear on your Overview / CFO dashboard.</p>
        <div className="flowstate-widget-list">
          {FLOWSTATE_WIDGETS.map((widget) => {
            const WidgetIcon = WIDGET_ICONS[widget.key];
            return (
              <div key={widget.key} className="flowstate-widget-row">
                <span className="flowstate-widget-icon"><WidgetIcon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <strong>{widget.label}</strong>
                  <small>{widget.description}</small>
                </span>
                <Switch checked={visibleWidgets[widget.key]} onCheckedChange={() => toggleWidget(widget.key)} aria-label={`Show ${widget.label}`} />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Settings Section */}
      <Card className="flowstate-manage-card p-4 border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-emerald-500" />
          <h4 className="font-medium">Settings</h4>
        </div>

        <div className="space-y-4">
          {/* Primary Currency */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">Primary Currency</Label>
            </div>
            <div className="flowstate-currency-options" role="group" aria-label="Primary currency">
              {CURRENCIES.map((currency) => (
                <button key={currency.code} type="button" data-active={primaryCurrency === currency.code} onClick={() => setPrimaryCurrency(currency.code)} title={currency.label}>{currency.code}</button>
              ))}
            </div>
          </div>

          {/* Monthly Budget */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">Monthly Budget</Label>
            </div>
            <Input
              type="number"
              placeholder="500000"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
              className="w-40 h-9 text-xs"
            />
          </div>

          {/* Show on Dashboard */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">Show Balance on Dashboard</Label>
            </div>
            <Switch 
              checked={showOnDashboard} 
              onCheckedChange={setShowOnDashboard}
            />
          </div>

          <Button 
            onClick={handleSaveSettings} 
            className="w-full h-9 text-sm"
            disabled={updateSettingsMutation.isPending}
          >
            {updateSettingsMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save Settings"
            )}
          </Button>
        </div>
      </Card>

      {/* Backup & Restore — the safety net against browser eviction (all app data). */}
      <Card className="flowstate-manage-card p-4 border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <h4 className="font-medium">Backup &amp; Restore</h4>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Save <b>all</b> your data (notes, finance, consultant, and E.V memory) to one file you keep safely — and restore it on any device. The best protection against data loss.
        </p>
        {atEvictionRisk && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Your browser hasn’t granted <b>permanent</b> storage, so data could be evicted. Export a backup regularly, or install the app (Add to Home Screen) to make storage durable.</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="gap-1.5" disabled={backupBusy} onClick={handleExport}>
            {backupBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export all data
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={backupBusy} onClick={() => importInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Restore from file
          </Button>
          <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="flowstate-manage-danger p-4 border-destructive/30 bg-destructive/5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h4 className="font-medium text-destructive">Danger Zone</h4>
        </div>

        <div className="space-y-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full h-9 text-sm border-destructive/30 text-destructive hover:bg-destructive/10">
                Clear All Transactions
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Transactions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all your transactions and reset account balances to zero. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  className="bg-destructive hover:bg-destructive/90"
                  onClick={() => clearTransactionsMutation.mutate()}
                >
                  {clearTransactionsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Clear All"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>

      {/* Add Category Dialog */}
      <AddCategoryDialog
        open={addCategoryOpen}
        onOpenChange={setAddCategoryOpen}
        type={addCategoryType}
        userId={userId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["flowstate-categories"] });
        }}
      />
    </div>
  );
}
