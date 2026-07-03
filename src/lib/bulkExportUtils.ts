import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';

export interface ContentItem {
  id: string;
  title: string;
  content: string;
  topic?: string;
  tone?: string;
  style?: string;
  language?: string;
  category?: string;
  created_at: string;
  is_template?: boolean;
  tags?: string[];
  user_id: string;
}

// Export as CSV
export const exportAsCSV = (contents: ContentItem[], filename: string) => {
  const headers = ['Title', 'Category', 'Topic', 'Tone', 'Style', 'Language', 'Created At', 'Is Template', 'Tags', 'Content Preview'];
  
  const rows = contents.map(content => [
    `"${content.title.replace(/"/g, '""')}"`,
    `"${content.category || 'uncategorized'}"`,
    `"${content.topic || ''}"`,
    `"${content.tone || ''}"`,
    `"${content.style || ''}"`,
    `"${content.language || ''}"`,
    `"${new Date(content.created_at).toLocaleString()}"`,
    content.is_template ? 'Yes' : 'No',
    `"${content.tags?.join(', ') || ''}"`,
    `"${content.content.substring(0, 100).replace(/"/g, '""')}..."`,
  ]);
  
  const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${filename}.csv`);
};

// Export multiple contents as combined Markdown
export const exportAsCombinedMarkdown = (contents: ContentItem[], filename: string) => {
  const markdown = contents.map(content => {
    return `# ${content.title}

**Category:** ${content.category || 'Uncategorized'}  
**Topic:** ${content.topic || 'N/A'}  
**Tone:** ${content.tone || 'N/A'}  
**Style:** ${content.style || 'N/A'}  
**Language:** ${content.language || 'N/A'}  
**Created:** ${new Date(content.created_at).toLocaleString()}

---

${content.content}

---

`;
  }).join('\n\n');
  
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  saveAs(blob, `${filename}.md`);
};

// Export multiple contents as separate Markdown files in a zip
export const exportAsZippedMarkdown = async (contents: ContentItem[], filename: string) => {
  // Note: This would require a zip library like JSZip
  // For now, we'll export as a single combined file
  exportAsCombinedMarkdown(contents, filename);
};

// Export as Word document
export const exportAsCombinedWord = async (contents: ContentItem[], filename: string) => {
  try {
    const paragraphs: Paragraph[] = [];
    
    contents.forEach((content, index) => {
      // Add title
      paragraphs.push(
        new Paragraph({
          text: content.title,
          heading: HeadingLevel.HEADING_1,
        })
      );
      
      // Add metadata
      paragraphs.push(
        new Paragraph({
          text: `Category: ${content.category || 'Uncategorized'}`,
        })
      );
      
      paragraphs.push(
        new Paragraph({
          text: `Topic: ${content.topic || 'N/A'} | Tone: ${content.tone || 'N/A'} | Style: ${content.style || 'N/A'}`,
        })
      );
      
      paragraphs.push(
        new Paragraph({
          text: `Created: ${new Date(content.created_at).toLocaleString()}`,
        })
      );
      
      paragraphs.push(new Paragraph({ text: '' })); // Empty line
      
      // Add content (simplified - splits by lines)
      const contentLines = content.content.split('\n');
      contentLines.forEach(line => {
        if (line.trim()) {
          paragraphs.push(new Paragraph({ text: line }));
        }
      });
      
      // Add separator between documents
      if (index < contents.length - 1) {
        paragraphs.push(new Paragraph({ text: '---' }));
        paragraphs.push(new Paragraph({ text: '' }));
      }
    });
    
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs,
        },
      ],
    });
    
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${filename}.docx`);
  } catch (error) {
    console.error('Error exporting Word document:', error);
    throw error;
  }
};
