import { captureWorkspaceTruth, stableContentHash } from "@/features/ev-voice/workspace/workspaceContext";
import type {
  EvidenceRef,
  EvFunctionDeclaration,
  EvToolExecutionContext,
  EvToolPreview,
  EvToolResult,
} from "@/features/ev-voice/workspace/contracts";

interface TerminalPlan {
  planId: string;
  command: string;
  executable: string;
  args: string[];
  cwd: string;
  purpose: string;
  risk: "read_only" | "state_change" | "destructive";
  requiresConfirmation: boolean;
  destructiveTargets: string[];
  createdAt: string;
  expiresAt: string;
}

type TerminalPlanResponse =
  | { ok: true; plan: TerminalPlan }
  | { ok: false; error: { code: string; message: string }; recovery: string };

type TerminalExecutionResponse = {
  ok: boolean;
  executionId?: string;
  planId?: string;
  command?: string;
  cwd?: string;
  risk?: TerminalPlan["risk"];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  verified?: boolean;
  durationMs?: number;
  duplicate?: boolean;
  error?: { code: string; message: string };
  recovery?: string;
};

const declaration: EvFunctionDeclaration = {
  name: "terminal_run",
  description: "Run one explicit terminal program in Sitku's Electron desktop runtime. Read-only commands can run immediately. Any command that can change files or system state requires the visible human approval dialog. Never use this tool unless the user explicitly asks E.V to run a terminal command or perform work that requires one.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "One exact command. Pipes, redirects, chaining, and command substitution are unsupported." },
      cwd: { type: "string", description: "Optional working directory inside the user's home folder." },
      purpose: { type: "string", description: "Short explanation of why this command is needed." },
    },
    required: ["command"],
  },
};

export interface EvTerminalToolRegistry {
  declarations: EvFunctionDeclaration[];
  preview(name: string, args: Record<string, unknown>, context: EvToolExecutionContext): Promise<EvToolPreview | null>;
  execute(name: string, args: Record<string, unknown>, context: EvToolExecutionContext): Promise<EvToolResult<unknown>>;
  cancel(): void;
}

export function createEvTerminalToolRegistry(): EvTerminalToolRegistry {
  let activeExecutionId: string | null = null;

  const resolveCwd = async (args: Record<string, unknown>) => {
    const explicit = typeof args.cwd === "string" ? args.cwd.trim() : "";
    if (explicit) return explicit;
    const snapshot = await captureWorkspaceTruth().catch(() => null);
    return snapshot?.vault?.path || undefined;
  };

  const plan = async (args: Record<string, unknown>): Promise<TerminalPlanResponse> => {
    const bridge = typeof window !== "undefined" ? window.beebotDesktop : undefined;
    if (!bridge?.evTerminalPlan) {
      return {
        ok: false,
        error: { code: "UNSUPPORTED_OPERATION", message: "E.V terminal is available only in the Electron desktop app." },
        recovery: "Open Sitku Desktop and try the command again.",
      };
    }
    return bridge.evTerminalPlan({
      command: String(args.command || "").trim(),
      cwd: await resolveCwd(args),
      purpose: String(args.purpose || "").trim(),
    }) as Promise<TerminalPlanResponse>;
  };

  return {
    declarations: [declaration],
    async preview(name, args) {
      if (name !== declaration.name) return null;
      const result = await plan(args);
      if (!result.ok) return failurePreview(result);
      const riskLabel = result.plan.risk === "destructive"
        ? "Destructive command"
        : result.plan.risk === "state_change" ? "System or file change" : "Read-only command";
      return {
        ok: true,
        requiresConfirmation: result.plan.requiresConfirmation,
        prompt: `${riskLabel}: ${result.plan.command}\nWorking directory: ${result.plan.cwd}`,
        intent: "run_terminal_command",
        skill: "terminal_skill",
        mode: "command",
        data: { plan: result.plan },
      };
    },
    async execute(name, args, context) {
      if (name !== declaration.name) return failure("UNSUPPORTED_OPERATION", `Unsupported terminal tool: ${name}`, "Use terminal_run.");
      const previewPlan = context.preview?.ok ? context.preview.data?.plan as TerminalPlan | undefined : undefined;
      const planned = previewPlan ? { ok: true as const, plan: previewPlan } : await plan(args);
      if (!planned.ok) return failure(planned.error.code, planned.error.message, planned.recovery);
      const executionId = crypto.randomUUID();
      activeExecutionId = executionId;
      try {
        const bridge = window.beebotDesktop;
        if (!bridge?.evTerminalExecute) return failure("UNSUPPORTED_OPERATION", "E.V terminal is unavailable in this runtime.", "Open Sitku Desktop and retry.");
        const result = await bridge.evTerminalExecute({
          planId: planned.plan.planId,
          executionId,
          idempotencyKey: context.idempotencyKey || `ev-terminal:${stableContentHash(`${planned.plan.planId}:${planned.plan.command}`)}`,
          approved: context.approved === true || !planned.plan.requiresConfirmation,
        }) as TerminalExecutionResponse;
        if (!result.ok) return failure(result.error?.code || "TERMINAL_FAILED", result.error?.message || "The terminal command failed.", result.recovery || "Read the command output, correct it, and retry.");
        const capturedAt = new Date().toISOString();
        const evidence: EvidenceRef[] = [{
          id: `terminal-${result.executionId || executionId}`,
          type: "terminal",
          path: result.cwd,
          title: result.command,
          capturedAt,
          snippet: `exit ${result.exitCode ?? 0}; verified ${result.verified === true}`,
        }];
        return {
          ok: true,
          data: {
            executionId: result.executionId || executionId,
            command: result.command || planned.plan.command,
            cwd: result.cwd || planned.plan.cwd,
            risk: result.risk || planned.plan.risk,
            exitCode: result.exitCode ?? 0,
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            verified: result.verified === true,
            durationMs: result.durationMs ?? 0,
            duplicate: result.duplicate === true,
          },
          evidence,
        };
      } finally {
        if (activeExecutionId === executionId) activeExecutionId = null;
      }
    },
    cancel() {
      if (!activeExecutionId) return;
      void window.beebotDesktop?.evTerminalCancel?.(activeExecutionId);
      activeExecutionId = null;
    },
  };
}

function failurePreview(result: Extract<TerminalPlanResponse, { ok: false }>): EvToolPreview {
  return { ok: false, error: normalizeError(result.error), recovery: result.recovery };
}

function failure(code: string, message: string, recovery: string): EvToolResult<never> {
  return { ok: false, evidence: [], error: normalizeError({ code, message }), recovery };
}

function normalizeError(error: { code: string; message: string }) {
  const allowed = new Set(["INVALID_INPUT", "CONTENT_CHANGED", "PERMISSION_DENIED", "TOOL_TIMEOUT", "TERMINAL_FAILED", "UNSUPPORTED_OPERATION"]);
  return { code: (allowed.has(error.code) ? error.code : "TERMINAL_FAILED") as "INVALID_INPUT" | "CONTENT_CHANGED" | "PERMISSION_DENIED" | "TOOL_TIMEOUT" | "TERMINAL_FAILED" | "UNSUPPORTED_OPERATION", message: error.message };
}
