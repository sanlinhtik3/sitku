// ═══ PHASE D: SHARED SCRATCHPAD (Code-Split Module) ═══
// Persistent scratchpad for cross-specialist knowledge sharing during swarm execution.
// Unlike PeerChannel (in-memory, lost after swarm), scratchpad persists to DB.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ScratchpadEntry {
  specialistRole: string;
  stepId: string;
  findings: string;
  metadata?: Record<string, unknown>;
}

// Write specialist findings to persistent scratchpad (accepts existing client)
export async function writeScratchpad(
  client: SupabaseClient,
  swarmId: string,
  role: string,
  stepId: string,
  findings: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await client.from("agent_swarm_scratchpad").insert({
      swarm_id: swarmId,
      specialist_role: role,
      step_id: stepId,
      findings: findings.slice(0, 50_000),
      metadata: metadata || {},
    });
    console.log(`[Scratchpad] ${role} wrote ${findings.length} chars for swarm ${swarmId.slice(0, 8)}`);
  } catch (e) {
    console.warn(`[Scratchpad] Write failed:`, e);
  }
}

// Read all scratchpad entries for a swarm
export async function readScratchpad(client: SupabaseClient, swarmId: string): Promise<ScratchpadEntry[]> {
  try {
    const { data } = await client
      .from("agent_swarm_scratchpad")
      .select("specialist_role, step_id, findings, metadata")
      .eq("swarm_id", swarmId)
      .order("created_at", { ascending: true });

    return (data || []).map((d: any) => ({
      specialistRole: d.specialist_role,
      stepId: d.step_id,
      findings: d.findings,
      metadata: d.metadata,
    }));
  } catch (e) {
    console.warn(`[Scratchpad] Read failed:`, e);
    return [];
  }
}

// Build synthesis prompt from scratchpad entries
export function buildScratchpadSynthesisPrompt(entries: ScratchpadEntry[]): string {
  if (entries.length === 0) return '';
  
  const sections = entries.map(e => {
    return `### ${e.specialistRole} (Step: ${e.stepId})\n${e.findings.slice(0, 8000)}`;
  });

  return `\n\n═══ SCRATCHPAD: Cross-Specialist Findings ═══\n${sections.join('\n\n---\n\n')}\n\n═══ END SCRATCHPAD ═══\n\nSYNTHESIS INSTRUCTIONS: Cross-reference ALL specialist findings above. Flag contradictions. Incorporate every specialist's key data points.`;
}

// ═══ TYPED SCRATCHPAD — Enhanced entries with type + priority ═══
export type ScratchpadEntryType = 'finding' | 'question' | 'decision' | 'conflict';
export type ScratchpadPriority = 'normal' | 'critical';

export interface TypedScratchpadEntry extends ScratchpadEntry {
  entryType: ScratchpadEntryType;
  priority: ScratchpadPriority;
}

// Write typed scratchpad entry with priority flags
export async function writeScratchpadTyped(
  client: SupabaseClient,
  swarmId: string,
  role: string,
  stepId: string,
  findings: string,
  entryType: ScratchpadEntryType = 'finding',
  priority: ScratchpadPriority = 'normal',
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await client.from("agent_swarm_scratchpad").insert({
      swarm_id: swarmId,
      specialist_role: role,
      step_id: stepId,
      findings: findings.slice(0, 50_000),
      metadata: { ...(metadata || {}), entry_type: entryType, priority },
    });
    const tag = priority === 'critical' ? '🔴' : '📝';
    console.log(`[Scratchpad] ${tag} ${role} wrote ${entryType} (${priority}) — ${findings.length} chars`);
  } catch (e) {
    console.warn(`[Scratchpad] Typed write failed:`, e);
  }
}

// Find conflicts — entries from different specialists on same topic with contradictory content
export function findConflicts(entries: ScratchpadEntry[]): Array<{ specialist1: string; specialist2: string; topic: string }> {
  const conflicts: Array<{ specialist1: string; specialist2: string; topic: string }> = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (a.specialistRole === b.specialistRole) continue;
      // Check for contradiction markers
      const aLower = a.findings.toLowerCase();
      const bLower = b.findings.toLowerCase();
      const contradictionPatterns = ['however', 'contradicts', 'disagree', 'conflict', 'on the other hand', '⚠️ Conflict'];
      const hasConflict = contradictionPatterns.some(p => aLower.includes(p) || bLower.includes(p));
      if (hasConflict) {
        conflicts.push({ specialist1: a.specialistRole, specialist2: b.specialistRole, topic: a.stepId });
      }
    }
  }
  return conflicts;
}

// Get critical findings only
export function getCriticalFindings(entries: ScratchpadEntry[]): ScratchpadEntry[] {
  return entries.filter(e => (e.metadata as any)?.priority === 'critical');
}

// Cleanup old scratchpad entries (accepts existing client)
export async function cleanupOldScratchpads(client: SupabaseClient, maxAgeDays: number = 7): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await client
      .from("agent_swarm_scratchpad")
      .select("id")
      .lt("created_at", cutoff);
    
    if (data && data.length > 0) {
      const ids = data.map((d: any) => d.id);
      for (let i = 0; i < ids.length; i += 100) {
        await client
          .from("agent_swarm_scratchpad")
          .delete()
          .in("id", ids.slice(i, i + 100));
      }
      return ids.length;
    }
    return 0;
  } catch (e) {
    console.warn(`[Scratchpad] Cleanup failed:`, e);
    return 0;
  }
}
