// ═══ BeeBot Agentic Era — Autonomy + World Model + Reflection ═══
// Tool executors for proactive triggers, world model entities/relations, lessons.

import { generateEmbedding } from "../executor-helpers.ts";

function canonicalize(s: string): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, "_").slice(0, 120);
}

// ────────────────────────────────────────────────────────────
// TOOL: manage_proactive_trigger
// ────────────────────────────────────────────────────────────
export async function executeManageProactiveTrigger(supabase: any, userId: string, args: any) {
  const action = args.action;
  if (!action) return { error: "action is required" };

  try {
    if (action === "create") {
      const { name, description, trigger_type = "schedule", schedule_cron, schedule_tz = "Asia/Yangon", condition = {}, action_prompt } = args;
      if (!name || !action_prompt) return { error: "name and action_prompt are required" };
      if (trigger_type === "schedule" && !schedule_cron) return { error: "schedule_cron required for schedule trigger" };
      const { data, error } = await supabase.from("beebot_proactive_triggers")
        .insert({ user_id: userId, name, description, trigger_type, schedule_cron, schedule_tz, condition, action_prompt })
        .select().single();
      if (error) return { error: error.message };
      return { success: true, trigger: data, message: `Proactive trigger '${name}' created.` };
    }

    if (action === "list") {
      const { data, error } = await supabase.from("beebot_proactive_triggers")
        .select("id, name, description, trigger_type, schedule_cron, is_active, last_fired_at, fire_count, failure_count")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      if (error) return { error: error.message };
      return { success: true, triggers: data || [], count: (data || []).length };
    }

    if (action === "toggle") {
      if (!args.trigger_id) return { error: "trigger_id required" };
      const { data: cur } = await supabase.from("beebot_proactive_triggers").select("is_active").eq("id", args.trigger_id).eq("user_id", userId).single();
      if (!cur) return { error: "trigger not found" };
      const { data, error } = await supabase.from("beebot_proactive_triggers")
        .update({ is_active: !cur.is_active }).eq("id", args.trigger_id).eq("user_id", userId).select().single();
      if (error) return { error: error.message };
      return { success: true, trigger: data, message: `Trigger ${data.is_active ? "activated" : "paused"}.` };
    }

    if (action === "delete") {
      if (!args.trigger_id) return { error: "trigger_id required" };
      const { error } = await supabase.from("beebot_proactive_triggers")
        .delete().eq("id", args.trigger_id).eq("user_id", userId);
      if (error) return { error: error.message };
      return { success: true, message: "Trigger deleted." };
    }

    return { error: `Unknown action: ${action}` };
  } catch (e: any) {
    return { error: `manage_proactive_trigger failed: ${e?.message || e}` };
  }
}

// ────────────────────────────────────────────────────────────
// TOOL: manage_world_entity
// ────────────────────────────────────────────────────────────
export async function executeManageWorldEntity(supabase: any, userId: string, args: any) {
  const action = args.action;
  if (!action) return { error: "action is required" };

  try {
    if (action === "upsert") {
      const { entity_type, name, description, attrs = {}, importance = 0.5 } = args;
      if (!entity_type || !name) return { error: "entity_type and name required" };
      const canonical_key = args.canonical_key || canonicalize(name);
      let embedding: number[] | null = null;
      try { embedding = await generateEmbedding(`${entity_type}: ${name}. ${description || ""}`); } catch {}
      const { data, error } = await supabase.rpc("beebot_upsert_entity", {
        p_user_id: userId, p_type: entity_type, p_name: name, p_canonical_key: canonical_key,
        p_attrs: attrs, p_description: description ?? null,
        p_importance: importance, p_embedding: embedding,
      });
      if (error) return { error: error.message };
      return { success: true, entity_id: data, message: `Entity '${name}' saved.` };
    }

    if (action === "link") {
      const { from_entity_id, to_entity_id, relation_type, strength = 0.6, evidence = {} } = args;
      if (!from_entity_id || !to_entity_id || !relation_type) return { error: "from_entity_id, to_entity_id, relation_type required" };
      const { data, error } = await supabase.from("beebot_relations")
        .upsert({ user_id: userId, from_entity: from_entity_id, to_entity: to_entity_id, relation_type, strength, evidence },
          { onConflict: "user_id,from_entity,to_entity,relation_type" })
        .select().single();
      if (error) return { error: error.message };
      return { success: true, relation: data };
    }

    if (action === "list") {
      const q = supabase.from("beebot_entities")
        .select("id, entity_type, name, description, importance, mention_count, last_mentioned_at")
        .eq("user_id", userId);
      if (args.entity_type) q.eq("entity_type", args.entity_type);
      const { data, error } = await q.order("importance", { ascending: false }).limit(args.limit || 30);
      if (error) return { error: error.message };
      return { success: true, entities: data || [], count: (data || []).length };
    }

    if (action === "graph") {
      if (!args.entity_id) return { error: "entity_id required" };
      const { data, error } = await supabase.rpc("beebot_query_world_model", {
        p_user_id: userId, p_entity_id: args.entity_id, p_depth: Math.min(args.depth || 1, 3),
      });
      if (error) return { error: error.message };
      return { success: true, graph: data };
    }

    if (action === "delete") {
      if (!args.entity_id) return { error: "entity_id required" };
      const { error } = await supabase.from("beebot_entities").delete().eq("id", args.entity_id).eq("user_id", userId);
      if (error) return { error: error.message };
      return { success: true, message: "Entity deleted (relations cascaded)." };
    }

    return { error: `Unknown action: ${action}` };
  } catch (e: any) {
    return { error: `manage_world_entity failed: ${e?.message || e}` };
  }
}

// ────────────────────────────────────────────────────────────
// TOOL: manage_lesson
// ────────────────────────────────────────────────────────────
export async function executeManageLesson(supabase: any, userId: string, args: any) {
  const action = args.action;
  if (!action) return { error: "action is required" };

  try {
    if (action === "add") {
      const { lesson_text, category, confidence = 0.6, evidence_trajectory_ids = [] } = args;
      if (!lesson_text) return { error: "lesson_text required" };
      let embedding: number[] | null = null;
      try { embedding = await generateEmbedding(lesson_text); } catch {}
      const { data, error } = await supabase.from("beebot_lessons")
        .insert({ user_id: userId, lesson_text, category, confidence, evidence_trajectory_ids, embedding })
        .select().single();
      if (error) return { error: error.message };
      return { success: true, lesson: data, message: "Lesson stored." };
    }

    if (action === "recall") {
      const { query, limit = 5, min_confidence = 0.4 } = args;
      if (!query) return { error: "query required" };
      let qEmb: number[] | null = null;
      try { qEmb = await generateEmbedding(query); } catch {}
      if (!qEmb) return { success: true, lessons: [], note: "embedding_failed" };
      const { data, error } = await supabase.rpc("beebot_recall_lessons", {
        p_user_id: userId, p_query_embedding: qEmb, p_limit: Math.min(limit, 20), p_min_confidence: min_confidence,
      });
      if (error) return { error: error.message };
      return { success: true, lessons: data || [], count: (data || []).length };
    }

    if (action === "list") {
      const { data, error } = await supabase.from("beebot_lessons")
        .select("id, lesson_text, category, confidence, applied_count, helpful_count, is_active, created_at")
        .eq("user_id", userId).eq("is_active", true)
        .order("confidence", { ascending: false }).limit(args.limit || 30);
      if (error) return { error: error.message };
      return { success: true, lessons: data || [], count: (data || []).length };
    }

    if (action === "deactivate") {
      if (!args.lesson_id) return { error: "lesson_id required" };
      const { error } = await supabase.from("beebot_lessons")
        .update({ is_active: false }).eq("id", args.lesson_id).eq("user_id", userId);
      if (error) return { error: error.message };
      return { success: true, message: "Lesson deactivated." };
    }

    return { error: `Unknown action: ${action}` };
  } catch (e: any) {
    return { error: `manage_lesson failed: ${e?.message || e}` };
  }
}
