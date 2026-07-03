// ═══════════════════════════════════════════════════════════════
// ✅ BEE BRAIN — INTEGRITY MODULE
// Pipeline integrity verification, tool result validation
// Extracted from bee-brain.ts (P2 refactor)
// ═══════════════════════════════════════════════════════════════

// Expected minimum result sizes for data-heavy tools
const TOOL_SIZE_EXPECTATIONS: Record<string, number> = {
  search_web: 50,
  browser_search: 50,
  search_web_deep: 100,
  browser_scrape: 100,
  search_knowledge_base: 20,
  admin_ai_analytics: 30,
  super_app_omniscience: 30,
  spawn_parallel_swarm: 80,
};

export interface IntegrityReport {
  isValid: boolean;
  violations: string[];
  dataSparse: boolean;
}

/**
 * Verifies tool result integrity:
 * 1. Not null/undefined when success reported
 * 2. JSON round-trips cleanly (encoding integrity)
 * 3. Size within expected bounds
 */
export function verifyToolResultIntegrity(
  toolName: string,
  result: any,
  hasError: boolean
): IntegrityReport {
  const violations: string[] = [];
  let dataSparse = false;
  let cachedStr: string | null = null;

  if (!hasError && (result === null || result === undefined)) {
    violations.push(`${toolName}: null result despite success status`);
  }

  if (result !== null && result !== undefined) {
    try {
      cachedStr = JSON.stringify(result);
    } catch (e) {
      violations.push(`${toolName}: result not JSON-serializable — ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  const expectedMinSize = TOOL_SIZE_EXPECTATIONS[toolName];
  if (expectedMinSize && !hasError && result !== null && result !== undefined) {
    const resultStr = cachedStr ?? JSON.stringify(result);
    if (resultStr.length < expectedMinSize) {
      violations.push(`${toolName}: suspiciously small result (${resultStr.length} chars, expected >=${expectedMinSize})`);
      dataSparse = true;
    }
  }

  if (!hasError && result !== null && typeof result === 'object') {
    const isSearchTool = ['search_web', 'browser_search', 'search_web_deep', 'search_knowledge_base'].includes(toolName);
    if (isSearchTool) {
      const results = result.results || result.data || result.items;
      if (Array.isArray(results) && results.length === 0) {
        dataSparse = true;
        violations.push(`${toolName}: returned 0 results (data_sparse)`);
      }
    }
  }

  const SOFT_ERROR_TOOLS = ['generate_image', 'generate_file', 'browser_scrape', 'browser_read_page', 'browser_search'];
  if (!hasError && result !== null && typeof result === 'object' && !SOFT_ERROR_TOOLS.includes(toolName)) {
    const resultStr = cachedStr ?? JSON.stringify(result);
    const errorPatterns = /\b(error|failed|not found|unauthorized|forbidden|timeout|exception|ECONNREFUSED)\b/i;
    if (errorPatterns.test(resultStr) && !resultStr.includes('"success":true') && !resultStr.includes('"skipped":true')) {
      violations.push(`${toolName}: false-positive success — response body contains error indicators`);
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    dataSparse,
  };
}
