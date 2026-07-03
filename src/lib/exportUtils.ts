import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType,
} from 'docx';
import { saveAs } from 'file-saver';

// ═══════════════════════════════════════════════════════════════
// EXPORT UTILITIES — Production-Grade File Generation
// ═══════════════════════════════════════════════════════════════

// ── Markdown Export ──────────────────────────────────────────
export const exportAsMarkdown = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  saveAs(blob, `${filename}.md`);
};

// ── PDF Export ────────────────────────────────────────────────
export const exportAsPDF = async (element: HTMLElement, filename: string) => {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const imgWidth = 210;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
  pdf.save(`${filename}.pdf`);
};

// ── CSV Export ────────────────────────────────────────────────
export const exportAsCSV = (markdownTable: string, filename: string) => {
  const lines = markdownTable.split('\n').filter(l => l.trim());
  const csvRows: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.slice(1, -1).split('|').map(cell => {
        const cleaned = cell.trim().replace(/"/g, '""');
        return `"${cleaned}"`;
      });
      csvRows.push(cells.join(','));
    } else {
      csvRows.push(`"${trimmed.replace(/"/g, '""')}"`);
    }
  }
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${filename}.csv`);
};

// ── JSON Export ───────────────────────────────────────────────
export const exportAsJSON = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  saveAs(blob, `${filename}.json`);
};

// ═══════════════════════════════════════════════════════════════
// RICH TEXT PARSER — Converts markdown inline syntax to TextRun[]
// Handles: ***bold-italic***, **bold**, *italic*, `code`
// ═══════════════════════════════════════════════════════════════

const FONT_FAMILY = 'Calibri';
const FONT_SIZE_PT = 11;
const CODE_FONT = 'Consolas';

function parseInlineFormatting(text: string, baseOpts?: Partial<{ bold: boolean; size: number; font: string; color: string }>): TextRun[] {
  const runs: TextRun[] = [];
  // Regex that matches bold-italic, bold, italic, and inline code in order of priority
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      runs.push(new TextRun({
        text: text.slice(lastIndex, match.index),
        font: baseOpts?.font || FONT_FAMILY,
        size: baseOpts?.size || FONT_SIZE_PT * 2,
        bold: baseOpts?.bold,
        color: baseOpts?.color,
      }));
    }

    if (match[2]) {
      // ***bold-italic***
      runs.push(new TextRun({
        text: match[2],
        bold: true,
        italics: true,
        font: baseOpts?.font || FONT_FAMILY,
        size: baseOpts?.size || FONT_SIZE_PT * 2,
        color: baseOpts?.color,
      }));
    } else if (match[3]) {
      // **bold**
      runs.push(new TextRun({
        text: match[3],
        bold: true,
        font: baseOpts?.font || FONT_FAMILY,
        size: baseOpts?.size || FONT_SIZE_PT * 2,
        color: baseOpts?.color,
      }));
    } else if (match[4]) {
      // *italic*
      runs.push(new TextRun({
        text: match[4],
        italics: true,
        font: baseOpts?.font || FONT_FAMILY,
        size: baseOpts?.size || FONT_SIZE_PT * 2,
        color: baseOpts?.color,
      }));
    } else if (match[5]) {
      // `code`
      runs.push(new TextRun({
        text: match[5],
        font: CODE_FONT,
        size: baseOpts?.size || FONT_SIZE_PT * 2,
        color: '666666',
        shading: { type: ShadingType.CLEAR, fill: 'F0F0F0', color: 'auto' },
      }));
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    runs.push(new TextRun({
      text: text.slice(lastIndex),
      font: baseOpts?.font || FONT_FAMILY,
      size: baseOpts?.size || FONT_SIZE_PT * 2,
      bold: baseOpts?.bold,
      color: baseOpts?.color,
    }));
  }

  // If nothing was parsed, return the whole text as a single run
  if (runs.length === 0) {
    runs.push(new TextRun({
      text,
      font: baseOpts?.font || FONT_FAMILY,
      size: baseOpts?.size || FONT_SIZE_PT * 2,
      bold: baseOpts?.bold,
      color: baseOpts?.color,
    }));
  }

  return runs;
}

// ═══════════════════════════════════════════════════════════════
// TABLE PARSER — Converts markdown tables to docx Table objects
// ═══════════════════════════════════════════════════════════════

const BORDER_STYLE = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: 'CCCCCC',
};

function parseMarkdownTable(tableLines: string[]): Table {
  const rows: string[][] = [];
  let hasHeader = false;

  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i].trim();
    // Skip separator lines
    if (/^\|[\s\-:|]+\|$/.test(line)) {
      if (i === 1) hasHeader = true;
      continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    return new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Empty table')] })] })] });
  }

  const colCount = Math.max(...rows.map(r => r.length));
  const borders = { top: BORDER_STYLE, bottom: BORDER_STYLE, left: BORDER_STYLE, right: BORDER_STYLE };

  const tableRows = rows.map((cells, rowIdx) => {
    const isHeaderRow = hasHeader && rowIdx === 0;
    const tableCells = Array.from({ length: colCount }, (_, colIdx) => {
      const cellText = cells[colIdx] || '';
      return new TableCell({
        children: [new Paragraph({
          children: parseInlineFormatting(cellText, isHeaderRow ? { bold: true } : undefined),
          spacing: { before: 40, after: 40 },
        })],
        borders,
        shading: isHeaderRow
          ? { type: ShadingType.CLEAR, fill: 'E8E8E8', color: 'auto' }
          : undefined,
        width: { size: Math.floor(9000 / colCount), type: WidthType.DXA },
      });
    });
    return new TableRow({ children: tableCells });
  });

  return new Table({
    rows: tableRows,
    width: { size: 9000, type: WidthType.DXA },
  });
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN → DOCX CONVERTER — Full block-level + inline support
// ═══════════════════════════════════════════════════════════════

type DocxChild = Paragraph | Table;

function markdownToDocx(markdown: string): DocxChild[] {
  const lines = markdown.split('\n');
  const children: DocxChild[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') { i++; continue; }

    // ── Fenced code block detection ──
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++; // skip opening fence
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      for (const codeLine of codeLines) {
        children.push(new Paragraph({
          children: [new TextRun({
            text: codeLine || ' ',
            font: CODE_FONT,
            size: FONT_SIZE_PT * 2,
            color: '333333',
          })],
          spacing: { after: 20 },
          shading: { type: ShadingType.CLEAR, fill: 'F5F5F5', color: 'auto' },
          indent: { left: 360 },
        }));
      }
      children.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    // ── Table detection: collect consecutive | lines ──
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        children.push(parseMarkdownTable(tableLines));
        children.push(new Paragraph({ spacing: { after: 120 } })); // spacer
      } else {
        // Single pipe line — treat as paragraph
        children.push(new Paragraph({
          children: parseInlineFormatting(tableLines[0]),
          spacing: { after: 120 },
        }));
      }
      continue;
    }

    // ── Headings ──
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
      };
      children.push(new Paragraph({
        children: parseInlineFormatting(headingMatch[2], { bold: true }),
        heading: headingMap[level] || HeadingLevel.HEADING_4,
        spacing: { before: 240, after: 120 },
      }));
      i++;
      continue;
    }

    // ── Bullet list ──
    if (/^[-*]\s+/.test(trimmed)) {
      children.push(new Paragraph({
        children: parseInlineFormatting(trimmed.replace(/^[-*]\s+/, '')),
        bullet: { level: 0 },
        spacing: { after: 60 },
      }));
      i++;
      continue;
    }

    // ── Numbered list ──
    if (/^\d+\.\s+/.test(trimmed)) {
      children.push(new Paragraph({
        children: parseInlineFormatting(trimmed.replace(/^\d+\.\s+/, '')),
        numbering: { reference: 'beebot-numbering', level: 0 },
        spacing: { after: 60 },
      }));
      i++;
      continue;
    }

    // ── Blockquote ──
    if (trimmed.startsWith('> ')) {
      children.push(new Paragraph({
        children: parseInlineFormatting(trimmed.replace(/^>\s+/, ''), { color: '555555' }),
        indent: { left: 720 },
        border: { left: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 10 } },
        spacing: { before: 120, after: 120 },
      }));
      i++;
      continue;
    }

    // ── Horizontal rule ──
    if (/^[-*_]{3,}$/.test(trimmed)) {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC', space: 8 } },
        spacing: { before: 200, after: 200 },
      }));
      i++;
      continue;
    }

    // ── Regular paragraph ──
    children.push(new Paragraph({
      children: parseInlineFormatting(trimmed),
      spacing: { after: 120 },
    }));
    i++;
  }

  return children;
}

// ═══════════════════════════════════════════════════════════════
// WORD EXPORT — Professional document with numbering config
// ═══════════════════════════════════════════════════════════════

export const exportAsWord = async (content: string, title: string, filename: string) => {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'beebot-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal' as any,
              text: '%1.',
              alignment: AlignmentType.START,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: FONT_FAMILY, size: FONT_SIZE_PT * 2 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          new Paragraph({
            children: parseInlineFormatting(title, { bold: true, size: 32 * 2 }),
            heading: HeadingLevel.TITLE,
            spacing: { after: 300 },
          }),
          ...markdownToDocx(content),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.docx`);
};
