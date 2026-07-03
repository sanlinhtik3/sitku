// Phase 3: portable standards/export bridge for BeeBot Agentic Era data.
// Read-only by default; returns compact JSON/JSONL payloads that can be used
// for audits, skill portability, and research/eval pipelines.

function toJsonl(rows: any[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

function buildPortableSkill(skill: any) {
  return {
    schema: skill.standard_format || "beebot.skill.v1",
    name: skill.skill_name,
    description: skill.description || "",
    triggers: skill.trigger_keywords || [],
    input_schema: skill.input_schema || {},
    steps: skill.execution_steps || [],
    output_format: skill.output_format || null,
    version: skill.version || 1,
    source_url: skill.source_url || null,
  };
}

export async function executeExportAgenticData(supabase: any, userId: string, args: any) {
  const exportType = String(args?.export_type || "overview");
  const format = String(args?.format || "json");
  const limit = Math.max(1, Math.min(500, Number(args?.limit) || 100));

  if (exportType === "skills") {
    const { data, error } = await supabase
      .from("agent_custom_skills")
      .select("skill_name, description, trigger_keywords, execution_steps, input_schema, output_format, version, standard_format, source_url, portable_manifest, updated_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) return { error: error.message };
    const skills = (data || []).map((s: any) => ({
      ...buildPortableSkill(s),
      manifest: s.portable_manifest && Object.keys(s.portable_manifest).length ? s.portable_manifest : buildPortableSkill(s),
    }));
    return { success: true, export_type: "skills", format, count: skills.length, payload: format === "jsonl" ? toJsonl(skills) : skills };
  }

  if (exportType === "trajectories") {
    const { data, error } = await supabase
      .from("beebot_trajectories")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { error: error.message };
    const trajectories = (data || []).map((t: any) => ({
      id: t.id,
      trigger_id: t.trigger_id || null,
      status: t.status,
      objective: t.objective || t.prompt || null,
      outcome: t.outcome || t.result || null,
      score: t.score || null,
      started_at: t.started_at || t.created_at,
      completed_at: t.completed_at || null,
      metadata: t.metadata || {},
    }));
    return { success: true, export_type: "trajectories", format, count: trajectories.length, payload: format === "jsonl" ? toJsonl(trajectories) : trajectories };
  }

  if (exportType === "memory_map") {
    const { data, error } = await supabase
      .from("user_memories")
      .select("content, category, confidence, pinned, priority, scope, scope_key, source_platform, created_at, last_accessed")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(limit);
    if (error) return { error: error.message };
    return { success: true, export_type: "memory_map", format, count: data?.length || 0, payload: format === "jsonl" ? toJsonl(data || []) : data || [] };
  }

  if (exportType === "mcp_manifest") {
    const { data: settings } = await supabase
      .from("user_agent_settings")
      .select("mcp_postgres_enabled, pge_pipeline_enabled, agentic_sdk_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      success: true,
      export_type: "mcp_manifest",
      payload: {
        schema: "beebot.mcp.manifest.v1",
        tools: ["search_knowledge_base", "recall_session_history", "export_agentic_data"],
        transports: {
          postgres_mcp: !!settings?.mcp_postgres_enabled,
          beebot_http_sse: true,
        },
        feature_flags: settings || {},
      },
    };
  }

  return {
    success: true,
    export_type: "overview",
    payload: {
      available_exports: ["skills", "trajectories", "memory_map", "mcp_manifest"],
      formats: ["json", "jsonl"],
    },
  };
}
