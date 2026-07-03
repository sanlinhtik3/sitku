// ═══ P0 UPGRADE: Structured Output Enforcement — Tool Argument Validator ═══
// Pre-validates tool call arguments against expected schemas before execution.
// Auto-repairs malformed JSON using lightweight LLM call as last resort.

import { GEMINI_NATIVE_PREFIX } from "./api-endpoints.ts";

export interface ValidationResult {
  isValid: boolean;
  repairedArgs?: Record<string, any>;
  errors: string[];
}

// Minimal schema definitions for critical tools (required fields + types)
const TOOL_SCHEMAS: Record<string, { required: string[]; types: Record<string, string>; defaults?: Record<string, any> }> = {
  search_web: {
    required: ['query'],
    types: { query: 'string' },
  },
  manage_flowstate: {
    required: ['action'],
    types: { action: 'string', amount: 'number', currency: 'string', category: 'string', description: 'string' },
  },
  generate_ai_content: {
    required: ['prompt'],
    types: { prompt: 'string', tone: 'string', style: 'string', language: 'string', category: 'string' },
  },
  manage_workspace_task: {
    required: ['action'],
    types: { action: 'string', title: 'string', priority: 'string', points: 'number' },
  },
  manage_ai_content: {
    required: ['action'],
    types: { action: 'string', content_id: 'string' },
  },
  search_knowledge_base: {
    required: ['query'],
    types: { query: 'string', category: 'string', language: 'string' },
  },
  generate_image: {
    required: ['prompt'],
    types: { prompt: 'string', aspect_ratio: 'string', style: 'string' },
  },
  browser_scrape: {
    required: ['url'],
    types: { url: 'string' },
  },
  browser_search: {
    required: ['query'],
    types: { query: 'string' },
  },
  get_user_info: {
    required: ['info_type'],
    types: { info_type: 'string' },
  },
  manage_facebook_page: {
    required: ['action'],
    types: { action: 'string', page_id: 'string', message: 'string' },
  },
  remember_user_fact: {
    required: ['fact_key', 'fact_value'],
    types: { fact_key: 'string', fact_value: 'string' },
  },
  recall_episodic_memory: {
    required: ['query'],
    types: { query: 'string' },
  },
};

/**
 * Validate tool arguments against the expected schema.
 * Attempts auto-repair for common issues (type coercion, missing defaults).
 */
export function validateToolArguments(
  toolName: string,
  args: Record<string, any>,
): ValidationResult {
  const schema = TOOL_SCHEMAS[toolName];
  
  // No schema defined → pass through (non-critical tools)
  if (!schema) {
    return { isValid: true, errors: [] };
  }

  const errors: string[] = [];
  const repairedArgs = { ...args };
  let wasRepaired = false;

  // Check required fields
  for (const field of schema.required) {
    if (repairedArgs[field] === undefined || repairedArgs[field] === null) {
      // Try to infer from other fields
      if (field === 'query' && repairedArgs.search_query) {
        repairedArgs.query = repairedArgs.search_query;
        delete repairedArgs.search_query;
        wasRepaired = true;
      } else if (field === 'action' && repairedArgs.type) {
        repairedArgs.action = repairedArgs.type;
        delete repairedArgs.type;
        wasRepaired = true;
      } else if (field === 'prompt' && repairedArgs.text) {
        repairedArgs.prompt = repairedArgs.text;
        delete repairedArgs.text;
        wasRepaired = true;
      } else {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Type coercion
  for (const [field, expectedType] of Object.entries(schema.types)) {
    const value = repairedArgs[field];
    if (value === undefined || value === null) continue;

    const actualType = typeof value;
    if (actualType !== expectedType) {
      if (expectedType === 'string' && actualType === 'number') {
        repairedArgs[field] = String(value);
        wasRepaired = true;
      } else if (expectedType === 'number' && actualType === 'string') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
          repairedArgs[field] = parsed;
          wasRepaired = true;
        } else {
          errors.push(`Field "${field}" expected ${expectedType}, got non-numeric string`);
        }
      } else if (expectedType === 'string' && actualType === 'object') {
        repairedArgs[field] = JSON.stringify(value);
        wasRepaired = true;
      }
    }
  }

  // Apply defaults if defined
  if (schema.defaults) {
    for (const [field, defaultVal] of Object.entries(schema.defaults)) {
      if (repairedArgs[field] === undefined) {
        repairedArgs[field] = defaultVal;
        wasRepaired = true;
      }
    }
  }

  if (wasRepaired) {
    console.log(`[ArgValidator] Auto-repaired args for ${toolName}: ${JSON.stringify(Object.keys(repairedArgs))}`);
  }

  if (errors.length > 0) {
    console.warn(`[ArgValidator] Validation errors for ${toolName}:`, errors);
  }

  return {
    isValid: errors.length === 0,
    repairedArgs: wasRepaired ? repairedArgs : undefined,
    errors,
  };
}

/**
 * Attempt to repair completely malformed JSON arguments using lightweight LLM.
 * Only called as a last resort when JSON.parse fails AND bracket recovery fails.
 */
export async function repairMalformedArgs(
  toolName: string,
  rawArgs: string,
  apiKey: string,
): Promise<Record<string, any> | null> {
  if (!apiKey || rawArgs.length < 5 || rawArgs.length > 5000) return null;

  try {
    const schema = TOOL_SCHEMAS[toolName];
    const schemaHint = schema
      ? `Expected fields: ${schema.required.join(', ')}. Types: ${JSON.stringify(schema.types)}`
      : `Tool: ${toolName}`;

    // Use native Gemini API for repair (fast, cheap)
    const response = await fetch(
      `${GEMINI_NATIVE_PREFIX}gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Fix this malformed JSON for the "${toolName}" tool call. ${schemaHint}\n\nBroken JSON:\n${rawArgs.slice(0, 2000)}\n\nOutput ONLY the corrected JSON object, nothing else.`
            }]
          }],
          generationConfig: { maxOutputTokens: 512, temperature: 0 },
        }),
        signal: AbortSignal.timeout(5_000),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;

    // Extract JSON from potential markdown
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    
    if (typeof parsed === 'object' && parsed !== null) {
      console.log(`[ArgRepair] ✅ Successfully repaired args for ${toolName}`);
      return parsed;
    }
    return null;
  } catch (e) {
    console.warn(`[ArgRepair] Failed for ${toolName}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
