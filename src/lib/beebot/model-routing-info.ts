// ═══ BeeBot Model Routing — Single Source of Truth for UI Transparency ═══
// Mirrors backend mapping in supabase/functions/_shared/internal-llm-caller.ts
// Keep in sync if backend TASK_MODEL_MAP changes.

export interface HelperRoute {
  task: string;
  model: string;
  reason: string;
}

export const HELPER_ROUTES: HelperRoute[] = [
  { task: 'Intent detection',  model: 'Flash Lite',          reason: 'fastest classification' },
  { task: 'Status narration',  model: 'Flash Lite',          reason: 'tiny user-facing text' },
  { task: 'Memory tagging',    model: 'Flash Lite',          reason: 'classification' },
  { task: 'Memory reflection', model: 'Flash Lite',          reason: 'JSON scoring output' },
  { task: 'Memory summary',    model: 'Flash 2.5',           reason: 'needs ≥8K context for compaction' },
  { task: 'Synthesis fallback',model: 'Flash 2.5',           reason: 'quality matters when main fails' },
  { task: 'Embeddings',        model: 'gemini-embedding-001',reason: 'semantic vector search' },
];

export const PRO_KEY_NOTE =
  'Pro key (RPM=2): background helpers auto-disabled to protect your main reply.';

// ═══ Subsystem Map — which model powers each agentic surface ═══
export type SubsystemIcon = 'brain' | 'bot' | 'chart' | 'wallet' | 'vector' | 'cog';
export type SubsystemSource = 'your-selection' | 'system-fixed';
export type SubsystemScope = 'user' | 'background';

export interface SubsystemRoute {
  key: string;
  label: string;
  scope: SubsystemScope;
  model: string;
  source: SubsystemSource;
  reason: string;
  icon: SubsystemIcon;
}

export const SUBSYSTEM_ROUTES: SubsystemRoute[] = [
  {
    key: 'automate',
    label: 'BeeBot Automate (Heartbeat)',
    scope: 'user',
    model: '(your selected Brain model)',
    source: 'your-selection',
    reason: 'runs scheduled tasks with your Brain — same quality as live chat',
    icon: 'bot',
  },
  {
    key: 'consultant',
    label: 'Agent Consultant',
    scope: 'background',
    model: 'gemini-3.5-flash',
    source: 'system-fixed',
    reason: 'finance & productivity insight synthesis',
    icon: 'chart',
  },
  {
    key: 'flowstate',
    label: 'FlowState CFO',
    scope: 'background',
    model: 'gemini-3.5-flash',
    source: 'system-fixed',
    reason: 'transaction analysis & forecasting',
    icon: 'wallet',
  },
];
