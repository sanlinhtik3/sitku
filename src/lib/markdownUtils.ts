import TurndownService from 'turndown';
import { sanitizeContent } from './geminiStyles';

// Initialize Turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  bulletListMarker: '-',
});

// Configure tight lists (no extra newlines between items)
turndownService.addRule('tightLists', {
  filter: ['ul', 'ol'],
  replacement: function (content, node) {
    const isOrdered = node.nodeName === 'OL';
    const items = content.trim().split('\n').filter(line => line.trim());
    
    return '\n' + items.map((item, index) => {
      const marker = isOrdered ? `${index + 1}. ` : '- ';
      const cleanItem = item.replace(/^[-*\d.]+\s*/, '');
      return marker + cleanItem;
    }).join('\n') + '\n';
  }
});

// Convert HTML to Markdown
export const htmlToMarkdown = (html: string): string => {
  const markdown = turndownService.turndown(html);
  return sanitizeContent(markdown);
};

// Convert Markdown to HTML (for TipTap editor initialization)
export const markdownToHtml = (markdown: string): string => {
  if (!markdown) return '';
  
  // Clean content first
  let cleaned = sanitizeContent(markdown);
  
  // Unescape markdown characters
  cleaned = cleaned
    .replace(/\\([#*_\[\]()])/g, '$1')
    .replace(/\\\\/g, '\\');
  
  // Process content line by line for proper list grouping
  const lines = cleaned.split('\n');
  let html = '';
  let inList = false;
  let listType = '';
  let listItems: string[] = [];
  
  const closeList = () => {
    if (inList && listItems.length > 0) {
      html += `<${listType}>${listItems.map(item => `<li>${item}</li>`).join('')}</${listType}>`;
      listItems = [];
      inList = false;
      listType = '';
    }
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Unordered list item
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        inList = true;
        listType = 'ul';
      }
      listItems.push(processInlineFormatting(ulMatch[1]));
      continue;
    }
    
    // Ordered list item
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        inList = true;
        listType = 'ol';
      }
      listItems.push(processInlineFormatting(olMatch[1]));
      continue;
    }
    
    // Close any open list before processing other content
    closeList();
    
    // Headers
    if (/^####\s+(.*)$/.test(line)) {
      html += `<h4>${processInlineFormatting(line.replace(/^####\s+/, ''))}</h4>`;
    } else if (/^###\s+(.*)$/.test(line)) {
      html += `<h3>${processInlineFormatting(line.replace(/^###\s+/, ''))}</h3>`;
    } else if (/^##\s+(.*)$/.test(line)) {
      html += `<h2>${processInlineFormatting(line.replace(/^##\s+/, ''))}</h2>`;
    } else if (/^#\s+(.*)$/.test(line)) {
      html += `<h1>${processInlineFormatting(line.replace(/^#\s+/, ''))}</h1>`;
    }
    // Blockquote
    else if (/^>\s+(.*)$/.test(line)) {
      html += `<blockquote><p>${processInlineFormatting(line.replace(/^>\s+/, ''))}</p></blockquote>`;
    }
    // Empty line = paragraph break
    else if (line.trim() === '') {
      // Skip empty lines (handled by paragraph structure)
    }
    // Regular text as paragraph
    else {
      html += `<p>${processInlineFormatting(line)}</p>`;
    }
  }
  
  // Close any remaining list
  closeList();
  
  return html;
};

// Process inline markdown formatting (bold, italic, links, code)
const processInlineFormatting = (text: string): string => {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
};
