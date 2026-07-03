// ═══════════════════════════════════════════════════════════════════════════
// Subagent Memory Helpers — Phase 2.8 of docs/AGENTIC_AUDIT.md
//
// Read / write the `agent_subagent_memories` table. Scope: (user_id,
// subagent_name). 25 KB hard cap enforced by DB CHECK constraint.
// ═══════════════════════════════════════════════════════════════════════════

export interface SubagentMemoryEntry {
  memory_key: string;
  value_json: any;
  expires_at?: string | null;
}

const MAX_BYTES = 25_000;

/**
 * Read all memory rows for one (user, subagent). Returns key → value map.
 * Filters out expired entries.
 */
export async function readSubagentMemory(
  serviceClient: any,
  userId: string,
  subagentName: string,
): Promise<Record<string, any>> {
  const { data, error } = await serviceClient
    .from("agent_subagent_memories")
    .select("memory_key, value_json, expires_at")
    .eq("user_id", userId)
    .eq("subagent_name", subagentName);

  if (error) {
    console.warn(`[subagent-memory] read failed for ${subagentName}: ${error.message}`);
    return {};
  }

  const now = Date.now();
  const out: Record<string, any> = {};
  for (const row of data ?? []) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
    out[row.memory_key] = row.value_json;
  }
  return out;
}

/**
 * Upsert one memory entry. Caller is responsible for keeping value JSON
 * ≤ 25 KB; the DB constraint will reject anything larger.
 */
export async function writeSubagentMemory(
  serviceClient: any,
  userId: string,
  subagentName: string,
  entry: SubagentMemoryEntry,
): Promise<{ ok: boolean; error?: string }> {
  const serialized = JSON.stringify(entry.value_json ?? null);
  if (serialized.length > MAX_BYTES) {
    return { ok: false, error: `value_json exceeds ${MAX_BYTES} bytes` };
  }

  const { error } = await serviceClient
    .from("agent_subagent_memories")
    .upsert({
      user_id: userId,
      subagent_name: subagentName,
      memory_key: entry.memory_key,
      value_json: entry.value_json,
      expires_at: entry.expires_at ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,subagent_name,memory_key" });

  if (error) {
    console.warn(`[subagent-memory] write failed for ${subagentName}.${entry.memory_key}: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Convenience: read one key, default to null. */
export async function readSubagentMemoryKey(
  serviceClient: any,
  userId: string,
  subagentName: string,
  key: string,
): Promise<any> {
  const all = await readSubagentMemory(serviceClient, userId, subagentName);
  return all[key] ?? null;
}
