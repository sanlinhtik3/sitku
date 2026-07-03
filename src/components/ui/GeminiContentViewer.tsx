import { forwardRef } from 'react';
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { geminiProseClasses, cleanDatabaseContent } from '@/lib/geminiStyles';
import { cn } from '@/lib/utils';

interface GeminiContentViewerProps {
  content: string;
  type?: 'html' | 'markdown';
  className?: string;
}

// Unified content viewer component with Gemini-style formatting
export const GeminiContentViewer = forwardRef<HTMLDivElement, GeminiContentViewerProps>(
  ({ content, type = 'html', className }, ref) => {
    if (!content) return null;

    // Clean content from database
    const cleanedContent = cleanDatabaseContent(content);

    // For HTML content (from TipTap editor)
    if (type === 'html') {
      const sanitizedHtml = DOMPurify.sanitize(cleanedContent, {
        ALLOWED_TAGS: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
          'p', 'br', 'strong', 'em', 'u', 's', 
          'a', 'ul', 'ol', 'li', 
          'blockquote', 'code', 'pre', 
          'img', 'iframe',
          'table', 'thead', 'tbody', 'tr', 'td', 'th', 
          'hr', 'span', 'div'
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'allow', 'allowfullscreen', 'frameborder'],
        ALLOW_DATA_ATTR: false,
      });

      return (
        <div
          ref={ref}
          className={cn(geminiProseClasses, className)}
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      );
    }

    // For Markdown content
    return (
      <div ref={ref} className={cn(geminiProseClasses, className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ node, ...props }) => (
              <h1 className="text-3xl font-bold mb-6 mt-8 leading-tight text-foreground" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-2xl font-bold mb-4 mt-6 border-b border-border/30 pb-2 text-foreground" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-xl font-semibold mb-3 mt-5 text-foreground" {...props} />
            ),
            h4: ({ node, ...props }) => (
              <h4 className="text-lg font-semibold mb-2 mt-4 text-foreground" {...props} />
            ),
            p: ({ node, ...props }) => (
              <p className="text-base leading-relaxed mb-4 text-foreground/90" {...props} />
            ),
            a: ({ node, ...props }) => (
              <a className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />
            ),
            ul: ({ node, ...props }) => (
              <ul className="list-disc pl-5 my-2 space-y-0.5 text-foreground/90" {...props} />
            ),
            ol: ({ node, ...props }) => (
              <ol className="list-decimal pl-5 my-2 space-y-0.5 text-foreground/90" {...props} />
            ),
            li: ({ node, ...props }) => (
              <li className="text-foreground/90 my-0" {...props} />
            ),
            code: ({ node, inline, ...props }: any) =>
              inline ? (
                <code className="bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
              ) : (
                <code className="block bg-slate-900 border border-slate-700 p-4 rounded-lg text-sm font-mono overflow-x-auto text-slate-100" {...props} />
              ),
            pre: ({ node, ...props }) => (
              <pre className="bg-slate-900 border border-slate-700 rounded-lg overflow-x-auto my-4" {...props} />
            ),
            blockquote: ({ node, ...props }) => (
              <blockquote className="border-l-4 border-primary/50 bg-muted/30 py-2 px-4 rounded-r my-4 text-foreground/80" {...props} />
            ),
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border border-border rounded-lg overflow-hidden" {...props} />
              </div>
            ),
            th: ({ node, ...props }) => (
              <th className="px-4 py-3 bg-muted text-left font-semibold text-foreground" {...props} />
            ),
            td: ({ node, ...props }) => (
              <td className="px-4 py-3 border-t border-border text-foreground" {...props} />
            ),
            img: ({ node, ...props }) => (
              <img className="rounded-lg shadow-md my-4 max-w-full h-auto" {...props} />
            ),
            hr: ({ node, ...props }) => (
              <hr className="my-6 border-border" {...props} />
            ),
          }}
        >
          {cleanedContent}
        </ReactMarkdown>
      </div>
    );
  }
);

GeminiContentViewer.displayName = 'GeminiContentViewer';
