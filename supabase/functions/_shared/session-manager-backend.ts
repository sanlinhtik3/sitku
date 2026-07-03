// ═══ Session Manager Module (Backend) ═══
// Extracted from agent-chat/index.ts — handles context window & history cleaning.
// Phase 3B: Conversation History Windowing with summary compression.

// ═══ PROJECT NIGHTINGALE: SESSION MANAGER MODULE ═══
export const SessionManager = {
  /**
   * Dynamic Context Window with Phase 3B Windowing:
   * - Last 6 messages: verbatim
   * - Messages 7-20: summarized (if summarizer available)
   * - Messages 20+: dropped (episodic memory covers this)
   */
  async getContext(supabase: any, sessionId: string, isSimple: boolean, isGroup?: boolean): Promise<any[]> {
    // Phase 3B: Tighter windows — 6 recent for complex, 8 for simple/group
    const MAX_RECENT = isGroup ? 12 : (isSimple ? 8 : 20);
    const MAX_IMPORTANT_OLD = isGroup ? 0 : (isSimple ? 0 : 5);
    const VERBATIM_WINDOW = 6; // Last 6 messages always verbatim

    // 1. Fetch most recent N messages (descending, then reverse)
    const { data: recentDesc } = await supabase
      .from("agent_chat_messages")
      .select("id, role, content, tool_calls, tool_results, created_at, source_channel")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(MAX_RECENT);

    const recentMessages = recentDesc?.reverse() || [];

    // Phase 3B: If we have more than VERBATIM_WINDOW messages and not simple,
    // compress older messages (7-20 range) into shorter representations
    if (!isSimple && recentMessages.length > VERBATIM_WINDOW) {
      const verbatimMessages = recentMessages.slice(-VERBATIM_WINDOW);
      const olderMessages = recentMessages.slice(0, -VERBATIM_WINDOW);

      // Compress older messages: keep role and truncate content
      const compressedOlder = olderMessages.map((msg: any) => {
        if (msg.role === "assistant" && msg.content && msg.content.length > 300) {
          return {
            ...msg,
            content: msg.content.slice(0, 300) + "... [compressed]",
            tool_calls: undefined, // Drop tool details from older context
            tool_results: undefined,
          };
        }
        if (msg.role === "user" && msg.content && msg.content.length > 200) {
          return {
            ...msg,
            content: msg.content.slice(0, 200) + "... [compressed]",
          };
        }
        // Tool messages older than verbatim window — drop entirely
        if (msg.role === "tool") return null;
        return msg;
      }).filter(Boolean);

      const merged = [...compressedOlder, ...verbatimMessages];
      console.log(`[SessionManager] Phase 3B windowing: ${verbatimMessages.length} verbatim + ${compressedOlder.length} compressed = ${merged.length} total (from ${recentMessages.length})`);

      // Still fetch important old messages for complex queries
      if (MAX_IMPORTANT_OLD > 0 && recentMessages.length >= MAX_RECENT) {
        const oldestRecentTimestamp = recentMessages[0]?.created_at;
        if (oldestRecentTimestamp) {
          const { data: oldWithTools } = await supabase
            .from("agent_chat_messages")
            .select("id, role, content, tool_calls, tool_results, created_at")
            .eq("session_id", sessionId)
            .lt("created_at", oldestRecentTimestamp)
            .not("tool_calls", "is", null)
            .order("created_at", { ascending: false })
            .limit(3); // Reduced from 5 to 3

          if (oldWithTools && oldWithTools.length > 0) {
            const allIds = new Set(merged.map((m: any) => m.id));
            const uniqueOld = oldWithTools
              .filter((m: any) => !allIds.has(m.id))
              .map((m: any) => ({
                ...m,
                content: (m.content || "").slice(0, 200) + (m.content?.length > 200 ? "... [compressed]" : ""),
              }))
              .reverse();
            const finalMerged = [...uniqueOld, ...merged];
            finalMerged.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            console.log(`[SessionManager] + ${uniqueOld.length} important old = ${finalMerged.length} total`);
            return finalMerged;
          }
        }
      }

      return merged;
    }

    // 2. For non-simple messages, fetch important older messages beyond the window
    if (MAX_IMPORTANT_OLD > 0 && recentMessages.length >= MAX_RECENT) {
      const oldestRecentTimestamp = recentMessages[0]?.created_at;
      if (oldestRecentTimestamp) {
        const { data: oldWithTools } = await supabase
          .from("agent_chat_messages")
          .select("id, role, content, tool_calls, tool_results, created_at")
          .eq("session_id", sessionId)
          .lt("created_at", oldestRecentTimestamp)
          .not("tool_calls", "is", null)
          .order("created_at", { ascending: false })
          .limit(5);

        const { data: oldUserMessages } = await supabase
          .from("agent_chat_messages")
          .select("id, role, content, tool_calls, tool_results, created_at")
          .eq("session_id", sessionId)
          .lt("created_at", oldestRecentTimestamp)
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(10);

        // Client-side: filter for genuinely long content (200+ chars)
        const longMessages = (oldUserMessages || []).filter((m: any) => (m.content || "").length > 200);
        const allImportant = [...(oldWithTools || []), ...longMessages];

        // Deduplicate by id, sort by recency, take top MAX_IMPORTANT_OLD
        const uniqueMap = new Map();
        for (const m of allImportant) {
          if (!uniqueMap.has(m.id)) uniqueMap.set(m.id, m);
        }
        const importantOld = [...uniqueMap.values()]
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, MAX_IMPORTANT_OLD);

        if (importantOld.length > 0) {
          const allIds = new Set(recentMessages.map((m: any) => m.id));
          const uniqueOld = importantOld.filter((m: any) => !allIds.has(m.id)).reverse();
          const merged = [...uniqueOld, ...recentMessages];
          merged.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          console.log(`[SessionManager] Context: ${recentMessages.length} recent + ${uniqueOld.length} important old = ${merged.length} total`);
          return merged;
        }
      }
    }

    console.log(`[SessionManager] Context: ${recentMessages.length} recent messages`);
    return recentMessages;
  },

  /**
   * State Cleaning: Truncates old tool results to prevent context contamination
   * Keeps the last 4 messages intact, truncates older tool outputs
   */
  cleanToolResidue(messages: any[]): any[] {
    if (messages.length <= 4) return messages;

    const cleanedMessages = messages.map((msg: any, index: number) => {
      // Keep the last 4 messages fully intact
      if (index >= messages.length - 4) return msg;

      // Truncate old tool results
      if (msg.tool_results && Array.isArray(msg.tool_results) && msg.tool_results.length > 0) {
        const cleanedMsg = { ...msg };
        cleanedMsg.tool_results = msg.tool_results.map((tr: any) => {
          const trStr = typeof tr === 'string' ? tr : JSON.stringify(tr);
          if (trStr.length > 200) {
            return trStr.slice(0, 200) + "...[truncated]";
          }
          return tr;
        });
        return cleanedMsg;
      }

      return msg;
    });

    return cleanedMessages;
  },
};

// ═══ TEMPORAL HELPERS ═══
function formatElapsed(ms: number): string {
  if (ms < 60_000) return `+${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `+${Math.round(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return m > 0 ? `+${h}h${m}m` : `+${h}h`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    // Myanmar timezone UTC+6:30
    const mm = new Date(d.getTime() + 6.5 * 3_600_000);
    const hh = String(mm.getUTCHours()).padStart(2, '0');
    const mi = String(mm.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mi}`;
  } catch { return ''; }
}

// ═══ BUILD CONVERSATION HISTORY WITH TOOL CALLS (OpenAI Format) ═══
export function buildConversationHistory(history: any[]): any[] {
  const messages: any[] = [];
  let lastUserTs: number | null = null;
  
  for (const msg of history) {
    if (msg.role === "user") {
      let content = msg.content || "";
      // Inject temporal marker for user messages
      if (msg.created_at) {
        const ts = new Date(msg.created_at).getTime();
        const timeStr = formatTime(msg.created_at);
        if (lastUserTs !== null) {
          const elapsed = ts - lastUserTs;
          if (elapsed > 0) {
            content = `[⏱️ ${timeStr}, ${formatElapsed(elapsed)}] ${content}`;
          } else {
            content = `[⏱️ ${timeStr}] ${content}`;
          }
        } else {
          content = `[⏱️ ${timeStr}] ${content}`;
        }
        lastUserTs = ts;
      }
      messages.push({ role: "user", content });
    } else if (msg.role === "assistant") {
      const assistantMsg: any = { 
        role: "assistant", 
        content: msg.content || "" 
      };
      
      // Include tool calls if present (for Gemini/OpenAI format compatibility)
      if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        assistantMsg.tool_calls = msg.tool_calls.map((tc: any, idx: number) => ({
          id: tc.id || `call_hist_${msg.id || idx}_${idx}`,
          type: "function",
          function: {
            name: tc.name || tc.function?.name || "unknown",
            arguments: typeof tc.arguments === 'string' 
              ? tc.arguments 
              : JSON.stringify(tc.arguments || tc.function?.arguments || {}),
          },
        }));
      }
      
      messages.push(assistantMsg);
      
      // Add tool results as tool messages immediately after assistant message
      if (msg.tool_results && Array.isArray(msg.tool_results) && msg.tool_results.length > 0) {
        for (let i = 0; i < msg.tool_results.length; i++) {
          const tr = msg.tool_results[i];
          const toolCallId = msg.tool_calls?.[i]?.id || `call_hist_${msg.id || ''}_${i}`;
          
          messages.push({
            role: "tool",
            tool_call_id: toolCallId,
            name: tr.name || msg.tool_calls?.[i]?.name || msg.tool_calls?.[i]?.function?.name || "unknown_tool",
            content: typeof tr === 'string' 
              ? tr 
              : JSON.stringify(tr.error ? { error: tr.error } : (tr.result || tr)),
          });
        }
      }
    } else if (msg.role === "tool") {
      messages.push({
        role: "tool",
        tool_call_id: msg.tool_call_id || `call_orphan_${msg.id || 'unknown'}`,
        name: msg.name || msg.tool_name || "unknown_tool",
        content: msg.content || "",
      });
    }
  }
  
  return messages;
}
