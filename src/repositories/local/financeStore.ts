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
import {
  derivePlannedExpenseStatus,
  nextPlannedExpenseDueDate,
  type PlannedExpense,
} from "@/lib/flowstate/plan";
import { ensurePersistentStorage } from "@/lib/storageDurability";
import { captureDeviceTransactionTime, isTransactionDateInRange, transactionDateKey } from "@/lib/flowstate/financeDates";
import {
  SYSTEM_CATEGORY_CATALOG,
  SYSTEM_CATEGORY_CATALOG_VERSION,
} from "@/lib/flowstate/categoryCatalog";

const DB_NAME = "beebot-finance";
const DB_VERSION = 2;
const ACCOUNTS = "accounts";
const CATEGORIES = "categories";
const TRANSACTIONS = "transactions";
const SUBSCRIPTIONS = "subscriptions";
const PLANNED_EXPENSES = "planned_expenses";
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
      for (const name of [ACCOUNTS, CATEGORIES, TRANSACTIONS, SUBSCRIPTIONS, PLANNED_EXPENSES]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: "user_id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

function catalogCategories(): TransactionCategory[] {
  const createdAt = nowIso();
  return SYSTEM_CATEGORY_CATALOG.map((definition) => ({
    ...definition,
    user_id: null,
    catalog_version: SYSTEM_CATEGORY_CATALOG_VERSION,
    is_system: true,
    is_active: true,
    created_at: createdAt,
  }));
}

class FinanceStore {
  private accounts = new Map<string, FinancialAccount>();
  private categories = new Map<string, TransactionCategory>();
  private transactions = new Map<string, Transaction>();
  private subscriptions = new Map<string, Subscription>();
  private plannedExpenses = new Map<string, PlannedExpense>();
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
    const tx = this.db.transaction([ACCOUNTS, CATEGORIES, TRANSACTIONS, SUBSCRIPTIONS, PLANNED_EXPENSES, SETTINGS], "readonly");
    const [accs, cats, txns, subs, plans, setts] = await Promise.all([
      promisify(tx.objectStore(ACCOUNTS).getAll() as IDBRequest<FinancialAccount[]>),
      promisify(tx.objectStore(CATEGORIES).getAll() as IDBRequest<TransactionCategory[]>),
      promisify(tx.objectStore(TRANSACTIONS).getAll() as IDBRequest<Transaction[]>),
      promisify(tx.objectStore(SUBSCRIPTIONS).getAll() as IDBRequest<Subscription[]>),
      promisify(tx.objectStore(PLANNED_EXPENSES).getAll() as IDBRequest<PlannedExpense[]>),
      promisify(tx.objectStore(SETTINGS).getAll() as IDBRequest<FlowStateSettings[]>),
    ]);
    for (const a of accs) this.accounts.set(a.id, a);
    for (const c of cats) this.categories.set(c.id, c);
    for (const t of txns) this.transactions.set(t.id, t);
    for (const s of subs) this.subscriptions.set(s.id, s);
    for (const p of plans) this.plannedExpenses.set(p.id, p);
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
  private async ensureCategories(_userId: string) {
    const missing = catalogCategories().filter((category) => !this.categories.has(category.id));
    if (missing.length === 0) return;

    for (const category of missing) this.categories.set(category.id, category);
    await this.enqueue(async () => {
      if (!this.db) return;
      const tx = this.db.transaction(CATEGORIES, "readwrite");
      const store = tx.objectStore(CATEGORIES);
      for (const category of missing) store.put(category);
      await txDone(tx);
    });
  }
  async listCategories(userId: string): Promise<TransactionCategory[]> {
    await this.ready();
    await this.ensureCategories(userId);
    return [...this.categories.values()]
      .filter((c) => c.is_active && (c.is_system || c.user_id === userId))
      .sort((a, b) =>
        (a.type === b.type ? 0 : a.type === "income" ? -1 : 1)
        || (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
        || (a.group || "").localeCompare(b.group || "")
        || a.name.localeCompare(b.name)
      );
  }
  async addCategory(userId: string, partial: Partial<TransactionCategory>): Promise<TransactionCategory> {
    await this.ready();
    const cat: TransactionCategory = {
      id: uid(), user_id: userId,
      name: partial.name || "Category",
      name_my: partial.name_my ?? null,
      slug: partial.slug,
      icon: partial.icon || "more",
      color: partial.color || "#9ca3af",
      type: (partial.type as "income" | "expense") || "expense",
      group: partial.group || "Custom",
      group_my: partial.group_my,
      sort_order: partial.sort_order ?? 5000,
      keywords: partial.keywords || [],
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
  /** Transactions whose local transaction date is in [from, to], newest first. */
  async listTransactions(userId: string, fromDate: string, toDate: string): Promise<Transaction[]> {
    await this.ready();
    return [...this.transactions.values()]
      .filter((t) => t.user_id === userId && isTransactionDateInRange(t.transaction_date, fromDate, toDate))
      .sort((a, b) =>
        transactionDateKey(b.transaction_date).localeCompare(transactionDateKey(a.transaction_date)) ||
        (b.occurred_at || b.created_at).localeCompare(a.occurred_at || a.created_at)
      )
      .map((t) => this.join(t));
  }
  async addTransaction(userId: string, partial: Partial<Transaction>): Promise<Transaction> {
    await this.ready();
    const capturedTime = captureDeviceTransactionTime(partial.transaction_date);
    const t: Transaction = {
      id: uid(), user_id: userId,
      account_id: partial.account_id || "",
      category_id: partial.category_id ?? null,
      type: (partial.type as Transaction["type"]) || "expense",
      amount: Number(partial.amount) || 0,
      currency: partial.currency || "MMK",
      description: partial.description ?? null,
      notes: partial.notes ?? null,
      transaction_date: capturedTime.transaction_date,
      is_recurring: partial.is_recurring || false,
      recurring_id: partial.recurring_id ?? null,
      tags: partial.tags ?? null,
      attachment_url: partial.attachment_url ?? null,
      source: partial.source ?? null,
      occurred_at: capturedTime.occurred_at,
      timezone: capturedTime.timezone,
      timezone_offset_minutes: capturedTime.timezone_offset_minutes,
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
    if (t?.type === "expense") {
      for (const plan of this.plannedExpenses.values()) {
        if (!plan.linked_transaction_ids.includes(id)) continue;
        const paidAmount = Math.max(0, plan.paid_amount - Number(t.amount || 0));
        const next = {
          ...plan,
          paid_amount: paidAmount,
          linked_transaction_ids: plan.linked_transaction_ids.filter((transactionId) => transactionId !== id),
          updated_at: nowIso(),
        };
        next.status = derivePlannedExpenseStatus(next);
        this.plannedExpenses.set(next.id, next);
        await this.put(PLANNED_EXPENSES, next);
      }
    }
  }
  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
    await this.ready();
    const existing = this.transactions.get(id);
    if (!existing) return;
    const oldDelta = existing.type === "income" ? existing.amount : -existing.amount;
    const datePatch = updates.transaction_date !== undefined
      ? captureDeviceTransactionTime(updates.transaction_date)
      : null;
    const next: Transaction = {
      ...existing,
      ...updates,
      ...(datePatch ?? {}),
      id,
      updated_at: nowIso(),
    };
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
    for (const plan of this.plannedExpenses.values()) {
      if (!plan.linked_transaction_ids.includes(id)) continue;
      const oldPaid = existing.type === "expense" ? Number(existing.amount || 0) : 0;
      const newPaid = next.type === "expense" ? Number(next.amount || 0) : 0;
      const paidAmount = Math.min(plan.amount, Math.max(0, plan.paid_amount - oldPaid + newPaid));
      const updatedPlan = { ...plan, paid_amount: paidAmount, updated_at: nowIso() };
      updatedPlan.status = derivePlannedExpenseStatus(updatedPlan);
      this.plannedExpenses.set(updatedPlan.id, updatedPlan);
      await this.put(PLANNED_EXPENSES, updatedPlan);
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

  // ── Planned expenses ─────────────────────────────────────────────────────
  async listPlannedExpenses(userId: string, fromDate: string, toDate: string): Promise<PlannedExpense[]> {
    await this.ready();
    return [...this.plannedExpenses.values()]
      .filter((item) =>
        item.user_id === userId &&
        item.due_date.slice(0, 10) >= fromDate &&
        item.due_date.slice(0, 10) <= toDate
      )
      .sort((a, b) =>
        a.due_date.localeCompare(b.due_date) ||
        Number(b.priority === "high") - Number(a.priority === "high") ||
        a.created_at.localeCompare(b.created_at)
      );
  }

  async addPlannedExpense(userId: string, partial: Partial<PlannedExpense>): Promise<PlannedExpense> {
    await this.ready();
    const timestamp = nowIso();
    const id = uid();
    const item: PlannedExpense = {
      id,
      user_id: userId,
      title: partial.title?.trim() || "Planned expense",
      amount: Math.max(0, Number(partial.amount) || 0),
      paid_amount: 0,
      currency: partial.currency || "THB",
      due_date: (partial.due_date || timestamp).slice(0, 10),
      category_id: partial.category_id ?? null,
      account_id: partial.account_id ?? null,
      subscription_id: partial.subscription_id ?? null,
      recurrence: partial.recurrence || "none",
      series_id: partial.series_id ?? (partial.recurrence && partial.recurrence !== "none" ? id : null),
      priority: partial.priority || "normal",
      status: "planned",
      notes: partial.notes?.trim() || null,
      linked_transaction_ids: [],
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.plannedExpenses.set(item.id, item);
    await this.put(PLANNED_EXPENSES, item);
    return item;
  }

  async updatePlannedExpense(id: string, updates: Partial<PlannedExpense>): Promise<PlannedExpense> {
    await this.ready();
    const existing = this.plannedExpenses.get(id);
    if (!existing) throw new Error("Planned expense not found");
    const next: PlannedExpense = {
      ...existing,
      ...updates,
      id,
      user_id: existing.user_id,
      title: updates.title?.trim() || existing.title,
      amount: updates.amount === undefined ? existing.amount : Math.max(0, Number(updates.amount) || 0),
      paid_amount: Math.min(
        updates.amount === undefined ? existing.amount : Math.max(0, Number(updates.amount) || 0),
        updates.paid_amount === undefined ? existing.paid_amount : Math.max(0, Number(updates.paid_amount) || 0),
      ),
      due_date: (updates.due_date || existing.due_date).slice(0, 10),
      notes: updates.notes === undefined ? existing.notes : updates.notes?.trim() || null,
      linked_transaction_ids: updates.linked_transaction_ids || existing.linked_transaction_ids,
      updated_at: nowIso(),
    };
    next.status = derivePlannedExpenseStatus(next);
    if (updates.status === "skipped") next.status = "skipped";
    this.plannedExpenses.set(id, next);
    await this.put(PLANNED_EXPENSES, next);
    return next;
  }

  async deletePlannedExpense(id: string): Promise<void> {
    await this.ready();
    this.plannedExpenses.delete(id);
    await this.del(PLANNED_EXPENSES, id);
  }

  async recordPlannedExpensePayment(
    id: string,
    userId: string,
    payment: { amount: number; paid_date: string; account_id?: string | null; notes?: string | null },
  ): Promise<{ plannedExpense: PlannedExpense; transaction: Transaction; nextOccurrence: PlannedExpense | null }> {
    await this.ready();
    const existing = this.plannedExpenses.get(id);
    if (!existing || existing.user_id !== userId) throw new Error("Planned expense not found");
    if (existing.status === "skipped") throw new Error("Skipped expenses cannot receive payments");

    const remaining = Math.max(0, existing.amount - existing.paid_amount);
    const paymentAmount = Math.min(remaining, Math.max(0, Number(payment.amount) || 0));
    if (paymentAmount <= 0) throw new Error("Payment amount must be greater than zero");

    const timestamp = nowIso();
    const capturedTime = captureDeviceTransactionTime(payment.paid_date);
    const accountId = payment.account_id ?? existing.account_id ?? "";
    const transaction: Transaction = {
      id: uid(),
      user_id: userId,
      account_id: accountId,
      category_id: existing.category_id,
      type: "expense",
      amount: paymentAmount,
      currency: existing.currency,
      description: existing.title,
      notes: payment.notes?.trim() || `Payment for planned expense: ${existing.title}`,
      transaction_date: capturedTime.transaction_date,
      is_recurring: existing.recurrence !== "none",
      // A subscription-linked plan points back to the subscription so overview
      // math can replace the forecast with the real payment instead of counting both.
      recurring_id: existing.subscription_id || existing.series_id,
      tags: ["planned-expense"],
      attachment_url: null,
      source: null,
      occurred_at: capturedTime.occurred_at,
      timezone: capturedTime.timezone,
      timezone_offset_minutes: capturedTime.timezone_offset_minutes,
      created_at: timestamp,
      updated_at: timestamp,
    };

    const nextPaidAmount = Math.min(existing.amount, existing.paid_amount + paymentAmount);
    const plannedExpense: PlannedExpense = {
      ...existing,
      account_id: accountId || existing.account_id,
      paid_amount: nextPaidAmount,
      linked_transaction_ids: [...existing.linked_transaction_ids, transaction.id],
      status: derivePlannedExpenseStatus({ ...existing, paid_amount: nextPaidAmount }),
      updated_at: timestamp,
    };

    let nextOccurrence: PlannedExpense | null = null;
    const nextDueDate = plannedExpense.status === "paid"
      ? nextPlannedExpenseDueDate(plannedExpense.due_date, plannedExpense.recurrence)
      : null;
    if (nextDueDate) {
      const seriesId = plannedExpense.series_id || plannedExpense.id;
      nextOccurrence = [...this.plannedExpenses.values()].find(
        (item) => item.series_id === seriesId && item.due_date === nextDueDate,
      ) || {
        ...plannedExpense,
        id: uid(),
        due_date: nextDueDate,
        paid_amount: 0,
        status: "planned",
        series_id: seriesId,
        linked_transaction_ids: [],
        created_at: timestamp,
        updated_at: timestamp,
      };
    }

    const account = accountId ? this.accounts.get(accountId) : undefined;
    const nextAccount = account ? {
      ...account,
      current_balance: Number(account.current_balance) - paymentAmount,
      updated_at: timestamp,
    } : null;

    await this.enqueue(async () => {
      if (!this.db) throw new Error("Finance database unavailable");
      const stores = [TRANSACTIONS, PLANNED_EXPENSES, ...(nextAccount ? [ACCOUNTS] : [])];
      const tx = this.db.transaction(stores, "readwrite");
      tx.objectStore(TRANSACTIONS).put(transaction);
      tx.objectStore(PLANNED_EXPENSES).put(plannedExpense);
      if (nextOccurrence) tx.objectStore(PLANNED_EXPENSES).put(nextOccurrence);
      if (nextAccount) tx.objectStore(ACCOUNTS).put(nextAccount);
      await txDone(tx);
    });

    this.transactions.set(transaction.id, transaction);
    this.plannedExpenses.set(plannedExpense.id, plannedExpense);
    if (nextOccurrence) this.plannedExpenses.set(nextOccurrence.id, nextOccurrence);
    if (nextAccount) this.accounts.set(nextAccount.id, nextAccount);
    return { plannedExpense, transaction: this.join(transaction), nextOccurrence };
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  async getSettings(userId: string): Promise<FlowStateSettings | null> {
    await this.ready();
    return this.settings.get(userId) ?? null;
  }
  // ── Backup / restore (raw dump — preserves ids, no side effects) ──────────
  async exportRaw(): Promise<{
    accounts: FinancialAccount[]; categories: TransactionCategory[];
    transactions: Transaction[]; subscriptions: Subscription[];
    plannedExpenses: PlannedExpense[]; settings: FlowStateSettings[];
  }> {
    await this.ready();
    // strip the transient join fields so the dump is canonical
    const txns = [...this.transactions.values()].map(({ category, account, ...t }) => { void category; void account; return t; });
    return {
      accounts: [...this.accounts.values()],
      categories: [...this.categories.values()],
      transactions: txns,
      subscriptions: [...this.subscriptions.values()],
      plannedExpenses: [...this.plannedExpenses.values()],
      settings: [...this.settings.values()],
    };
  }

  async importRaw(data: {
    accounts?: FinancialAccount[]; categories?: TransactionCategory[];
    transactions?: Transaction[]; subscriptions?: Subscription[];
    plannedExpenses?: PlannedExpense[]; settings?: FlowStateSettings[];
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
    await replace(PLANNED_EXPENSES, this.plannedExpenses, data.plannedExpenses, (r) => r.id);
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
