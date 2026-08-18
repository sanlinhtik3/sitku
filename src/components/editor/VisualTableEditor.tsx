import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, AlignLeft, AlignCenter, AlignRight, Table as TableIcon, Code, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorView } from "@codemirror/view";

export type ColumnAlign = "left" | "center" | "right";

export interface VisualTableEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMarkdown?: string;
  onApply: (formattedMarkdown: string) => void;
}

export function parseMarkdownTable(md: string): { headers: string[]; rows: string[][]; aligns: ColumnAlign[] } {
  const lines = md.trim().split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (lines.length < 2) {
    return {
      headers: ["Column 1", "Column 2"],
      rows: [["Cell 1", "Cell 2"]],
      aligns: ["left", "left"],
    };
  }

  const parseRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      // ponytail: unescape \| when reading into editor so inline formulas/pipes don't get split or corrupted!
      .map((cell) => cell.replace(/\\\|/g, "|").trim());

  const headers = parseRow(lines[0]);
  const alignRow = parseRow(lines[1]);
  const aligns: ColumnAlign[] = headers.map((_, i) => {
    const a = alignRow[i] || "";
    if (a.startsWith(":") && a.endsWith(":")) return "center";
    if (a.endsWith(":")) return "right";
    return "left";
  });

  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const r = parseRow(lines[i]);
    // Ensure row has same number of columns as headers
    while (r.length < headers.length) r.push("");
    rows.push(r.slice(0, headers.length));
  }

  if (rows.length === 0) {
    rows.push(headers.map(() => ""));
  }

  return { headers, rows, aligns };
}

export function formatMarkdownTable(headers: string[], rows: string[][], aligns: ColumnAlign[]): string {
  const colWidths = headers.map((h, i) => {
    let max = Math.max(3, h.length);
    for (const row of rows) {
      if ((row[i] || "").length > max) max = row[i].length;
    }
    return max;
  });

  const pad = (str: string, width: number, align: ColumnAlign) => {
    // ponytail: escape any unescaped pipes when saving back to markdown table so syntax remains valid!
    const s = (str || "").replace(/(?<!\\)\|/g, "\\|");
    if (align === "right") return s.padStart(width, " ");
    if (align === "center") {
      const leftPad = Math.floor((width - s.length) / 2);
      const rightPad = width - s.length - leftPad;
      return " ".repeat(leftPad) + s + " ".repeat(rightPad);
    }
    return s.padEnd(width, " ");
  };

  const headerLine = "| " + headers.map((h, i) => pad(h, colWidths[i], aligns[i])).join(" | ") + " |";
  const separatorLine =
    "| " +
    aligns
      .map((a, i) => {
        const w = colWidths[i];
        if (a === "center") return ":" + "-".repeat(Math.max(1, w - 2)) + ":";
        if (a === "right") return "-".repeat(Math.max(2, w - 1)) + ":";
        return "-".repeat(w);
      })
      .join(" | ") +
    " |";

  const rowLines = rows.map((row) => "| " + headers.map((_, i) => pad(row[i] || "", colWidths[i], aligns[i])).join(" | ") + " |");

  return [headerLine, separatorLine, ...rowLines].join("\n");
}

export function VisualTableEditor({ open, onOpenChange, initialMarkdown = "", onApply }: VisualTableEditorProps) {
  const [headers, setHeaders] = useState<string[]>(["Column 1", "Column 2"]);
  const [rows, setRows] = useState<string[][]>([["Cell 1", "Cell 2"]]);
  const [aligns, setAligns] = useState<ColumnAlign[]>(["left", "left"]);

  useEffect(() => {
    if (open) {
      const parsed = parseMarkdownTable(initialMarkdown);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setAligns(parsed.aligns);
    }
  }, [open, initialMarkdown]);

  const addColumn = () => {
    const nextIdx = headers.length + 1;
    setHeaders([...headers, `Column ${nextIdx}`]);
    setAligns([...aligns, "left"]);
    setRows(rows.map((r) => [...r, ""]));
  };

  const removeColumn = (colIndex: number) => {
    if (headers.length <= 1) return;
    setHeaders(headers.filter((_, i) => i !== colIndex));
    setAligns(aligns.filter((_, i) => i !== colIndex));
    setRows(rows.map((r) => r.filter((_, i) => i !== colIndex)));
  };

  const addRow = () => {
    setRows([...rows, headers.map(() => "")]);
  };

  const removeRow = (rowIndex: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== rowIndex));
  };

  const updateHeader = (index: number, val: string) => {
    const next = [...headers];
    next[index] = val;
    setHeaders(next);
  };

  const updateCell = (rowIdx: number, colIdx: number, val: string) => {
    const next = rows.map((r) => [...r]);
    next[rowIdx][colIdx] = val;
    setRows(next);
  };

  const cycleAlign = (colIndex: number) => {
    const next = [...aligns];
    const curr = next[colIndex];
    next[colIndex] = curr === "left" ? "center" : curr === "center" ? "right" : "left";
    setAligns(next);
  };

  const handleSave = () => {
    const md = formatMarkdownTable(headers, rows, aligns);
    onApply(md);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden bg-[var(--bb-bg-1)] border-[var(--bb-border-strong)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[var(--bb-text-1)]">
            <TableIcon className="h-5 w-5 text-[var(--beebot-accent,#f4d35e)]" />
            <span>Table Editor</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-2 my-2 border border-[var(--bb-border)] rounded-xl bg-[var(--bb-bg-0)]">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--bb-border-strong)] bg-[var(--bb-bg-2)]">
                  <th className="p-2 w-10 text-center font-mono text-xs text-[var(--bb-text-3)]">#</th>
                  {headers.map((h, colIdx) => (
                    <th key={colIdx} className="p-2 border-l border-[var(--bb-border)] min-w-[140px]">
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={h}
                          onChange={(e) => updateHeader(colIdx, e.target.value)}
                          className="h-8 font-semibold text-xs bg-[var(--bb-bg-1)] border-[var(--bb-border)] text-[var(--bb-text-1)]"
                          placeholder={`Col ${colIdx + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => cycleAlign(colIdx)}
                          className="p-1 rounded hover:bg-[var(--bb-bg-3)] text-[var(--bb-text-2)] transition-colors"
                          title={`Align: ${aligns[colIdx]}`}
                        >
                          {aligns[colIdx] === "left" && <AlignLeft className="h-3.5 w-3.5" />}
                          {aligns[colIdx] === "center" && <AlignCenter className="h-3.5 w-3.5 text-[var(--beebot-accent,#f4d35e)]" />}
                          {aligns[colIdx] === "right" && <AlignRight className="h-3.5 w-3.5" />}
                        </button>
                        {headers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeColumn(colIdx)}
                            className="p-1 rounded hover:bg-red-500/10 text-red-400 transition-colors"
                            title="Remove column"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="p-2 text-left w-24">
                    <Button type="button" variant="outline" size="sm" onClick={addColumn} className="h-8 text-xs gap-1 border-dashed border-[var(--bb-border-strong)]">
                      <Plus className="h-3.5 w-3.5" /> Col
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-[var(--bb-border)] hover:bg-[var(--bb-bg-1)]/50 transition-colors">
                    <td className="p-2 text-center font-mono text-xs text-[var(--bb-text-3)]">
                      <div className="flex items-center justify-center gap-1">
                        <span>{rowIdx + 1}</span>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(rowIdx)}
                            className="p-0.5 rounded hover:bg-red-500/10 text-red-400 opacity-60 hover:opacity-100 transition-opacity"
                            title="Delete row"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    {headers.map((_, colIdx) => (
                      <td key={colIdx} className="p-1.5 border-l border-[var(--bb-border)]">
                        <Input
                          value={row[colIdx] || ""}
                          onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                          className={cn(
                            "h-8 text-sm bg-transparent border-transparent focus:border-[var(--beebot-accent,#f4d35e)] focus:bg-[var(--bb-bg-1)] text-[var(--bb-text-1)] transition-all",
                            aligns[colIdx] === "center" && "text-center",
                            aligns[colIdx] === "right" && "text-right"
                          )}
                          placeholder="..."
                        />
                      </td>
                    ))}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1 border-dashed border-[var(--bb-border-strong)] text-[var(--bb-text-1)]">
            <Plus className="h-4 w-4" /> Add Row
          </Button>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-[var(--bb-text-2)]">
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} className="bg-[var(--beebot-accent,#f4d35e)] text-black hover:bg-[var(--beebot-accent,#f4d35e)]/90 font-semibold gap-1.5">
              <TableIcon className="h-4 w-4" /> Apply Table to Note
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface NotionTableCardProps {
  initialMarkdown: string;
  from?: number;
  to?: number;
  view?: EditorView;
  editable?: boolean;
  onUpdateMarkdown?: (md: string) => void;
}

export function NotionTableCard({
  initialMarkdown = "",
  from,
  to,
  view,
  editable = true,
  onUpdateMarkdown,
}: NotionTableCardProps) {
  const [headers, setHeaders] = useState<string[]>(["Column 1", "Column 2"]);
  const [rows, setRows] = useState<string[][]>([["Cell 1", "Cell 2"]]);
  const [aligns, setAligns] = useState<ColumnAlign[]>(["left", "left"]);
  const [isRawMode, setIsRawMode] = useState(false);
  const [rawText, setRawText] = useState(initialMarkdown);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const parsed = parseMarkdownTable(initialMarkdown);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setAligns(parsed.aligns);
    setRawText(initialMarkdown);
  }, [initialMarkdown]);

  const commitTable = (nextHeaders: string[], nextRows: string[][], nextAligns: ColumnAlign[]) => {
    setHeaders(nextHeaders);
    setRows(nextRows);
    setAligns(nextAligns);
    const md = formatMarkdownTable(nextHeaders, nextRows, nextAligns);
    setRawText(md);
    if (onUpdateMarkdown) onUpdateMarkdown(md);
    if (editable && view && from !== undefined && to !== undefined) {
      let actualFrom = from;
      let actualTo = to;
      try {
        const line = view.state.doc.lineAt(from);
        const startLn = line.number;
        let endLn = startLn;
        while (endLn + 1 <= view.state.doc.lines && view.state.doc.line(endLn + 1).text.trim().includes("|")) {
          endLn += 1;
        }
        actualFrom = view.state.doc.line(startLn).from;
        actualTo = view.state.doc.line(endLn).to;
      } catch (e) {
        // Fallback to prop from/to if lineAt fails
      }
      view.dispatch({
        changes: { from: actualFrom, to: actualTo, insert: md },
      });
    }
  };

  const addColumn = () => {
    const nextIdx = headers.length + 1;
    const nextHeaders = [...headers, `Column ${nextIdx}`];
    const nextAligns: ColumnAlign[] = [...aligns, "left"];
    const nextRows = rows.map((r) => [...r, ""]);
    commitTable(nextHeaders, nextRows, nextAligns);
  };

  const removeColumn = (colIndex: number) => {
    if (headers.length <= 1) return;
    const nextHeaders = headers.filter((_, i) => i !== colIndex);
    const nextAligns = aligns.filter((_, i) => i !== colIndex);
    const nextRows = rows.map((r) => r.filter((_, i) => i !== colIndex));
    commitTable(nextHeaders, nextRows, nextAligns);
  };

  const addRow = () => {
    const nextRows = [...rows, headers.map(() => "")];
    commitTable(headers, nextRows, aligns);
  };

  const removeRow = (rowIndex: number) => {
    if (rows.length <= 1) return;
    const nextRows = rows.filter((_, i) => i !== rowIndex);
    commitTable(headers, nextRows, aligns);
  };

  const updateHeader = (index: number, val: string) => {
    const nextHeaders = [...headers];
    nextHeaders[index] = val;
    commitTable(nextHeaders, rows, aligns);
  };

  const updateCell = (rowIdx: number, colIdx: number, val: string) => {
    const nextRows = rows.map((r) => [...r]);
    nextRows[rowIdx][colIdx] = val;
    commitTable(headers, nextRows, aligns);
  };

  const cycleAlign = (colIndex: number) => {
    const nextAligns = [...aligns];
    const curr = nextAligns[colIndex];
    nextAligns[colIndex] = curr === "left" ? "center" : curr === "center" ? "right" : "left";
    commitTable(headers, rows, nextAligns);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRawSave = () => {
    setIsRawMode(false);
    const parsed = parseMarkdownTable(rawText);
    commitTable(parsed.headers, parsed.rows, parsed.aligns);
  };

  const controlClass = "grid h-7 w-7 place-items-center rounded-[var(--bb-radius-control)] text-[var(--bb-text-3)] transition-colors hover:bg-[var(--bb-bg-2)] hover:text-[var(--bb-text-1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--beebot-accent,#f4d35e)]";

  return (
    <div className="cm-table-interactive group/table my-5 min-w-0 max-w-full not-prose text-[var(--bb-text-1)]">
      <div className="mb-1 flex min-h-7 items-center justify-between gap-2 px-1 text-[10px] text-[var(--bb-text-4)]">
        <div className="flex items-center gap-1.5" aria-label={`${headers.length} columns and ${rows.length} rows`}>
          <TableIcon className="h-3.5 w-3.5" />
          <span className="font-mono tabular-nums">{headers.length} × {rows.length}</span>
        </div>

        <div className="flex items-center gap-0.5 opacity-65 transition-opacity group-hover/table:opacity-100 group-focus-within/table:opacity-100">
          {editable && !isRawMode && (
            <>
              <button type="button" onClick={addColumn} className={controlClass} title="Add column" aria-label="Add column">
                <span className="relative"><TableIcon className="h-3.5 w-3.5" /><Plus className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-[var(--bb-bg-0)] text-[var(--beebot-accent,#f4d35e)]" /></span>
              </button>
              <button type="button" onClick={addRow} className={controlClass} title="Add row" aria-label="Add row">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button type="button" onClick={handleCopy} className={controlClass} title="Copy Markdown" aria-label="Copy Markdown table">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {editable && (
            <button type="button" onClick={() => setIsRawMode(!isRawMode)} className={controlClass} title={isRawMode ? "Show table" : "Edit Markdown"} aria-label={isRawMode ? "Show table" : "Edit Markdown table"}>
              <Code className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isRawMode ? (
        <div className="border-y border-[var(--bb-border)] py-2">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="h-40 w-full resize-y bg-transparent px-2 py-2 font-mono text-xs leading-5 text-[var(--bb-text-1)] outline-none selection:bg-[var(--beebot-accent,#f4d35e)]/25"
            placeholder="| Col 1 | Col 2 |..."
          />
          <div className="flex justify-end px-1 pt-1">
            <Button type="button" size="sm" onClick={handleRawSave} className="h-7 rounded-[var(--bb-radius-control)] bg-[var(--beebot-accent,#f4d35e)] px-3 text-[11px] font-semibold text-black hover:bg-[var(--beebot-accent,#f4d35e)]/90">
              Apply
            </Button>
          </div>
        </div>
      ) : (
        <div className="w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-max border-collapse text-[13px] leading-[1.5]">
            <thead>
              <tr className="border-b border-[var(--bb-border-strong)]">
                {headers.map((h, colIdx) => (
                  <th key={colIdx} className="group/th min-w-[150px] px-3 py-2 text-left first:pl-1 last:pr-1">
                    <div className="flex items-center gap-1">
                      {editable ? (
                        <input
                          type="text"
                          value={h}
                          onChange={(e) => updateHeader(colIdx, e.target.value)}
                          className="min-w-0 flex-1 rounded-[5px] bg-transparent px-1 py-0.5 text-[13px] font-semibold text-[var(--bb-text-1)] outline-none transition-colors placeholder:text-[var(--bb-text-4)] focus:bg-[var(--bb-bg-2)] focus:ring-1 focus:ring-[var(--bb-border-strong)]"
                          placeholder={`Column ${colIdx + 1}`}
                        />
                      ) : <span className="block flex-1 px-1 py-0.5 text-[13px] font-semibold">{h}</span>}

                      {editable && (
                        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/th:opacity-100 group-focus-within/th:opacity-100">
                          <button type="button" onClick={() => cycleAlign(colIdx)} className={controlClass} title={`Align ${aligns[colIdx]}`} aria-label={`Change alignment for ${h}`}>
                            {aligns[colIdx] === "left" && <AlignLeft className="h-3 w-3" />}
                            {aligns[colIdx] === "center" && <AlignCenter className="h-3 w-3 text-[var(--beebot-accent,#f4d35e)]" />}
                            {aligns[colIdx] === "right" && <AlignRight className="h-3 w-3" />}
                          </button>
                          {headers.length > 1 && (
                            <button type="button" onClick={() => removeColumn(colIdx)} className={`${controlClass} hover:text-red-400`} title="Delete column" aria-label={`Delete ${h} column`}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                ))}
                {editable && <th className="w-8 p-0" aria-label="Row actions" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="group/row border-b border-[var(--bb-border)] transition-colors last:border-b-0 hover:bg-[var(--bb-bg-1)]/45 focus-within:bg-[var(--bb-bg-1)]/45">
                  {headers.map((_, colIdx) => (
                    <td key={colIdx} className="min-w-[150px] px-3 py-1.5 align-top first:pl-1 last:pr-1">
                      {editable ? (
                        <textarea
                          rows={1}
                          value={row[colIdx] || ""}
                          onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                          className={cn(
                            "[field-sizing:content] min-h-7 w-full resize-none overflow-hidden rounded-[5px] bg-transparent px-1 py-1 text-[13px] leading-5 text-[var(--bb-text-1)] outline-none transition-colors placeholder:text-[var(--bb-text-4)]/60 focus:bg-[var(--bb-bg-2)] focus:ring-1 focus:ring-[var(--bb-border-strong)]",
                            aligns[colIdx] === "center" && "text-center",
                            aligns[colIdx] === "right" && "text-right"
                          )}
                          placeholder="Empty"
                        />
                      ) : (
                        <span className={cn("block px-1 py-1 text-[13px]", aligns[colIdx] === "center" && "text-center", aligns[colIdx] === "right" && "text-right")}>
                          {row[colIdx] || ""}
                        </span>
                      )}
                    </td>
                  ))}
                  {editable && (
                    <td className="w-8 px-0.5 py-1.5 align-top">
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(rowIdx)} className={`${controlClass} opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:text-red-400`} title="Delete row" aria-label={`Delete row ${rowIdx + 1}`}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {editable && (
            <button type="button" onClick={addRow} className="mt-1 flex h-7 items-center gap-1 rounded-[var(--bb-radius-control)] px-2 text-[11px] text-[var(--bb-text-4)] transition-colors hover:bg-[var(--bb-bg-2)] hover:text-[var(--bb-text-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bb-border-strong)]">
              <Plus className="h-3 w-3" /> Add row
            </button>
          )}
        </div>
      )}
    </div>
  );
}
