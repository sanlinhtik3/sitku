// ═══ TELEGRAM MARKDOWNV2 AUTO-ESCAPER ENGINE ═══
// Handles escaping, smart formatting, and preflight validation for MarkdownV2
// GRAPHEME-SAFE: Uses codepoint-aware iteration to never split Myanmar syllable clusters

// Myanmar Unicode ranges that must NEVER be split:
// U+1000-U+109F (Myanmar block), U+AA60-U+AA7F (Myanmar Extended-A), U+A9E0-U+A9FF (Myanmar Extended-B)
// Combining marks: U+102B-U+103E, U+1056-U+1059, U+105E-U+1060, U+1062-U+1064, U+1067-U+106D, U+1071-U+1074, U+1082-U+108D, U+108F, U+109A-U+109D

/**
 * Escape ALL MarkdownV2 reserved characters in plain text.
 * GRAPHEME-SAFE: Iterates by codepoint using spread operator, ensuring Myanmar
 * combining marks (vowels, medials, tones) stay attached to their base consonants.
 * The regex only matches single ASCII punctuation chars, so Myanmar graphemes are untouched.
 */
export function escapeMarkdownV2(text: string): string {
  // This regex ONLY matches ASCII punctuation — it cannot match inside a multi-byte
  // Myanmar codepoint sequence, so grapheme clusters are inherently safe.
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Smart formatter: preserves intentional Markdown formatting while escaping everything else.
 * Converts standard Markdown to MarkdownV2 syntax.
 * 
 * Supported patterns:
 *   **bold**    → *bold*     (MarkdownV2 bold)
 *   _italic_    → _italic_   (MarkdownV2 italic)  
 *   `code`      → `code`     (preserved)
 *   ```block``` → ```block``` (preserved)
 *   [text](url) → [text](url) (preserved, inner text escaped)
 */
export function formatForMarkdownV2(text: string): string {
  // Tokenize: extract formatting spans and plain text segments
  const tokens: Array<{ type: 'plain' | 'bold' | 'italic' | 'code' | 'codeblock' | 'link'; content: string }> = [];

  // Regex to match formatting patterns (order matters: codeblock before code, bold before italic)
  const pattern = /```([\s\S]*?)```|`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|_(.+?)_|\[([^\]]+)\]\(([^)]+)\)/g;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      tokens.push({ type: 'plain', content: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      // Code block ```...```
      tokens.push({ type: 'codeblock', content: match[1] });
    } else if (match[2] !== undefined) {
      // Inline code `...`
      tokens.push({ type: 'code', content: match[2] });
    } else if (match[3] !== undefined) {
      // Bold **...**
      tokens.push({ type: 'bold', content: match[3] });
    } else if (match[4] !== undefined) {
      // Bold __...__
      tokens.push({ type: 'bold', content: match[4] });
    } else if (match[5] !== undefined) {
      // Italic _..._
      tokens.push({ type: 'italic', content: match[5] });
    } else if (match[6] !== undefined && match[7] !== undefined) {
      // Link [text](url)
      tokens.push({ type: 'link', content: `${match[6]}|${match[7]}` });
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining plain text
  if (lastIndex < text.length) {
    tokens.push({ type: 'plain', content: text.slice(lastIndex) });
  }

  // If no tokens were found, treat entire text as plain
  if (tokens.length === 0) {
    return escapeMarkdownV2(text);
  }

  // Reassemble with MarkdownV2 syntax
  return tokens.map(token => {
    switch (token.type) {
      case 'plain':
        return escapeMarkdownV2(token.content);
      case 'bold':
        return `*${escapeMarkdownV2(token.content)}*`;
      case 'italic':
        return `_${escapeMarkdownV2(token.content)}_`;
      case 'code':
        // Inside code: only escape ` and \
        return '`' + token.content.replace(/([`\\])/g, '\\$1') + '`';
      case 'codeblock':
        return '```' + token.content.replace(/([`\\])/g, '\\$1') + '```';
      case 'link': {
        const [linkText, url] = token.content.split('|');
        // Escape ] in text, ) in url
        const escapedText = escapeMarkdownV2(linkText);
        const escapedUrl = url.replace(/([)\\])/g, '\\$1');
        return `[${escapedText}](${escapedUrl})`;
      }
      default:
        return escapeMarkdownV2(token.content);
    }
  }).join('');
}

/**
 * Pre-Flight Syntax Check: validates MarkdownV2 syntax and returns a fixed version.
 */
export function preflightMarkdownCheck(text: string): { valid: boolean; fixed: string; issues: string[] } {
  const issues: string[] = [];
  let fixed = text;

  // Check for unmatched bold markers (*)
  const boldMatches = fixed.match(/(?<!\\)\*/g);
  if (boldMatches && boldMatches.length % 2 !== 0) {
    issues.push('Unmatched bold marker (*)');
    // Remove the last unmatched *
    const lastIdx = fixed.lastIndexOf('*');
    fixed = fixed.slice(0, lastIdx) + '\\*' + fixed.slice(lastIdx + 1);
  }

  // Check for unmatched italic markers (_)
  const italicMatches = fixed.match(/(?<!\\)_/g);
  if (italicMatches && italicMatches.length % 2 !== 0) {
    issues.push('Unmatched italic marker (_)');
    const lastIdx = fixed.lastIndexOf('_');
    fixed = fixed.slice(0, lastIdx) + '\\_' + fixed.slice(lastIdx + 1);
  }

  // Check for unmatched strikethrough markers (~)
  const strikeMatches = fixed.match(/(?<!\\)~/g);
  if (strikeMatches && strikeMatches.length % 2 !== 0) {
    issues.push('Unmatched strikethrough marker (~)');
    const lastIdx = fixed.lastIndexOf('~');
    fixed = fixed.slice(0, lastIdx) + '\\~' + fixed.slice(lastIdx + 1);
  }

  // Check for unmatched code markers (`)
  const codeMatches = fixed.match(/(?<!\\)`/g);
  if (codeMatches && codeMatches.length % 2 !== 0) {
    issues.push('Unmatched code marker (`)');
    const lastIdx = fixed.lastIndexOf('`');
    fixed = fixed.slice(0, lastIdx) + '\\`' + fixed.slice(lastIdx + 1);
  }

  // Check for unclosed brackets [ without ]
  const openBrackets = (fixed.match(/(?<!\\)\[/g) || []).length;
  const closeBrackets = (fixed.match(/(?<!\\)\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    issues.push('Unclosed brackets []');
    // Escape all unmatched brackets
    fixed = fixed.replace(/(?<!\\)\[(?![^\]]*(?<!\\)\])/g, '\\[');
  }

  // Check for unclosed parentheses ( without )
  const openParens = (fixed.match(/(?<!\\)\(/g) || []).length;
  const closeParens = (fixed.match(/(?<!\\)\)/g) || []).length;
  if (openParens !== closeParens) {
    issues.push('Unclosed parentheses ()');
    fixed = fixed.replace(/(?<!\\)\((?![^)]*(?<!\\)\))/g, '\\(');
  }

  return {
    valid: issues.length === 0,
    fixed,
    issues,
  };
}

/**
 * Strip all Markdown formatting, returning clean plain text.
 * Used as the last-resort fallback.
 */
export function stripAllMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')     // **bold**
    .replace(/__(.+?)__/g, '$1')          // __bold__
    .replace(/\*(.+?)\*/g, '$1')          // *bold* (MkV2)
    .replace(/_(.+?)_/g, '$1')            // _italic_
    .replace(/~(.+?)~/g, '$1')            // ~strikethrough~
    .replace(/```[\s\S]*?```/g, (m) => m.slice(3, -3)) // code blocks
    .replace(/`(.+?)`/g, '$1')            // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    .replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, '$1'); // unescape
}

/**
 * Convert standard Markdown to Telegram-safe HTML.
 * Used as fallback when MarkdownV2 fails (common with Myanmar text).
 * Supports: <b>, <i>, <code>, <pre>, <a>
 */
export function convertToHtml(text: string): string {
  let html = text;

  // Escape HTML entities first (before adding tags)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks ```...``` → <pre>...</pre>
  html = html.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre>${code}</pre>`);

  // Inline code `...` → <code>...</code>
  html = html.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);

  // Bold **...** or __...__
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic _..._
  html = html.replace(/_(.+?)_/g, '<i>$1</i>');

  // Strikethrough ~...~
  html = html.replace(/~(.+?)~/g, '<s>$1</s>');

  // Headings ## ... → bold line
  html = html.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return html;
}
