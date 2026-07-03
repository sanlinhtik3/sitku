// ═══ Tool Result Verifier — Post-execution output verification ═══
// Checks tool results against the original query intent, not just LLM interpretation.
// This is an execution-based feedback loop (Priority 1 Harness improvement).

export interface VerificationResult {
  toolName: string;
  passed: boolean;
  confidence: number;
  issues: string[];
  suggestion?: string;
}

/**
 * Verify tool results against the original user query intent.
 * Returns verification results for each tool that was executed.
 */
export function verifyToolResults(
  userMessage: string,
  toolResults: { name: string; result: any; error?: string }[],
): VerificationResult[] {
  const results: VerificationResult[] = [];

  for (const tr of toolResults) {
    if (tr.error || !tr.result) continue;

    switch (tr.name) {
      case 'search_web':
      case 'browser_search':
      case 'search_web_deep':
        results.push(verifySearchResult(userMessage, tr));
        break;
      case 'generate_ai_content':
        results.push(verifyContentGeneration(userMessage, tr));
        break;
      case 'manage_flowstate':
        results.push(verifyFlowstateResult(userMessage, tr));
        break;
      case 'search_knowledge_base':
        results.push(verifyKBSearch(userMessage, tr));
        break;
      case 'browser_scrape':
      case 'browser_read_page':
        results.push(verifyScrapeResult(userMessage, tr));
        break;
      default:
        // Generic pass for tools without specific verifiers
        results.push({ toolName: tr.name, passed: true, confidence: 0.5, issues: [] });
    }
  }

  return results;
}

/**
 * Verify search results contain keywords from the query.
 */
function verifySearchResult(
  userMessage: string,
  tr: { name: string; result: any },
): VerificationResult {
  const issues: string[] = [];
  const result = tr.result;

  // Extract search query keywords
  const queryText = result?.query || userMessage;
  const keywords = extractKeywords(queryText);

  // Check if results exist
  const resultItems = result?.results || result?.organic_results || [];
  if (!Array.isArray(resultItems) || resultItems.length === 0) {
    return {
      toolName: tr.name,
      passed: false,
      confidence: 0.9,
      issues: ['Search returned zero results'],
      suggestion: 'Try broader search terms or alternative keywords',
    };
  }

  // Check keyword coverage in results
  const allResultText = resultItems
    .map((r: any) => `${r.title || ''} ${r.snippet || ''} ${r.description || ''}`)
    .join(' ')
    .toLowerCase();

  let matchedKeywords = 0;
  for (const kw of keywords) {
    if (allResultText.includes(kw.toLowerCase())) matchedKeywords++;
  }

  const coverageRatio = keywords.length > 0 ? matchedKeywords / keywords.length : 1;

  if (coverageRatio < 0.3 && keywords.length >= 2) {
    issues.push(`Low keyword coverage: only ${matchedKeywords}/${keywords.length} query keywords found in results`);
  }

  // Check for stale/irrelevant results (all results from same domain = potential spam)
  const domains = new Set(resultItems.map((r: any) => {
    try { return new URL(r.url || r.link || '').hostname; } catch { return ''; }
  }).filter(Boolean));
  if (domains.size === 1 && resultItems.length > 3) {
    issues.push('All results from single domain — may lack diversity');
  }

  return {
    toolName: tr.name,
    passed: issues.length === 0,
    confidence: coverageRatio > 0.5 ? 0.85 : 0.5,
    issues,
    suggestion: issues.length > 0 ? 'Consider refining search query or using browser_scrape for deeper content' : undefined,
  };
}

/**
 * Verify AI content generation quality.
 */
function verifyContentGeneration(
  userMessage: string,
  tr: { name: string; result: any },
): VerificationResult {
  const issues: string[] = [];
  const result = tr.result;
  const content = result?.content || result?.generated_content || '';

  if (!content || typeof content !== 'string') {
    return {
      toolName: tr.name,
      passed: false,
      confidence: 0.95,
      issues: ['Content generation returned empty result'],
      suggestion: 'Retry with clearer prompt',
    };
  }

  // Word count check — too short may indicate generation failure
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  if (wordCount < 20) {
    issues.push(`Generated content is very short (${wordCount} words)`);
  }

  // Language consistency check
  const userHasBurmese = /[\u1000-\u109F]/.test(userMessage);
  const contentHasBurmese = /[\u1000-\u109F]/.test(content);
  if (userHasBurmese && !contentHasBurmese && content.length > 50) {
    issues.push('User wrote in Myanmar but generated content is entirely in another language');
  }

  return {
    toolName: tr.name,
    passed: issues.length === 0,
    confidence: issues.length === 0 ? 0.85 : 0.6,
    issues,
  };
}

/**
 * Verify FlowState financial operation results.
 */
function verifyFlowstateResult(
  _userMessage: string,
  tr: { name: string; result: any },
): VerificationResult {
  const issues: string[] = [];
  const result = tr.result;

  // Check for error responses
  if (result?.error) {
    issues.push(`Financial operation failed: ${result.error}`);
    return { toolName: tr.name, passed: false, confidence: 0.95, issues, suggestion: 'Check action name and required parameters' };
  }

  // Verify balance queries return account data
  // Treat 0 as a valid total_balance (new users / fully-spent accounts)
  if (result?.accounts !== undefined && result?.total_balance === undefined) {
    issues.push('Balance query returned accounts but no total_balance field');
  }

  // Verify transaction operations return confirmation
  if (result?.success && result?.message?.includes('recorded') && result?.new_balance === undefined) {
    issues.push('Transaction reported success but no balance confirmation');
  }

  // Verify insights have data
  if (result?.transaction_count === 0 && result?.income === 0 && result?.expense === 0) {
    // Not an error — user may have no transactions yet
  }

  return {
    toolName: tr.name,
    passed: issues.length === 0,
    confidence: 0.9,
    issues,
  };
}

/**
 * Verify knowledge base search results.
 */
function verifyKBSearch(
  userMessage: string,
  tr: { name: string; result: any },
): VerificationResult {
  const issues: string[] = [];
  const result = tr.result;
  const items = result?.results || result?.entries || [];

  if (!Array.isArray(items) || items.length === 0) {
    // Empty KB result is not necessarily a failure — KB might not have the content
    return {
      toolName: tr.name,
      passed: true,
      confidence: 0.7,
      issues: [],
      suggestion: 'No KB entries found — consider web search for external knowledge',
    };
  }

  return {
    toolName: tr.name,
    passed: true,
    confidence: 0.85,
    issues,
  };
}

/**
 * Verify browser scrape results.
 */
function verifyScrapeResult(
  _userMessage: string,
  tr: { name: string; result: any },
): VerificationResult {
  const issues: string[] = [];
  const result = tr.result;
  const content = result?.content || result?.text || result?.markdown || '';

  if (!content || (typeof content === 'string' && content.trim().length < 50)) {
    issues.push('Scraped page returned very little content — page may be blocked or JavaScript-heavy');
    return {
      toolName: tr.name,
      passed: false,
      confidence: 0.8,
      issues,
      suggestion: 'Try a different URL or search for cached version',
    };
  }

  return {
    toolName: tr.name,
    passed: true,
    confidence: 0.85,
    issues,
  };
}

/**
 * Extract meaningful keywords from text, filtering stop words.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
    'through', 'during', 'before', 'after', 'above', 'below', 'and', 'or',
    'but', 'not', 'this', 'that', 'these', 'those', 'it', 'its', 'my',
    'your', 'his', 'her', 'our', 'their', 'what', 'which', 'who', 'how',
    'me', 'him', 'them', 'i', 'you', 'we', 'they', 'he', 'she',
    // Myanmar particles
    'ကို', 'က', 'မှာ', 'တွင်', 'နဲ့', 'နှင့်', 'ရဲ့', '၏',
  ]);

  return text
    .split(/[\s,;:!?.]+/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Build a verification nudge message for the LLM when results fail verification.
 */
export function buildVerificationNudge(
  failedResults: VerificationResult[],
): string | null {
  if (failedResults.length === 0) return null;

  const issues = failedResults
    .map(r => `• ${r.toolName}: ${r.issues.join('; ')}${r.suggestion ? ` → ${r.suggestion}` : ''}`)
    .join('\n');

  return `[TOOL_RESULT_VERIFICATION] The following tool results have quality issues:\n${issues}\n\nPlease acknowledge these limitations in your response. If data is missing or low-quality, say so honestly rather than fabricating details.`;
}
