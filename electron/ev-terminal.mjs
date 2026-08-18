import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PLAN_TTL_MS = 2 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_COMMAND_LENGTH = 4096;
const MAX_ARGS = 128;

const READ_ONLY_COMMANDS = new Set([
  "pwd", "ls", "rg", "grep", "cat", "head", "tail", "wc", "stat", "file", "which", "du", "df", "find",
]);

const BLOCKED_COMMANDS = new Set([
  "sudo", "su", "doas", "shutdown", "reboot", "halt", "poweroff", "diskutil", "fdisk", "mount", "umount",
  "launchctl", "systemctl", "mkfs", "mkfs.ext4", "mkfs.xfs",
]);

const DESTRUCTIVE_COMMANDS = new Set(["rm", "rmdir", "unlink", "trash"]);
const SHELL_OPERATORS = new Set(["|", "||", "&", "&&", ";", ">", ">>", "<", "<<", "`"]);

export class EvTerminalPolicyError extends Error {
  constructor(code, message, recovery) {
    super(message);
    this.name = "EvTerminalPolicyError";
    this.code = code;
    this.recovery = recovery;
  }
}

export function tokenizeTerminalCommand(input) {
  const command = String(input || "").trim();
  if (!command) throw new EvTerminalPolicyError("INVALID_INPUT", "A terminal command is required.", "Say the exact command E.V should run.");
  if (command.length > MAX_COMMAND_LENGTH) throw new EvTerminalPolicyError("INVALID_INPUT", "The terminal command is too long.", "Split it into smaller commands.");
  if (/\r|\n|\0/.test(command)) throw new EvTerminalPolicyError("UNSUPPORTED_OPERATION", "Multi-line shell input is not supported.", "Run one explicit command at a time.");

  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    if ("|&;><`".includes(character)) {
      if (current) tokens.push(current);
      current = "";
      const pair = `${character}${command[index + 1] || ""}`;
      if (SHELL_OPERATORS.has(pair)) {
        tokens.push(pair);
        index += 1;
      } else {
        tokens.push(character);
      }
      continue;
    }
    if (character === "$" && command[index + 1] === "(") {
      throw new EvTerminalPolicyError("UNSUPPORTED_OPERATION", "Command substitution is not supported.", "Run the nested command separately, then pass its explicit result.");
    }
    current += character;
  }
  if (escaped || quote) throw new EvTerminalPolicyError("INVALID_INPUT", "The terminal command has an unfinished quote or escape.", "Correct the command and try again.");
  if (current) tokens.push(current);
  if (tokens.some((token) => SHELL_OPERATORS.has(token))) {
    throw new EvTerminalPolicyError("UNSUPPORTED_OPERATION", "Shell pipes, redirects, and command chaining are disabled for E.V safety.", "Run each command separately. E.V executes programs directly without a shell.");
  }
  if (!tokens.length || tokens.length - 1 > MAX_ARGS) throw new EvTerminalPolicyError("INVALID_INPUT", "The terminal command has too many arguments.", "Split it into smaller commands.");
  return tokens;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function canonicalExistingPath(value) {
  try { return fs.realpathSync(value); }
  catch { return path.resolve(value); }
}

function normalizeCwd(cwd, homeDir) {
  const resolvedHome = canonicalExistingPath(homeDir);
  const resolved = canonicalExistingPath(cwd || resolvedHome);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new EvTerminalPolicyError("INVALID_INPUT", `Terminal working directory does not exist: ${resolved}`, "Choose an existing folder and try again.");
  }
  if (!isWithin(resolvedHome, resolved)) {
    throw new EvTerminalPolicyError("PERMISSION_DENIED", `E.V terminal access is limited to your home folder: ${resolvedHome}`, "Choose a working directory inside your home folder.");
  }
  return { cwd: resolved, home: resolvedHome };
}

function gitRisk(args) {
  const subcommand = args.find((arg) => !arg.startsWith("-")) || "";
  if (["status", "diff", "log", "show"].includes(subcommand)) return "read_only";
  if (subcommand === "branch" && args.includes("--show-current")) return "read_only";
  if (["clean", "reset", "restore", "checkout"].includes(subcommand)) return "destructive";
  return "state_change";
}

function commandRisk(executable, args) {
  const name = path.basename(executable).toLowerCase();
  if (BLOCKED_COMMANDS.has(name)) return "blocked";
  if (DESTRUCTIVE_COMMANDS.has(name)) return "destructive";
  if (name === "git") return gitRisk(args);
  if (name === "find") {
    if (args.some((arg) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(arg))) return "destructive";
    return "read_only";
  }
  if (READ_ONLY_COMMANDS.has(name)) return "read_only";
  if (["node", "npm", "npx", "python", "python3", "ruby", "perl", "bash", "sh", "zsh", "fish", "osascript"].includes(name)) return "state_change";
  return "state_change";
}

function deletionTargets(executable, args, cwd, home) {
  const name = path.basename(executable).toLowerCase();
  if (!DESTRUCTIVE_COMMANDS.has(name)) return [];
  const targets = args.filter((arg) => arg && !arg.startsWith("-")).map((arg) => path.resolve(cwd, arg));
  if (!targets.length) throw new EvTerminalPolicyError("INVALID_INPUT", "The delete command has no explicit target.", "Name the exact file or folder to delete.");
  for (const target of targets) {
    const canonical = canonicalExistingPath(target);
    if (!isWithin(home, canonical) || canonical === home || canonical === cwd) {
      throw new EvTerminalPolicyError("PERMISSION_DENIED", `E.V will not delete this protected path: ${canonical}`, "Choose a specific file or child folder inside the active working directory.");
    }
  }
  return targets;
}

function makeFailure(error) {
  return {
    ok: false,
    error: {
      code: error?.code || "TERMINAL_FAILED",
      message: error instanceof Error ? error.message : String(error),
    },
    recovery: error?.recovery || "Review the command and try again.",
  };
}

export function createEvTerminalService({ homeDir, auditPath, now = () => Date.now() }) {
  const plans = new Map();
  const results = new Map();
  const running = new Map();

  const writeAudit = (record) => {
    if (!auditPath) return;
    try {
      fs.mkdirSync(path.dirname(auditPath), { recursive: true });
      fs.appendFileSync(auditPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      console.warn("[E.V terminal] audit write failed", error);
    }
  };

  const plan = async (input = {}) => {
    try {
      const tokens = tokenizeTerminalCommand(input.command);
      const executable = tokens[0];
      const args = tokens.slice(1);
      const normalized = normalizeCwd(input.cwd, homeDir);
      const risk = commandRisk(executable, args);
      if (risk === "blocked") {
        throw new EvTerminalPolicyError("PERMISSION_DENIED", `E.V will not run the system-level command: ${path.basename(executable)}`, "Run a scoped user-level command instead.");
      }
      const targets = deletionTargets(executable, args, normalized.cwd, normalized.home);
      const planId = randomUUID();
      const createdAt = now();
      const record = {
        planId,
        command: String(input.command).trim(),
        executable,
        args,
        cwd: normalized.cwd,
        purpose: String(input.purpose || "").trim(),
        risk,
        requiresConfirmation: risk !== "read_only",
        destructiveTargets: targets,
        createdAt,
        expiresAt: createdAt + PLAN_TTL_MS,
      };
      plans.set(planId, record);
      return { ok: true, plan: { ...record, createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(record.expiresAt).toISOString() } };
    } catch (error) {
      return makeFailure(error);
    }
  };

  const execute = async (input = {}) => {
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (!idempotencyKey) return makeFailure(new EvTerminalPolicyError("INVALID_INPUT", "An idempotency key is required.", "Retry from the E.V approval flow."));
    if (results.has(idempotencyKey)) return { ...results.get(idempotencyKey), duplicate: true };
    const item = plans.get(String(input.planId || ""));
    if (!item) return makeFailure(new EvTerminalPolicyError("CONTENT_CHANGED", "The terminal plan is missing or expired.", "Ask E.V to preview the command again."));
    plans.delete(item.planId);
    if (now() > item.expiresAt) return makeFailure(new EvTerminalPolicyError("CONTENT_CHANGED", "The terminal plan expired before execution.", "Ask E.V to preview the command again."));
    if (item.requiresConfirmation && input.approved !== true) {
      return makeFailure(new EvTerminalPolicyError("PERMISSION_DENIED", "Human approval is required for this terminal command.", "Approve the visible command preview, or deny it."));
    }

    const executionId = String(input.executionId || randomUUID());
    const timeoutMs = Math.max(1000, Math.min(MAX_TIMEOUT_MS, Number(input.timeoutMs) || DEFAULT_TIMEOUT_MS));
    const startedAt = now();
    const result = await new Promise((resolve) => {
      const child = execFile(item.executable, item.args, {
        cwd: item.cwd,
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        env: { ...process.env, PWD: item.cwd },
      }, (error, stdout, stderr) => {
        running.delete(executionId);
        const exitCode = typeof error?.code === "number" ? error.code : error ? 1 : 0;
        const verified = !error && item.destructiveTargets.every((target) => !fs.existsSync(target));
        const output = {
          ok: !error,
          executionId,
          planId: item.planId,
          command: item.command,
          cwd: item.cwd,
          risk: item.risk,
          exitCode,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          verified,
          durationMs: Math.max(0, now() - startedAt),
          ...(error ? { error: { code: error.killed ? "TOOL_TIMEOUT" : "TERMINAL_FAILED", message: error.message } } : {}),
          ...(!error ? {} : { recovery: error.killed ? "Run a narrower command or explicitly request a longer timeout." : "Read stderr, correct the command, and retry." }),
        };
        resolve(output);
      });
      running.set(executionId, child);
    });
    results.set(idempotencyKey, result);
    if (results.size > 200) results.delete(results.keys().next().value);
    writeAudit({
      timestamp: new Date().toISOString(),
      executionId,
      planId: item.planId,
      idempotencyKey,
      command: item.command,
      executable: item.executable,
      args: item.args,
      cwd: item.cwd,
      risk: item.risk,
      approved: input.approved === true,
      ok: result.ok,
      exitCode: result.exitCode,
      verified: result.verified,
      durationMs: result.durationMs,
      error: result.error?.message,
    });
    return result;
  };

  return {
    plan,
    execute,
    cancel(executionId) {
      const child = running.get(String(executionId || ""));
      if (!child) return { ok: false, error: { code: "NOT_RUNNING", message: "Terminal execution is not running." } };
      child.kill("SIGTERM");
      running.delete(String(executionId));
      return { ok: true };
    },
  };
}
