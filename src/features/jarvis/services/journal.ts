import type { VoiceTurnJournal } from "../core/engine";

const FALLBACK_STORE = "beebot-jarvis-turn-journal";
type StoredTurn = Record<string, unknown> & { turnId: string; idempotencyKey?: string; actionClaimed?: boolean };

function loadFallback(): StoredTurn[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_STORE) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFallback(turns: StoredTurn[]) {
  try { localStorage.setItem(FALLBACK_STORE, JSON.stringify(turns.slice(0, 100))); }
  catch { /* The browser fallback must not block voice; desktop uses SQLite. */ }
}

export function createVoiceTurnJournal(): VoiceTurnJournal {
  const desktop = typeof window !== "undefined" ? window.beebotLocalRuntime?.jarvis : undefined;
  if (desktop) {
    return {
      begin: (input) => desktop.begin(input),
      update: (input) => desktop.update(input),
      claimAction: (input) => desktop.claimAction(input),
      listRecent: (limit) => desktop.listRecent(limit) as ReturnType<NonNullable<VoiceTurnJournal["listRecent"]>>,
    };
  }

  return {
    async begin(input) {
      const turns = loadFallback().filter((turn) => turn.turnId !== input.turnId);
      turns.unshift({ ...input, turnId: input.turnId, updatedAt: input.startedAt });
      saveFallback(turns);
    },
    async update(input) {
      const turns = loadFallback();
      const index = turns.findIndex((turn) => turn.turnId === input.turnId);
      if (index < 0) return;
      turns[index] = { ...turns[index], ...input, updatedAt: new Date().toISOString() };
      saveFallback(turns);
    },
    async claimAction(input) {
      const turns = loadFallback();
      const duplicate = turns.find((turn) => turn.idempotencyKey === input.idempotencyKey && turn.actionClaimed);
      if (duplicate) return { claimed: false, result: String(duplicate.result || "") || undefined, reply: String(duplicate.reply || "") || undefined };
      const index = turns.findIndex((turn) => turn.turnId === input.turnId);
      if (index < 0) throw new Error("Jarvis turn not found");
      turns[index] = { ...turns[index], ...input, actionClaimed: true, status: "running", updatedAt: new Date().toISOString() };
      saveFallback(turns);
      return { claimed: true };
    },
    async listRecent(limit = 50) {
      return loadFallback().slice(0, Math.max(1, Math.min(200, limit))) as unknown as Awaited<ReturnType<NonNullable<VoiceTurnJournal["listRecent"]>>>;
    },
  };
}
