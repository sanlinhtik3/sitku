import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { formatTerminalEvent, terminalColorsEnabled } from "../electron/observability.mjs";

const rootDir = process.env.SITKU_USER_DATA
  || path.join(os.homedir(), "Library", "Application Support", "Sitku Agent");
const dbPath = path.join(rootDir, "observability.sqlite");
const command = process.argv[2] || "tail";
const argument = process.argv[3];
const color = process.argv.includes("--no-color") ? false : (process.argv.includes("--color") || terminalColorsEnabled(process.stdout));

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[38;5;117m",
  mint: "\u001b[38;5;84m",
  rose: "\u001b[38;5;204m",
};

function paint(value, tone) {
  return color ? `${tone}${value}${ANSI.reset}` : value;
}

function printHeader(label, detail = "LOCAL / REDACTED") {
  const rule = "─".repeat(92);
  console.log(paint("SITKU // OBSERVABILITY", `${ANSI.bold}${ANSI.cyan}`));
  console.log(`${paint(label, ANSI.bold)} ${paint(`· ${detail}`, ANSI.dim)}`);
  console.log(paint(rule, ANSI.dim));
}

if (command === "doctor") {
  const logsDir = path.join(rootDir, "logs");
  const ready = fs.existsSync(dbPath);
  printHeader("SYSTEM CHECK");
  console.log(`userData  ${paint(rootDir, ANSI.cyan)}`);
  console.log(`database  ${paint(ready ? "READY" : "NOT CREATED", ready ? ANSI.mint : ANSI.rose)}`);
  console.log(`jsonl files: ${fs.existsSync(logsDir) ? fs.readdirSync(logsDir).filter((file) => file.endsWith(".jsonl")).length : 0}`);
  process.exit(0);
}

if (!fs.existsSync(dbPath)) {
  console.error(`No observability database yet: ${dbPath}`);
  console.error("Run the Electron app once, then retry.");
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });

function read(where = "", args = []) {
  return db.prepare(`
    SELECT id, timestamp, level, domain, event, trace_id, turn_id, action_id,
           status, duration_ms, error_code
    FROM observability_events ${where}
    ORDER BY timestamp DESC LIMIT 200
  `).all(...args).reverse();
}

function printRows(rows) {
  for (const row of rows) console.log(formatTerminalEvent(row, { color }));
}

// These are persistence bookkeeping records from the former Jarvis journal.
// They remain available through `logs:trace`, but do not describe a user-visible
// operation and would otherwise drown out the actual E.V lifecycle.
function isLegacyJournalNoise(row) {
  const baseEvent = String(row.event || "").split(".")[0];
  return row.domain === "jarvis" && ["begin", "update", "listRecent", "recoverInterrupted", "claimAction"].includes(baseEvent);
}

function operatorRows(rows) {
  return rows.filter((row) => !isLegacyJournalNoise(row));
}

if (command === "errors") {
  printHeader("WARNINGS / ERRORS");
  printRows(read("WHERE level IN ('warn', 'error')"));
} else if (command === "trace") {
  if (!argument) {
    console.error("Usage: npm run logs:trace -- <traceId>");
    process.exitCode = 1;
  } else {
    printHeader("TRACE", argument);
    printRows(read("WHERE trace_id = ?", [argument]));
  }
} else if (command === "tail") {
  printHeader("LIVE TRACE");
  let latestId = null;
  const printNew = () => {
    const rows = latestId
      ? db.prepare(`
          SELECT id, timestamp, level, domain, event, trace_id, turn_id, action_id,
                 status, duration_ms, error_code
          FROM observability_events WHERE id > ?
          ORDER BY id ASC LIMIT 500
        `).all(latestId)
      : read().slice(-50);
    if (rows.length) latestId = rows[rows.length - 1].id;
    printRows(operatorRows(rows));
  };
  printNew();
  console.log(paint("Watching Sitku logs · Ctrl+C to stop", ANSI.dim));
  const timer = setInterval(printNew, 500);
  process.once("SIGINT", () => {
    clearInterval(timer);
    db.close();
    process.exit(0);
  });
} else {
  console.error("Usage: logs:tail [--color] | logs:errors [--color] | logs:trace <traceId> [--color] | logs:doctor");
  process.exitCode = 1;
}

if (command !== "tail") db.close();
