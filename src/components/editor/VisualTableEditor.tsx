import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, AlignLeft, AlignCenter, AlignRight, Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
      .split("|")
      .map((cell) => cell.trim());

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
    const s = str || "";
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

  return [headerLine, separatorLine, ...rowLines].join("\n") + "\n";
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
            <span>Visual Table Grid Editor</span>
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
