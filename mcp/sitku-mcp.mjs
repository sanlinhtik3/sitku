#!/usr/bin/env node
// Sitku Notes — standalone stdio MCP server (for external clients: Claude Desktop, Cline, Cursor…).
//
// Zero dependencies: speaks the MCP stdio transport (newline-delimited JSON-RPC 2.0) directly, so
// `node sitku-mcp.mjs` just works with the Node that ships — no `npm install`. The tool logic lives
// in sitku-mcp-core.mjs (shared with the app-hosted HTTP server in electron/mcp-http-server.mjs).
//
// Vault resolution: --vault <path>  >  $SITKU_VAULT  >  ~/.sitku/workspace.json ("workspace.vaultPath")
//                   >  ~/.sitku/vault (the app default).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { createSitkuCore } from "./sitku-mcp-core.mjs";

const log = (...a) => process.stderr.write(`[sitku-mcp] ${a.join(" ")}\n`); // stderr only — stdout is the protocol channel

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function resolveVault() {
  const explicit = argValue("--vault") || process.env.SITKU_VAULT;
  if (explicit) return path.resolve(explicit);
  try {
    const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".sitku", "workspace.json"), "utf8"));
    const p = j["workspace.vaultPath"] || j.vaultPath;
    if (p) return path.resolve(String(p));
  } catch { /* no workspace.json yet → app default */ }
  return path.join(os.homedir(), ".sitku", "vault");
}

const VAULT = resolveVault();
const core = createSitkuCore(() => VAULT);

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); } catch { return log("skip non-JSON line"); }
  void (async () => {
    try {
      const res = await core.dispatch(msg);
      if (res) process.stdout.write(JSON.stringify(res) + "\n");
    } catch (e) { log("handler error:", e && e.message); }
  })();
});
rl.on("close", () => process.exit(0));

log(`ready · vault: ${VAULT} · tools: ${core.tools.map((t) => t.name).join(", ")}`);
