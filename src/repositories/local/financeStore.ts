// ── FlowState finance storage engine ────────────────────────────────────────
// Local-first data layer for the Personal CFO (FlowState) surface, ported off
// Supabase so income/expense tracking works offline + persistently — same
// IndexedDB + write-through cache pattern as `noteStore` (see note-storage memory).
//
// Stores (one IndexedDB DB `beebot-finance`): accounts, categories, transactions,
// subscriptions, settings. Reads are synchronous from an in-memory cache after
// `ready()`; writes update the cache immediately and persist through a serialized
// queue. Default expense/income categories are seeded on first run so the UI is
// usable out of the box.

import type {
  FinancialAccount,
  TransactionCategory,
  Transaction,
  Subscription,
  FlowStateSettings,
} from "@/hooks/useFlowState";
import { ensurePersistentStorage } from "@/lib/storageDurability";

const DB_NAME = "beebot-finance";
const DB_VERSION = 1;
const ACCOUNTS = "accounts";
const CATEGORIES = "categories";
const TRANSACTIONS = "transactions";
const SUBSCRIPTIONS = "subscriptions";
const SETTINGS = "settings"; // single row keyed by user_id

function uid(): string {
  return crypto.randomUUID?.() || `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}
function nowIso(): string {
  return new Date().toISOString();
}
function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [ACCOUNTS, CATEGORIES, TRANSACTIONS, SUBSCRIPTIONS]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: "user_id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

// Seed categories shown immediately so spending-by-category etc. are usable.
function defaultCategories(userId: string): TransactionCategory[] {
  const make = (name: string, name_my: string, icon: string, color: string, type: "income" | "expense"): TransactionCategory => ({
    id: uid(), user_id: null, name, name_my, icon, color, type, is_system: true, is_active: true, created_at: nowIso(),
  });
  return [
    make("Salary", "လစာ", "💼", "#22c55e", "income"),
    make("Business", "စီးပွားရေး", "🏢", "#10b981", "income"),
    make("Investment", "ရင်းနှီးမြှုပ်နှံမှု", "📈", "#14b8a6", "income"),
    make("Gift", "လက်ဆောင်", "🎁", "#84cc16", "income"),
    make("Other Income", "အခြားဝင်ငွေ", "➕", "#65a30d", "income"),
    make("Food", "အစားအသောက်", "🍔", "#f97316", "expense"),
    make("Transport", "သွားလာရေး", "🚗", "#3b82f6", "expense"),
    make("Shopping", "ဈေးဝယ်", "🛍️", "#ec4899", "expense"),
    make("Bills", "ဘေလ်များ", "🧾", "#ef4444", "expense"),
    make("Entertainment", "ဖျော်ဖြေရေး", "🎬", "#a855f7", "expense"),
    make("Health", "ကျန်းမာရေး", "🏥", "#06b6d4", "expense"),
    make("Education", "ပညာရေး", "📚", "#6366f1", "expense"),
    make("Rent", "အိမ်ငှား", "🏠", "#f59e0b", "expense"),
    make("Other Expense", "အခြားအသုံးစရိတ်", "💸", "#9ca3af", "expense"),
  ];
}

class FinanceStore {
  private accounts = new Map<string, FinancialAccount>();
  private categories = new Map<string, TransactionCategory>();
  private transactions = new Map<string, Transaction>();
  private subscriptions = new Map<string, Subscription>();
  private settings = new Map<string, FlowStateSettings>();
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  ready(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.init();
    return this.initPromise;
  }

  private async init() {
    try { await ensurePersistentStorage(); } catch { /* best-effort */ }
    this.db = await openDb();
    await this.hydrate();
  }

  private async hydrate() {
    if (!this.db) return;
    const tx = this.db.transaction([ACCOUNTS, CATEGORIES, TRANSACTIONS, SUBSCRIPTIONS, SETTINGS], "readonly");
    const [accs, cats, txns, subs, setts] = await Promise.all([
      promisify(tx.objectStore(ACCOUNTS).getAll() as IDBRequest<FinancialAccount[]>),
      promisify(tx.objectStore(CATEGORIES).getAll() as IDBRequest<TransactionCategory[]>),
      promisify(tx.objectStore(TRANSACTIONS).getAll() as IDBRequest<Transaction[]>),
      promisify(tx.objectStore(SUBSCRIPTIONS).getAll() as IDBRequest<Subscription[]>),
      promisify(tx.objectStore(SETTINGS).getAll() as IDBRequest<FlowStateSettings[]>),
    ]);
    for (const a of accs) this.accounts.set(a.id, a);
    for (const c of cats) this.categories.set(c.id, c);
    for (const t of txns) this.transactions.set(t.id, t);
    for (const s of subs) this.subscriptions.set(s.id, s);
    for (const s of setts) this.settings.set(s.user_id, s);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
  private put(store: string, value: unknown): Promise<void> {
    return this.enqueue(async () => {
      if (!this.db) return;
      const tx = this.db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      await txDone(tx);
    });
  }
  private del(store: string, key: IDBValidKey): Promise<void> {
    return this.enqueue(async () => {
      if (!this.db) return;
      const tx = this.db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      await txDone(tx);
    });
  }

  // ── Categories ──────────────────────────────────────────────────────────
  private async ensureCategories(userId: string) {
    if (this.categories.size > 0) return;
    for (const c of defaultCategories(userId)) {
      this.categories.set(c.id, c);
      await this.put(CATEGORIES, c);
    }
  }
  async listCategories(userId: string): Promise<TransactionCategory[]> {
    await this.ready();
    await this.ensureCategories(userId);
    return [...this.categories.values()]
      .filter((c) => c.is_active && (c.is_system || c.user_id === userId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async addCategory(userId: string, partial: Partial<TransactionCategory>): Promise<TransactionCategory> {
    await this.ready();
    const cat: TransactionCategory = {
      id: uid(), user_id: userId,
      name: partial.name || "Category",
      name_my: partial.name_my ?? null,
      icon: partial.icon || "🏷️",
      color: partial.color || "#9ca3af",
      type: (partial.type as "income" | "expense") || "expense",
      is_system: false, is_active: true, created_at: nowIso(),
    };
    this.categories.set(cat.id, cat);
    await this.put(CATEGORIES, cat);
    return cat;
  }
  async deleteCategory(id: string): Promise<void> {
    await this.ready();
    this.categories.delete(id);
    await this.del(CATEGORIES, id);
  }
  /** Clear all of a user's transactions and zero their account balances. */
  async clearAllTransactions(userId: string): Promise<void> {
    await this.ready();
    for (const [id, t] of [...this.transactions]) {
      if (t.user_id === userId) { this.transactions.delete(id); await this.del(TRANSACTIONS, id); }
    }
    for (const a of this.accounts.values()) {
      if (a.user_id === userId && a.current_balance !== 0) {
        a.current_balance = 0; a.updated_at = nowIso(); await this.put(ACCOUNTS, a);
      }
    }
  }

  // ── Accounts ────────────────────────────────────────────────────────────
  async listAccounts(userId: string): Promise<FinancialAccount[]> {
    await this.ready();
    return [...this.accounts.values()]
      .filter((a) => a.is_active && a.user_id === userId)
      .sort((a, b) => (Number(b.is_default) - Number(a.is_default)) || a.created_at.localeCompare(b.created_at));
  }
  async addAccount(userId: string, partial: Partial<FinancialAccount>): Promise<FinancialAccount> {
    await this.ready();
    const isFirst = [...this.accounts.values()].filter((a) => a.user_id === userId && a.is_active).length === 0;
    const account: FinancialAccount = {
      id: uid(), user_id: userId,
      account_name: partial.account_name || "Account",
      account_type: partial.account_type || "cash",
      currency: partial.currency || "MMK",
      current_balance: Number(partial.current_balance) || 0,
      icon: partial.icon || "Wallet",
      color: partial.color || "#3B82F6",
      is_default: partial.is_default ?? isFirst, // first account becomes default
      is_active: true,
      created_at: nowIso(), updated_at: nowIso(),
    };
    this.accounts.set(account.id, account);
    await this.put(ACCOUNTS, account);
    return account;
  }
  async deleteAccount(id: string): Promise<void> {
    await this.ready();
    this.accounts.delete(id);
    await this.del(ACCOUNTS, id);
  }
  async setDefaultAccount(userId: string, id: string): Promise<void> {
    await this.ready();
    for (const a of this.accounts.values()) {
      if (a.user_id !== userId) continue;
      const wantDefault = a.id === id;
      if (a.is_default !== wantDefault) {
        a.is_default = wantDefault; a.updated_at = nowIso();
        await this.put(ACCOUNTS, a);
      }
    }
  }
  private async adjustBalance(accountId: string | null | undefined, delta: number) {
    if (!accountId) return;
    const acc = this.accounts.get(accountId);
    if (!acc) return;
    acc.current_balance = Number(acc.current_balance) + delta;
    acc.updated_at = nowIso();
    await this.put(ACCOUNTS, acc);
  }

  // ── Transactions ────────────────────────────────────────────────────────
  /** Attach joined category + account (matching the Supabase select with joins). */
  private join(t: Transaction): Transaction {
    return {
      ...t,
      category: t.category_id ? this.categories.get(t.category_id) : undefined,
      account: t.account_id ? this.accounts.get(t.account_id) : undefined,
    };
  }
  /** Transactions whose `transaction_date` (yyyy-MM-dd) is in [from, to], newest first. */
  async listTransactions(userId: string, fromDate: string, toDate: string): Promise<Transaction[]> {
    await this.ready();
    return [...this.transactions.values()]
      .filter((t) => t.user_id === userId && t.transaction_date >= fromDate && t.transaction_date <= toDate)
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
      .map((t) => this.join(t));
  }
  async addTransaction(userId: string, partial: Partial<Transaction>): Promise<Transaction> {
    await this.ready();
    const t: Transaction = {
      id: uid(), user_id: userId,
      account_id: partial.account_id || "",
      category_id: partial.category_id ?? null,
      type: (partial.type as Transaction["type"]) || "expense",
      amount: Number(partial.amount) || 0,
      currency: partial.currency || "MMK",
      description: partial.description ?? null,
      notes: partial.notes ?? null,
      transaction_date: partial.transaction_date || nowIso().slice(0, 10),
      is_recurring: partial.is_recurring || false,
      recurring_id: partial.recurring_id ?? null,
      tags: partial.tags ?? null,
      attachment_url: partial.attachment_url ?? null,
      source: partial.source ?? null,
      created_at: nowIso(), updated_at: nowIso(),
    };
    this.transactions.set(t.id, t);
    await this.put(TRANSACTIONS, t);
    await this.adjustBalance(t.account_id, t.type === "income" ? t.amount : -t.amount);
    return this.join(t);
  }
  async deleteTransaction(id: string): Promise<void> {
    await this.ready();
    const t = this.transactions.get(id);
    this.transactions.delete(id);
    await this.del(TRANSACTIONS, id);
    if (t) await this.adjustBalance(t.account_id, t.type === "income" ? -t.amount : t.amount);
  }
  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
    await this.ready();
    const existing = this.transactions.get(id);
    if (!existing) return;
    const oldDelta = existing.type === "income" ? existing.amount : -existing.amount;
    const next: Transaction = { ...existing, ...updates, id, updated_at: nowIso() };
    next.amount = Number(next.amount) || 0;
    this.transactions.set(id, next);
    await this.put(TRANSACTIONS, next);
    const newDelta = next.type === "income" ? next.amount : -next.amount;
    // Same account: apply the net change. (Account changes are rare in the UI.)
    if (existing.account_id === next.account_id) {
      await this.adjustBalance(next.account_id, newDelta - oldDelta);
    } else {
      await this.adjustBalance(existing.account_id, -oldDelta);
      await this.adjustBalance(next.account_id, newDelta);
    }
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────
  async listSubscriptions(userId: string): Promise<Subscription[]> {
    await this.ready();
    return [...this.subscriptions.values()]
      .filter((s) => s.user_id === userId && s.is_active)
      .sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date));
  }
  async addSubscription(userId: string, partial: Partial<Subscription>): Promise<Subscription> {
    await this.ready();
    const s: Subscription = {
      id: uid(), user_id: userId,
      account_id: partial.account_id ?? null,
      category_id: partial.category_id ?? null,
      name: partial.name || "Subscription",
      amount: Number(partial.amount) || 0,
      currency: partial.currency || "MMK",
      billing_cycle: partial.billing_cycle || "monthly",
      next_billing_date: partial.next_billing_date || nowIso().slice(0, 10),
      icon: partial.icon || "💳",
      color: partial.color ?? null,
      is_active: true,
      reminder_enabled: partial.reminder_enabled ?? false,
      reminder_days_before: partial.reminder_days_before ?? 3,
      created_at: nowIso(), updated_at: nowIso(),
    };
    this.subscriptions.set(s.id, s);
    await this.put(SUBSCRIPTIONS, s);
    return s;
  }
  async updateSubscription(id: string, updates: Partial<Subscription>): Promise<void> {
    await this.ready();
    const existing = this.subscriptions.get(id);
    if (!existing) return;
    const next = { ...existing, ...updates, id, updated_at: nowIso() } as Subscription;
    this.subscriptions.set(id, next);
    await this.put(SUBSCRIPTIONS, next);
  }
  async deleteSubscription(id: string): Promise<void> {
    await this.ready();
    this.subscriptions.delete(id);
    await this.del(SUBSCRIPTIONS, id);
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  async getSettings(userId: string): Promise<FlowStateSettings | null> {
    await this.ready();
    return this.settings.get(userId) ?? null;
  }
  // ── Backup / restore (raw dump — preserves ids, no side effects) ──────────
  async exportRaw(): Promise<{
    accounts: FinancialAccount[]; categories: TransactionCategory[];
    transactions: Transaction[]; subscriptions: Subscription[]; settings: FlowStateSettings[];
  }> {
    await this.ready();
    // strip the transient join fields so the dump is canonical
    const txns = [...this.transactions.values()].map(({ category, account, ...t }) => { void category; void account; return t; });
    return {
      accounts: [...this.accounts.values()],
      categories: [...this.categories.values()],
      transactions: txns,
      subscriptions: [...this.subscriptions.values()],
      settings: [...this.settings.values()],
    };
  }

  async importRaw(data: {
    accounts?: FinancialAccount[]; categories?: TransactionCategory[];
    transactions?: Transaction[]; subscriptions?: Subscription[]; settings?: FlowStateSettings[];
  }): Promise<void> {
    await this.ready();
    const replace = async <T extends { id?: string; user_id?: string }>(
      store: string, map: Map<string, T>, rows: T[] | undefined, key: (r: T) => string,
    ) => {
      if (!rows) return;
      for (const [, v] of [...map]) await this.del(store, key(v));
      map.clear();
      for (const r of rows) { map.set(key(r), r); await this.put(store, r); }
    };
    await replace(ACCOUNTS, this.accounts, data.accounts, (r) => r.id);
    await replace(CATEGORIES, this.categories, data.categories, (r) => r.id);
    await replace(TRANSACTIONS, this.transactions, data.transactions, (r) => r.id);
    await replace(SUBSCRIPTIONS, this.subscriptions, data.subscriptions, (r) => r.id);
    if (data.settings) {
      for (const [, v] of [...this.settings]) await this.del(SETTINGS, v.user_id);
      this.settings.clear();
      for (const s of data.settings) { this.settings.set(s.user_id, s); await this.put(SETTINGS, s); }
    }
  }

  async updateSettings(userId: string, updates: Partial<FlowStateSettings>): Promise<FlowStateSettings> {
    await this.ready();
    const existing = this.settings.get(userId);
    const next: FlowStateSettings = {
      id: existing?.id || uid(),
      user_id: userId,
      primary_currency: updates.primary_currency ?? existing?.primary_currency ?? "THB",
      display_currencies: updates.display_currencies ?? existing?.display_currencies ?? ["THB", "USD", "MMK"],
      monthly_budget: updates.monthly_budget ?? existing?.monthly_budget ?? null,
      show_balance_on_dashboard: updates.show_balance_on_dashboard ?? existing?.show_balance_on_dashboard ?? true,
      // `goal` is explicitly settable to null (to clear it), so use a presence check
      // rather than ?? which would never let null through.
      goal: updates.goal !== undefined ? updates.goal : existing?.goal ?? null,
      created_at: existing?.created_at || nowIso(),
      updated_at: nowIso(),
    };
    this.settings.set(userId, next);
    await this.put(SETTINGS, next);
    return next;
  }
}

export const financeStore = new FinanceStore();
