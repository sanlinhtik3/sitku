// ═══ Project Phoenix: _shared/sanitizer.ts ═══
// Extracted from agent-chat/index.ts (lines 79-232)
// Pure functions: injection detection, output sanitization, leak detection

// ═══ PROMPT INJECTION DETECTION ═══
const INJECTION_PATTERNS = [
  /ignore\s*(all\s*)?(previous|above|prior)\s*instructions/i,
  /you\s*are\s*now\s*(?!BeeBot)/i,
  /pretend\s*(you\s*are|to\s*be)/i,
  /act\s*as\s*if/i,
  /output\s*(your\s*)?(system|initial)\s*prompt/i,
  /\[SYSTEM\]/i,
  /\[ADMIN\]/i,
  /\[OVERRIDE\]/i,
  /base64\s*decode/i,
  /<script|<iframe|javascript:/i,
  /forget\s*(all|everything|your)/i,
  /bypass\s*(rls|security|rules)/i,
  /execute\s*(sql|code|command)/i,
];

// ═══ UNICODE NORMALIZATION: Strip zero-width chars and homoglyphs before injection detection ═══
// NFKC resolves Unicode compatibility equivalents (e.g., Cyrillic homoglyphs → Latin).
// Zero-width characters (U+200B-U+200F, U+2028-U+202F, U+2060-U+206F, FEFF, soft hyphen)
// can be inserted between trigger words to bypass regex-based detection.
function normalizeForInjectionCheck(text: string): string {
  let normalized = text.normalize('NFKC');
  normalized = normalized.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD]/g, '');
  return normalized;
}

export function detectPromptInjection(message: string): { detected: boolean; pattern?: string } {
  const normalized = normalizeForInjectionCheck(message);
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return { detected: true, pattern: pattern.source };
    }
  }
  return { detected: false };
}

/**
 * Sanitize tool result content before it enters the LLM context.
 * Strips detected prompt injection patterns from tool results (e.g., scraped web pages).
 * Returns the content with injection patterns redacted.
 */
export function sanitizeToolResultContent(content: string): string {
  if (!content || content.length < 10) return content;

  const normalized = normalizeForInjectionCheck(content);
  const detection = detectPromptInjection(normalized);
  if (!detection.detected) return content;

  // Apply normalization and strip matching injection patterns
  let sanitized = content.normalize('NFKC');
  sanitized = sanitized.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD]/g, '');

  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED: injection attempt]');
  }

  console.warn(`[Sanitizer] Prompt injection detected and redacted in tool result. Pattern: ${detection.pattern}`);
  return sanitized;
}

// ═══ OUTPUT SANITIZER: Prevent raw JSON/tool leakage to user ═══
const TOOL_LEAK_PATTERNS = [
  /^(search_knowledge_base|generate_ai_content|save_verbatim_content|manage_flowstate|manage_workspace_task|manage_ai_content|get_user_info|update_agent_settings|manage_notifications|get_app_navigation|admin_system_overview|admin_user_lookup|admin_view_user_psychology|broadcast_message|schedule_task|send_push_notification|manage_goal|manage_facebook_page)(success|error|result)?\s*\{/i,
  /^\s*\{\s*"success"\s*:/i,
  /^\s*\{\s*"results"\s*:/i,
  /^\s*\{\s*"error"\s*:/i,
  /^\s*\[\s*\{/i,
  /\[Tool execution completed\]/i,
  /\[Processing completed\]/i,
  /^search_web\s*$/im,
  /^search_web\s*\n+\s*\{/im,
  /^search_web\s*\{/im,
  /^\s*\{\s*"query"\s*:/i,
  /\[Used tools:\s*[^\]]*\]/i,
];

// ═══ INTERNAL MESSAGE PATTERNS: Remove tool result echoes from AI output ═══
const INTERNAL_MESSAGE_PATTERNS = [
  /BeeBot ကို ခဏလေး ပြန်စမ်းပေးပါနော်.*🐝/gi,
  /Settings updated:\s*(name|personality|emoji|custom)/gi,
  /Settings applied\.?/gi,
  /Memory stored\.?/gi,
  /မှတ်သားထားပြီးပါပြီ:\s*"[^"]*"\s*=\s*"[^"]*"/gi,
  /\[\s*(?:Remember|Recall|Memory|Settings|Tool)\s*\([^)]*\)\s*\]/gi,
  /^Memory stored\.?\s*$/gim,
  /✅\s*Autonomous decision executed\s*\(confidence:\s*\d+%?\)/gi,
  /📝\s*Decision recorded,?\s*awaiting confirmation\s*\(confidence:\s*\d+%?\)/gi,
  /Decision processed\.?/gi,
  /confidence:\s*\d+%/gi,
  /"autonomy_preference"\s*=\s*"[^"]*"/gi,
  /["'][a-z][a-z0-9]*(?:_[a-z0-9]+)+["']\s*(?:ကို|မှတ်သား|ပြောင်းလဲ|stored|recorded|updated)/gi,
  /\[SYSTEM:[^\]]*\]/gi,
];

export function sanitizeUserVisibleText(text: string, userPrompt?: string): string {
  if (!text) return "";
  
  // If user explicitly wants JSON, don't sanitize
  if (userPrompt) {
    const jsonRequests = ["json", "format json", "json ပေး", "raw data", "export"];
    const lowerPrompt = userPrompt.toLowerCase();
    if (jsonRequests.some(req => lowerPrompt.includes(req))) {
      return text;
    }
  }
  
  let sanitized = text;
  
  // Strip <thinking> blocks (internal reasoning - invisible to user)
  sanitized = sanitized.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  sanitized = sanitized.replace(/<thinking>[\s\S]*$/g, ''); // unclosed during streaming
  
  // Strip Gemini's native <tool_code> blocks (code execution syntax leak)
  sanitized = sanitized.replace(/<tool_code>[\s\S]*?<\/tool_code>/g, '');
  sanitized = sanitized.replace(/<tool_code>[\s\S]*$/g, ''); // unclosed during streaming
  
  // Strip plain-text pseudo-tool blocks (e.g. "tool_code\n\nprint(search_web(...))")
  sanitized = sanitized.replace(/^tool_code\s*\n+(?:\s*print\s*\([^)]*\)\s*\n*)+/gm, '');
  sanitized = sanitized.replace(/print\s*\(\s*(?:search_web|search_knowledge_base|manage_flowstate|generate_ai_content|manage_workspace_task)\s*\([^)]*\)\s*\)/g, '');
  
  // Strip markdown code blocks containing tool-call JSON (Gemini alternative leak format)
  sanitized = sanitized.replace(/```(?:json)?\s*\n?\s*\{[^}]*"tool_(?:code|name)"[\s\S]*?```/g, '');
  sanitized = sanitized.replace(/```(?:json)?\s*\n?\s*\{[^}]*"tool_(?:code|name)"[\s\S]*$/g, ''); // unclosed during streaming
  
  // Strip [Thinking] bracket-style blocks (alternative format some models use)
  sanitized = sanitized.replace(/\[Thinking:?\]\s*\n[\s\S]*?(?=\n(?:##|\*\*|🐝|[\u1000-\u109F])|$)/gi, '');
  sanitized = sanitized.replace(/\[Thinking:?\][^\n]*\n?/gi, '');
  sanitized = sanitized.replace(/\[Internal reasoning\][^\n]*\n?/gi, '');
  
  // Catch untagged reasoning patterns that leak without <thinking> tags
  sanitized = sanitized.replace(/^(Let me think|Let me analyze|I need to|First,? I'll|Step \d+:).{0,100}\n?/gmi, '');
  sanitized = sanitized.replace(/^(Analyzing|Checking|Planning|Reasoning)\.{0,3}\n?/gmi, '');
  
  // Strip model self-narration / reasoning leaks
  sanitized = sanitized.replace(/^(The user is asking|The user wants|The user has asked|The user needs)[^.]*\.\s*\n?/gmi, '');
  sanitized = sanitized.replace(/^(I have already provided|From the previous|I should present|I can use the information)[^.]*\.\s*\n?/gmi, '');
  sanitized = sanitized.replace(/^(Plan:\s*\n|Response Construction:|Let's use the |There's a slight variation)[^\n]*\n?/gmi, '');
  sanitized = sanitized.replace(/^(I will now|I'll now|Now I need to|Now let me)[^.]*\.\s*\n?/gmi, '');
  
  // Strip numbered internal reasoning protocol steps (from system prompt echo)
  sanitized = sanitized.replace(/^\d+\.\s*(ANALYZE INTENT|CHECK CONSTRAINTS|SELECT TONE|PLAN RESPONSE|CHECK MEMORY|EVALUATE TOOLS|EXECUTE PLAN|FORMAT OUTPUT|VERIFY RESULT)[:\s].*\n?/gmi, '');
  sanitized = sanitized.replace(/^(ANALYZE INTENT|CHECK CONSTRAINTS|SELECT TONE|PLAN RESPONSE|CHECK MEMORY|EVALUATE TOOLS|EXECUTE PLAN|FORMAT OUTPUT|VERIFY RESULT)[:\s].*\n?/gmi, '');
  
  // Remove tool-name prefixed JSON leaks
  for (const pattern of TOOL_LEAK_PATTERNS) {
    if (pattern.test(sanitized)) {
      const match = sanitized.match(pattern);
      if (match) {
        const startIndex = match.index || 0;
        let depth = 0;
        let endIndex = startIndex;
        let foundStart = false;
        
        for (let i = startIndex; i < sanitized.length; i++) {
          const char = sanitized[i];
          if (char === '{' || char === '[') {
            depth++;
            foundStart = true;
          } else if (char === '}' || char === ']') {
            depth--;
            if (foundStart && depth === 0) {
              endIndex = i + 1;
              break;
            }
          }
        }
        
        if (endIndex > startIndex) {
          sanitized = sanitized.slice(0, startIndex) + sanitized.slice(endIndex);
        }
      }
    }
  }
  
  // Remove internal message patterns (tool result echoes)
  for (const pattern of INTERNAL_MESSAGE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // ═══ NO-FLUFF FILTER: Strip robotic filler phrases ═══
  const FLUFF_PATTERNS = [
    /I hope this helps[.!]?\s*/gi,
    /Let me know if you need (?:more|any|further) (?:info|information|help|details|assistance)[.!]?\s*/gi,
    /Here is what I found[.:]\s*/gi,
    /Based on (?:the |my )?(?:search |tool )?results[,:]\s*/gi,
    /I(?:'m| am) happy to help[.!]?\s*/gi,
    /Feel free to (?:ask|reach out|let me know)[^.]*[.!]?\s*/gi,
    /Is there anything else (?:you(?:'d| would) like|I can help)[^?]*\??\s*/gi,
    /(?:Sure|Certainly|Of course|Absolutely)[!,]\s*/gi,
    /^(?:Great question|Good question)[!.]?\s*/gmi,
    /Don't hesitate to[^.]*[.!]?\s*/gi,
  ];

  for (const pattern of FLUFF_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Clean up any remaining artifacts and double spaces/newlines
  sanitized = sanitized
    .replace(/^\s*undefined\s*/gi, "")
    .replace(/^\s*null\s*/gi, "")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
  
  // Echo detection: if response matches user's input, it's a hallucination
  if (userPrompt) {
    const normalizedResponse = sanitized.toLowerCase().trim();
    const normalizedPrompt = userPrompt.toLowerCase().trim();
    if (normalizedResponse === normalizedPrompt || 
        normalizedResponse.startsWith(normalizedPrompt + " ")) {
      return "...";
    }
    // Only treat as echo if response is <2x prompt length (true echo, not legitimate reference)
    if (normalizedPrompt.length > 30 && 
        normalizedResponse.includes(normalizedPrompt) &&
        normalizedResponse.length < normalizedPrompt.length * 2) {
      return "...";
    }
  }

  // FALLBACK: Never return empty string — prevents "invisible messages"
  if (!sanitized || sanitized.length < 3) {
    return "...";
  }
  
  return sanitized;
}

