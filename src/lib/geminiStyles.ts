// Shared Gemini-style prose classes for consistent Editor & Viewer formatting
// Note: Must be a single line for Tiptap compatibility (no newlines in class strings)

export const geminiProseClasses = [
  // Base
  'prose prose-slate dark:prose-invert max-w-none leading-7',
  // Headers
  'prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground',
  'prose-h1:text-3xl prose-h1:mb-6 prose-h1:mt-8 prose-h1:leading-tight',
  'prose-h2:text-2xl prose-h2:mb-4 prose-h2:mt-6 prose-h2:border-b prose-h2:border-border/30 prose-h2:pb-2',
  'prose-h3:text-xl prose-h3:mb-3 prose-h3:mt-5',
  'prose-h4:text-lg prose-h4:mb-2 prose-h4:mt-4',
  // Paragraphs
  'prose-p:text-base prose-p:leading-relaxed prose-p:mb-4 prose-p:text-foreground/90',
  // Lists - Tight spacing like Gemini
  'prose-ul:my-2 prose-ul:pl-5 prose-ul:space-y-0.5',
  'prose-ol:my-2 prose-ol:pl-5 prose-ol:space-y-0.5',
  'prose-li:my-0 prose-li:text-foreground/90 prose-li:marker:text-primary/70',
  // Code - Dark theme
  'prose-code:bg-slate-800 prose-code:text-emerald-400 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:p-4',
  // Links
  'prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:font-medium',
  // Blockquotes
  'prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:bg-muted/30 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r prose-blockquote:not-italic prose-blockquote:font-normal',
  // Tables
  'prose-table:border prose-table:border-border prose-table:rounded-lg prose-table:overflow-hidden',
  'prose-th:bg-muted prose-th:p-3 prose-th:text-left prose-th:font-semibold',
  'prose-td:p-3 prose-td:border-t prose-td:border-border',
  // Images
  'prose-img:rounded-lg prose-img:shadow-md prose-img:my-4',
  // Strong/Bold & Emphasis
  'prose-strong:text-foreground prose-strong:font-semibold',
  'prose-em:text-foreground/90',
].join(' ');

// Content sanitization for consistent list formatting
export const sanitizeContent = (content: string): string => {
  if (!content) return '';
  
  return content
    // Fix double newlines before list items
    .replace(/\n\n+(?=[-*] )/g, '\n')
    .replace(/\n\n+(?=\d+\. )/g, '\n')
    // Fix broken list items (hyphen/asterisk then newline before text)
    .replace(/-\n(?=[A-Za-z\u1000-\u109F])/g, '- ')
    .replace(/\*\n(?=[A-Za-z\u1000-\u109F])/g, '* ')
    // Normalize list markers to hyphens
    .replace(/^\* /gm, '- ')
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, '\n\n');
};

// Clean content fetched from database (fix old broken lists)
export const cleanDatabaseContent = (content: string): string => {
  if (!content) return '';
  
  return sanitizeContent(content)
    // Additional fixes for database-stored broken formats
    .replace(/-\s*\n\s*(?=[A-Za-z\u1000-\u109F])/g, '- ')
    .replace(/•\s*/g, '- ');
};
