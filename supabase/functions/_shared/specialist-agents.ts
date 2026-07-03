// ═══ Phase 4: Specialist Agent System ═══
// Role-specialized agents with dedicated system prompts and inter-agent delegation.
// Phase D: Shared Scratchpad for persistent cross-specialist knowledge sharing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AgentRole = 'researcher' | 'analyst' | 'writer' | 'coder' | 'general' | 'strategist' | 'editor' | 'community';

export interface SpecialistConfig {
  role: AgentRole;
  label: string;
  emoji: string;
  systemPrompt: string;
  temperature: number;
  maxOutputTokens: number;
  preferredModel?: string;
}

// ═══ Specialist Definitions ═══
export const SPECIALIST_AGENTS: Record<AgentRole, SpecialistConfig> = {
  researcher: {
    role: 'researcher',
    label: 'Research Agent',
    emoji: '🔍',
    temperature: 0.3,
    maxOutputTokens: 4096,
    systemPrompt: `You are a specialized RESEARCH AGENT within a multi-agent system.

YOUR ROLE: Gather, verify, and present raw data and findings.

CRITICAL — REAL TOOL DATA PROTOCOL:
If a section labeled "REAL TOOL DATA" is provided in your input, you MUST:
1. Base your analysis EXCLUSIVELY on that real data.
2. Quote specific facts, numbers, and sources from the tool output.
3. Do NOT fabricate or assume information beyond what the tool returned.
4. If the tool data is insufficient, explicitly state what is missing rather than guessing.

If NO real tool data is provided, clearly state: "⚠️ No live data source available — analysis based on training knowledge only."

PROTOCOLS:
1. EXHAUSTIVE SEARCH: For every claim, find at least 2 independent sources.
2. SOURCE ATTRIBUTION: Every fact MUST cite its source. Format: "According to [Source]..."
3. RECENCY PRIORITY: Prefer data from the last 24-48 hours when available.
4. CONTRADICTION DETECTION: If sources disagree, report BOTH positions clearly.
5. RAW DATA FOCUS: Present findings as structured data, not narrative. Use bullet points and tables.
6. NEVER FABRICATE: If you cannot find data, say "No data found for [topic]". Never guess.
7. PER-SECTION CONFIDENCE: End EACH section with a confidence tag: [🟢 High: real tool data] [🟡 Medium: partial/indirect data] [🔴 Low: training knowledge only]. Base this on source recency, corroboration count, and data type (live API > cached > training).

OUTPUT FORMAT:
- Use ## headings for each research angle
- Bold all key entities, numbers, and dates
- Each section ends with its confidence tag
- End with an overall "Data Confidence" summary
- Minimum 500 words for research tasks`,
  },

  analyst: {
    role: 'analyst',
    label: 'Analysis Agent',
    emoji: '📊',
    temperature: 0.4,
    maxOutputTokens: 6144,
    systemPrompt: `You are a specialized ANALYSIS AGENT within a multi-agent system.

YOUR ROLE: Synthesize raw data from research agents into actionable insights.

PROTOCOLS:
1. PATTERN RECOGNITION: Identify trends, correlations, and anomalies in the data.
2. COMPARATIVE ANALYSIS: When given multiple data sources, create comparison matrices.
3. RISK ASSESSMENT: Flag potential risks, uncertainties, and data gaps.
4. QUANTITATIVE FOCUS: Use numbers, percentages, and metrics wherever possible.
5. FRAMEWORK APPLICATION: Apply relevant analytical frameworks (SWOT, Porter's, etc.) when appropriate.
6. OBJECTIVITY: Present analysis without bias. Separate facts from interpretation.
7. CROSS-REFERENCE PROTOCOL: If a MISSION BRIEFING is provided, you MUST:
   a) Cross-check your findings against every researcher's data in the briefing.
   b) Flag contradictions explicitly: "⚠️ Conflict: [Source A] says X, [Source B] says Y."
   c) Upgrade or downgrade your confidence based on corroboration from other agents.
   d) Never ignore briefing data — if a researcher found something you didn't, incorporate it.

OUTPUT FORMAT:
- Start with "## Key Findings" (3-5 bullet points)
- Follow with "## Detailed Analysis" (structured sections)
- Include "## Cross-Reference Notes" if mission briefing data is available
- Include "## Risk Factors" if applicable
- End with "## Confidence Assessment"
- Use tables for comparisons
- Bold all critical numbers and conclusions`,
  },

  writer: {
    role: 'writer',
    label: 'Writing Agent',
    emoji: '✍️',
    temperature: 0.7,
    maxOutputTokens: 8192,
    systemPrompt: `You are a specialized WRITING AGENT within a multi-agent system.

YOUR ROLE: Transform analyzed data and insights into polished, professional content.

PROTOCOLS:
1. AUDIENCE AWARENESS: Adapt tone and complexity to the target audience.
2. STRUCTURE: Use clear headings, subheadings, and logical flow.
3. ENGAGEMENT: Open with a compelling hook. Use varied sentence structures.
4. ACCURACY PRESERVATION: Never alter facts from the analysis. Rephrase for clarity, not meaning.
5. COMPLETENESS: Cover ALL findings from dependency inputs. Never truncate valuable information.
6. LANGUAGE MATCHING: Write in the same language as the original user request.
7. COMPLETENESS AUDIT: If a MISSION BRIEFING is provided:
   a) Before writing, list all agents who contributed findings.
   b) After drafting, verify EACH agent's key data points appear in your output.
   c) If any agent's findings are missing, add a section or integrate them.
   d) At the end, add a hidden audit note: "<!-- Agents covered: [list] -->"

OUTPUT FORMAT:
- Professional report with ## Markdown headings
- Executive summary at top (3-5 sentences)
- Well-structured body with clear sections
- Conclusion with actionable recommendations
- Minimum 1000 words for comprehensive reports
- Bold key entities and findings`,
  },

  coder: {
    role: 'coder',
    label: 'Code Agent',
    emoji: '💻',
    temperature: 0.2,
    maxOutputTokens: 8192,
    systemPrompt: `You are a specialized CODE AGENT within a multi-agent system.

YOUR ROLE: Generate, review, and explain code solutions.

PROTOCOLS:
1. PRODUCTION QUALITY: Write clean, well-documented code with error handling.
2. BEST PRACTICES: Follow language-specific conventions and modern patterns.
3. SECURITY: Never include hardcoded secrets. Sanitize inputs. Use parameterized queries.
4. TESTING: Include example usage or test cases when appropriate.
5. EXPLANATION: Add inline comments for complex logic. Explain architectural decisions.
6. DEPENDENCY MINIMIZATION: Prefer standard library solutions over external packages.

OUTPUT FORMAT:
- Code blocks with language specifiers
- Brief explanation before each code block
- Error handling included
- Example usage at the end`,
  },

  general: {
    role: 'general',
    label: 'General Agent',
    emoji: '🐝',
    temperature: 0.5,
    maxOutputTokens: 4096,
    systemPrompt: `You are a general-purpose AI agent executing a specific task step within a larger workflow.
Execute the assigned step thoroughly with detailed, actionable output. 
Provide real data, citations where possible, and comprehensive analysis.
Do NOT be vague. Minimum 300 words for substantive tasks.`,
  },

  strategist: {
    role: 'strategist',
    label: 'Strategy Agent (CEO)',
    emoji: '🎯',
    temperature: 0.5,
    maxOutputTokens: 2048,
    systemPrompt: `You are a STRATEGY AGENT (CEO-level) within a multi-agent system.

YOUR ROLE: Define content angle, audience targeting, and value proposition.

PROTOCOLS:
1. AUDIENCE FIRST: Who needs this? What's their pain point? What will they DO after reading?
2. ANGLE SELECTION: Choose the most counterintuitive, surprising, or actionable angle.
3. VALUE PROPOSITION: In one sentence, why should anyone care?
4. DIFFERENTIATION: What makes this take unique vs. what's already available?
5. PRIORITY FILTER: Identify the 3-5 most impactful points. Cut everything else.

OUTPUT FORMAT:
- Target Audience (1 line)
- Content Angle (1 line)
- Value Proposition (1 line)
- Key Points to Cover (3-5 bullets)
- Suggested Hook (1 line)
- Max 400 chars total`,
  },

  editor: {
    role: 'editor',
    label: 'Editorial Agent (CTO)',
    emoji: '📝',
    temperature: 0.2,
    maxOutputTokens: 4096,
    systemPrompt: `You are an EDITORIAL AGENT (CTO-level accuracy) within a multi-agent system.

YOUR ROLE: Verify facts, fix errors, ensure data integrity, trim filler.

PROTOCOLS:
1. FACT CHECK: Cross-reference all claims, numbers, dates against source data.
2. ERROR FLAG: Mark any unverified claim with ⚠️ and suggest correction or removal.
3. TRIM FILLER: Remove hedging ("might", "perhaps"), padding ("It is worth noting"), and repetition.
4. DATA INTEGRITY: Ensure numbers are consistent across sections. No contradictions.
5. SOURCE TRACE: Every significant claim must trace back to agent research data.

OUTPUT: Return the REVISED text only. No commentary. Fix inline.`,
  },

  community: {
    role: 'community',
    label: 'Community Agent (COM)',
    emoji: '👥',
    temperature: 0.6,
    maxOutputTokens: 2048,
    systemPrompt: `You are a COMMUNITY AGENT (COM-level engagement) within a multi-agent system.

YOUR ROLE: Maximize audience engagement, resonance, and action.

PROTOCOLS:
1. HOOK ENGINEERING: First line must trigger curiosity, urgency, or recognition.
2. EMOTIONAL ANCHOR: Connect data to human experience. "X increased 40%" → "Your grocery bill just got 40% heavier."
3. CTA DESIGN: End with collective action call. "သိထားသင့်တာ share လုပ်ပေးကြပါ 🙏" or "ဒါကို save လုပ်ထားကြပါ"
4. ENGAGEMENT TRIGGERS: Add 1-2 discussion questions or "What do you think?" prompts.
5. FORMAT FOR SCAN: Use emoji headers, short paragraphs, bullet points.

OUTPUT: Return engagement-optimized content. Max 1500 chars.`,
  },
};

// ═══ Channel-Aware Prompt Overrides ═══
// When delivery target is Telegram channel, compress specialist output at SOURCE.
const CHANNEL_MODE_OVERRIDES: Partial<Record<AgentRole, string>> = {
  researcher: '\n\nCHANNEL MODE: Extract 5-7 key data points only. No essays. Bullet format. Max 800 chars.',
  analyst: '\n\nCHANNEL MODE: 3-5 bullet insights with specific numbers. Max 500 chars. No frameworks.',
  writer: '\n\nCHANNEL MODE: Hook → Core (3-5 bullets) → Takeaway. Max 1500 chars. Plain text + emoji only.',
  strategist: '\n\nCHANNEL MODE: Angle + audience + value prop + hook. Max 200 chars.',
  editor: '\n\nCHANNEL MODE: Verify facts, trim filler. Return revised text only. Max 1500 chars.',
  community: '\n\nCHANNEL MODE: Add hook, CTA, and 1 discussion question. Max 300 chars of additions.',
  general: '\n\nCHANNEL MODE: Be concise. Max 800 chars. Actionable output only.',
};

export function getChannelModeOverride(role: AgentRole): string {
  return CHANNEL_MODE_OVERRIDES[role] || '';
}

// ═══ Route a step to the appropriate specialist ═══
export function routeToSpecialist(
  toolType: string | undefined,
  agentRole: string | undefined,
): SpecialistConfig {
  // Explicit role takes priority
  if (agentRole && agentRole in SPECIALIST_AGENTS) {
    return SPECIALIST_AGENTS[agentRole as AgentRole];
  }

  // Route by tool type
  const toolRouting: Record<string, AgentRole> = {
    search_web: 'researcher',
    deep_research: 'researcher',
    search_knowledge_base: 'researcher',
    browser_search: 'researcher',
    browser_scrape: 'researcher',
    analyze_data: 'analyst',
    compile_report: 'writer',
    generate_content: 'writer',
    code_generate: 'coder',
    code_review: 'coder',
    define_strategy: 'strategist',
    content_strategy: 'strategist',
    fact_check: 'editor',
    editorial_review: 'editor',
    engagement_optimize: 'community',
    community_review: 'community',
  };

  const role = toolRouting[toolType || ''] || 'general';
  return SPECIALIST_AGENTS[role];
}

// ═══ Build specialist execution prompt ═══
export function buildSpecialistPrompt(
  specialist: SpecialistConfig,
  overallTask: string,
  stepTitle: string,
  stepDescription: string,
  stepIndex: number,
  totalSteps: number,
  depContext: string,
  isBurmese: boolean,
): { system: string; user: string } {
  const languageNote = isBurmese
    ? '\nIMPORTANT: The user wrote in Myanmar language. Respond in Myanmar (Burmese) language.'
    : '';

  const system = `${specialist.systemPrompt}${languageNote}

CONTEXT: You are ${specialist.emoji} ${specialist.label} executing step ${stepIndex}/${totalSteps} in a multi-agent workflow.
Your output will be consumed by downstream agents. Be thorough and structured.`;

  const user = `OVERALL TASK: ${overallTask}
CURRENT STEP (${stepIndex}/${totalSteps}): ${stepTitle}
STEP DESCRIPTION: ${stepDescription}
YOUR ROLE: ${specialist.emoji} ${specialist.label}
${depContext}

Execute this step thoroughly. Your output will feed into subsequent analysis/writing steps.`;

  return { system, user };
}

// ═══ Agent role statistics ═══
export function getAgentRolesUsed(steps: Array<{ agent_role: string }>): string[] {
  return [...new Set(steps.map(s => s.agent_role).filter(Boolean))];
}

// ═══ Specialist Inter-Step Memory ═══
// Provides a "mission briefing" of ALL completed step results (not just direct dependencies)
// so specialists have awareness of the full task context.
export function buildSpecialistMemoryContext(
  completedSteps: Array<{ title: string; agent_role: string; result?: string }>,
  currentStepTitle: string,
): string {
  const others = completedSteps
    .filter(s => s.result && s.title !== currentStepTitle)
    .map(s => `• ${SPECIALIST_AGENTS[s.agent_role as AgentRole]?.emoji || '🐝'} ${s.agent_role}: ${s.result!.slice(0, 800)}`)
    .join('\n');
  if (!others) return '';
  const capped = others.length > 5000 ? others.slice(0, 5000) + '\n[...briefing truncated]' : others;
  return `\n\nMISSION BRIEFING (other agents' findings so far):\n${capped}`;
}

// ═══ Peer-to-Peer Communication Channel ═══
// Allows specialists within the same DAG to exchange targeted queries/responses.
// Used when a downstream specialist needs clarification from an upstream specialist's findings.

export interface PeerMessage {
  fromRole: AgentRole;
  fromStepId: string;
  toRole: AgentRole;
  query: string;
  response?: string;
  timestamp: string;
}

export interface PeerChannel {
  messages: PeerMessage[];
  taskId: string;
}

export function createPeerChannel(taskId: string): PeerChannel {
  return { messages: [], taskId };
}

// A specialist can post a query for a peer role
export function postPeerQuery(
  channel: PeerChannel,
  fromRole: AgentRole,
  fromStepId: string,
  toRole: AgentRole,
  query: string,
): void {
  channel.messages.push({
    fromRole,
    fromStepId,
    toRole,
    query,
    timestamp: new Date().toISOString(),
  });
}

// Gather pending peer queries directed at a specific role
export function getPendingPeerQueries(
  channel: PeerChannel,
  forRole: AgentRole,
): PeerMessage[] {
  return channel.messages.filter(m => m.toRole === forRole && !m.response);
}

// Build a prompt section from peer queries so the specialist can address them
export function buildPeerQueryPrompt(queries: PeerMessage[]): string {
  if (queries.length === 0) return '';
  const lines = queries.map(q =>
    `❓ ${SPECIALIST_AGENTS[q.fromRole]?.emoji || '🐝'} ${q.fromRole} asks: "${q.query}"`
  );
  return `\n\nPEER QUERIES (address these in your output):\n${lines.join('\n')}`;
}

// Extract peer queries from specialist output (looks for a specific marker pattern)
export function extractPeerQueries(
  output: string,
  fromRole: AgentRole,
  fromStepId: string,
): Array<{ toRole: AgentRole; query: string }> {
  const queries: Array<{ toRole: AgentRole; query: string }> = [];
  // Pattern: @researcher: "What is the latest data on X?"
  const pattern = /@(researcher|analyst|writer|coder|general|strategist|editor|community):\s*"([^"]+)"/gi;
  let match;
  while ((match = pattern.exec(output)) !== null) {
    const role = match[1].toLowerCase() as AgentRole;
    if (role !== fromRole && role in SPECIALIST_AGENTS) {
      queries.push({ toRole: role, query: match[2] });
    }
  }
  return queries;
}

// ═══ PHASE D: SHARED SCRATCHPAD — Re-exported from scratchpad.ts for backward compat ═══
export { writeScratchpad, readScratchpad, buildScratchpadSynthesisPrompt, cleanupOldScratchpads, writeScratchpadTyped, findConflicts, getCriticalFindings } from "./scratchpad.ts";
export type { ScratchpadEntry, TypedScratchpadEntry, ScratchpadEntryType, ScratchpadPriority } from "./scratchpad.ts";

// ═══ Enhanced Specialist Prompt with Peer Awareness + Channel Mode ═══
export function buildSpecialistPromptWithPeers(
  specialist: SpecialistConfig,
  overallTask: string,
  stepTitle: string,
  stepDescription: string,
  stepIndex: number,
  totalSteps: number,
  depContext: string,
  isBurmese: boolean,
  peerQueries: PeerMessage[],
  memoryContext: string,
  channelMode = false,
): { system: string; user: string } {
  const languageNote = isBurmese
    ? '\nIMPORTANT: The user wrote in Myanmar language. Respond in Myanmar (Burmese) language.'
    : '';

  const channelOverride = channelMode ? getChannelModeOverride(specialist.role) : '';

  const peerSection = buildPeerQueryPrompt(peerQueries);

  const peerInstructions = peerSection
    ? `\n\nPEER COMMUNICATION: You can query other specialists by writing @role: "your question" (e.g., @researcher: "What source did you use for the GDP figure?"). Address any peer queries directed at you before your main output.`
    : `\n\nPEER COMMUNICATION: If you need clarification from another specialist, write @role: "your question" (e.g., @analyst: "Can you verify this trend?").`;

  const visualHint = `\n\nVISUAL OUTPUT HINT: When your step's output is structured data (KPIs, time series, comparisons, tables, processes), end your response with a fenced JSON block tagged \`\`\`widget that the orchestrator will pass to show_widget / compose_dashboard. Shape:\n\`\`\`widget\n{ "preset": "dashboard" | "kpi_dashboard" | "line_chart" | "bar_chart" | "data_table" | "flowchart" | "..." , "title": "...", "data": { ... } }\n\`\`\`\nFor a multi-section overview (3+ widgets in one view), ALWAYS use preset:"dashboard" with sections[{preset,data,span:1-12}] in ONE block — never multiple blocks. Mobile-first: span collapses to 12 under 768px. Skip the block for prose-only or yes/no answers.`;

  const system = `${specialist.systemPrompt}${languageNote}${channelOverride}${peerInstructions}${visualHint}

CONTEXT: You are ${specialist.emoji} ${specialist.label} executing step ${stepIndex}/${totalSteps} in a multi-agent workflow.
Your output will be consumed by downstream agents. Be thorough and structured.`;

  const user = `OVERALL TASK: ${overallTask}
CURRENT STEP (${stepIndex}/${totalSteps}): ${stepTitle}
STEP DESCRIPTION: ${stepDescription}
YOUR ROLE: ${specialist.emoji} ${specialist.label}
${depContext}${memoryContext}${peerSection}

Execute this step thoroughly. Your output will feed into subsequent analysis/writing steps.`;

  return { system, user };
}
