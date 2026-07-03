
// ═══ Project Phoenix: _shared/tool-executors/network.ts ═══
// Inter-agent communication tools

import { logAgentCommunication, enrichAgentIdentities, sanitizeForSharing, containsPrivateData } from "../executor-helpers.ts";
import { decayConfidence } from "../personality-config.ts";

export async function executeQueryAgentNetwork(supabase: any, userId: string, args: any) {
  const { topic, query, priority = "medium" } = args;
  
  if (!topic || !query) return { error: "topic and query required" };
  
  // Create conversation record
  const conversationId = crypto.randomUUID();
  
  await supabase.from("agent_conversations").insert({
    conversation_id: conversationId,
    sender_agent_id: userId,
    receiver_agent_id: null, // Broadcast
    message_type: "query",
    message_content: query,
    priority,
    context: { topic, type: "broadcast_query" }
  });
  
  await logAgentCommunication(supabase, userId, "broadcast", "fact_check", query);
  
  return { success: true, message: "Query broadcasted", conversation_id: conversationId };
}

export async function executeShareToAgentNetwork(supabase: any, userId: string, args: any) {
  const { topic, insight, confidence = 0.8 } = args;
  
  if (containsPrivateData(JSON.stringify(insight))) {
    return { error: "Privacy violation: Insight contains sensitive data" };
  }
  
  await supabase.from("agent_shared_insights").insert({
    source_agent_id: userId, topic, content: sanitizeForSharing(insight), confidence_score: confidence, insight_type: "general"
  });
  
  // ═══ INSIGHT DECAY: Probabilistic cleanup (5% of calls) ═══
  if (Math.random() < 0.05) {
    try {
      // 1. Apply daily decay: reduce confidence by 0.05/day for insights older than 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: staleInsights } = await supabase
        .from("agent_shared_insights")
        .select("id, confidence_score, created_at")
        .lt("created_at", threeDaysAgo)
        .gt("confidence_score", 0.3);
      
      if (staleInsights && staleInsights.length > 0) {
        const batch = staleInsights.slice(0, 20);
        await Promise.all(batch.map((ins: any) => {
          const decayedScore = decayConfidence(ins.confidence_score || 0.8, ins.created_at);
          return supabase.from("agent_shared_insights").update({ confidence_score: decayedScore }).eq("id", ins.id);
        }));
        console.log(`[InsightDecay] Decayed ${batch.length} stale insights (batched)`);
      }
      
      // 2. Auto-prune insights below 0.3 confidence
      await supabase.from("agent_shared_insights").delete().lt("confidence_score", 0.3);
    } catch (e) { console.warn("[InsightDecay] Cleanup error:", e); }
  }
  
  return { success: true, message: "Insight shared" };
}

export async function executeAskOtherAgents(supabase: any, userId: string, args: any) {
  return executeQueryAgentNetwork(supabase, userId, args); // Alias
}

export async function executeRespondToAgentQuery(supabase: any, userId: string, args: any) {
  const { query_id, response } = args;
  
  const { data: original } = await supabase.from("agent_conversations").select("*").eq("id", query_id).single();
  if (!original) return { error: "Query not found" };
  
  await supabase.from("agent_conversations").insert({
    conversation_id: original.conversation_id,
    sender_agent_id: userId,
    receiver_agent_id: original.sender_agent_id,
    message_type: "response",
    message_content: response,
    response_to: query_id
  });
  
  await supabase.from("agent_conversations").update({ is_read: true }).eq("id", query_id);
  
  return { success: true, message: "Response sent" };
}

export async function executeCheckAgentMessages(supabase: any, userId: string, args: any) {
  const { unread_only = true, limit = 10, aggregate = false } = args;
  
  let query = supabase.from("agent_conversations")
    .select("*")
    .or(`receiver_agent_id.eq.${userId},receiver_agent_id.is.null`)
    .neq("sender_agent_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
    
  if (unread_only) query = query.eq("is_read", false);
  
  const { data: messages } = await query;
  
  // Enrich identities
  const senderIds = messages?.map((m: any) => m.sender_agent_id) || [];
  const identities = await enrichAgentIdentities(supabase, senderIds);
  
  const enriched = messages?.map((m: any) => {
    const id = identities.find(i => i.user_id === m.sender_agent_id);
    return {
      ...m,
      sender_name: id ? id.display_name : "Unknown Agent"
    };
  }) || [];

  // ═══ SMART RESPONSE AGGREGATION: Group by topic, rank by confidence ═══
  if (aggregate && enriched.length > 1) {
    const topicGroups: Record<string, any[]> = {};
    for (const msg of enriched) {
      const topic = msg.context?.topic || 'general';
      if (!topicGroups[topic]) topicGroups[topic] = [];
      topicGroups[topic].push(msg);
    }
    
    const aggregated = Object.entries(topicGroups).map(([topic, msgs]) => ({
      topic,
      message_count: msgs.length,
      latest: msgs[0],
      senders: [...new Set(msgs.map(m => m.sender_name))],
      summary: msgs.map(m => m.message_content).join(' | ').slice(0, 500),
    }));
    
    return { success: true, messages: enriched, aggregated, grouped_count: Object.keys(topicGroups).length };
  }
  
  return { success: true, messages: enriched };
}
