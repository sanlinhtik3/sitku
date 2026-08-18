import type {
  EvFunctionDeclaration,
  EvToolExecutionContext,
  EvToolPreview,
  EvToolResult,
} from "@/features/ev-voice/workspace/contracts";
import {
  applyCapabilityPolicyToPreview,
  evaluateEvCapabilityPolicy,
} from "./capabilityPolicy";

export type EvCapabilityDomain = "workspace" | "notes" | "research" | "memory" | "terminal" | "notion" | "storytelling" | "system";
export type EvCapabilityTransport = "local" | "network" | "electron-ipc";
export type EvCapabilityRisk = "read_only" | "state_change" | "destructive" | "dynamic";
export type EvCapabilityConfirmation = "never" | "important" | "always" | "dynamic";

export interface EvCapabilityDescriptor {
  id: string;
  version: 1;
  domain: EvCapabilityDomain;
  transport: EvCapabilityTransport;
  risk: EvCapabilityRisk;
  confirmation: EvCapabilityConfirmation;
  requiresEvidence: boolean;
  declaration: EvFunctionDeclaration;
}

export interface EvCapabilityAdapter {
  id: string;
  capabilities: readonly EvCapabilityDescriptor[];
  execute(
    name: string,
    args: Record<string, unknown>,
    context: EvToolExecutionContext,
  ): Promise<EvToolResult<unknown>>;
  preview?(
    name: string,
    args: Record<string, unknown>,
    context: EvToolExecutionContext,
  ): Promise<EvToolPreview | null>;
  cancel?(options?: EvCapabilityCancellation): void;
}

export interface EvCapabilityCancellation {
  executionId?: string;
  interruptibility?: "foreground" | "background";
}

export type EvCapabilityLifecycleStatus = "started" | "awaiting_approval" | "completed" | "failed" | "cancelled";

export interface EvCapabilityLifecycleEvent {
  capability: string;
  adapter: string;
  status: EvCapabilityLifecycleStatus;
  durationMs?: number;
  errorCode?: string;
}

interface EvCapabilityRegistryOptions {
  fallbackExecute?: (
    name: string,
    args: Record<string, unknown>,
    context: EvToolExecutionContext,
  ) => Promise<EvToolResult<unknown> | Record<string, unknown>>;
  onLifecycle?: (event: EvCapabilityLifecycleEvent) => void;
}

type RegisteredCapability = {
  descriptor: EvCapabilityDescriptor;
  adapter: EvCapabilityAdapter;
};

export class EvCapabilityRegistry {
  private readonly registered = new Map<string, RegisteredCapability>();
  private readonly adapters = new Map<string, EvCapabilityAdapter>();
  private readonly fallbackExecute?: EvCapabilityRegistryOptions["fallbackExecute"];
  private readonly onLifecycle?: EvCapabilityRegistryOptions["onLifecycle"];

  constructor(options: EvCapabilityRegistryOptions = {}) {
    this.fallbackExecute = options.fallbackExecute;
    this.onLifecycle = options.onLifecycle;
  }

  register(adapter: EvCapabilityAdapter): this {
    if (!adapter.id.trim()) throw new Error("E.V capability adapter id is required.");
    if (this.adapters.has(adapter.id)) throw new Error(`Duplicate E.V capability adapter: ${adapter.id}`);

    const names = new Set<string>();
    for (const capability of adapter.capabilities) {
      validateCapability(capability);
      const name = capability.declaration.name;
      if (names.has(name) || this.registered.has(name)) {
        throw new Error(`Duplicate E.V capability: ${name}`);
      }
      names.add(name);
    }

    this.adapters.set(adapter.id, adapter);
    for (const capability of adapter.capabilities) {
      this.registered.set(capability.declaration.name, {
        descriptor: freezeDescriptor(capability),
        adapter,
      });
    }
    return this;
  }

  has(name: string): boolean {
    return this.registered.has(name);
  }

  get(name: string): EvCapabilityDescriptor | null {
    return this.registered.get(name)?.descriptor || null;
  }

  list(): readonly EvCapabilityDescriptor[] {
    return Object.freeze([...this.registered.values()].map(({ descriptor }) => descriptor));
  }

  declarations(): EvFunctionDeclaration[] {
    return this.list().map(({ declaration }) => ({
      ...declaration,
      ...(declaration.parameters ? { parameters: structuredCloneSafe(declaration.parameters) } : {}),
    }));
  }

  async preview(
    name: string,
    args: Record<string, unknown> = {},
    context: EvToolExecutionContext = { userTranscript: "" },
  ): Promise<EvToolPreview | null> {
    const registered = this.registered.get(name);
    if (!registered) return null;
    const preview = registered.adapter.preview
      ? await registered.adapter.preview(name, args, context)
      : null;
    const decision = evaluateEvCapabilityPolicy(registered.descriptor, preview);
    return applyCapabilityPolicyToPreview(registered.descriptor, preview, decision);
  }

  async execute(
    name: string,
    args: Record<string, unknown> = {},
    context: EvToolExecutionContext = { userTranscript: "" },
  ): Promise<EvToolResult<unknown>> {
    const registered = this.registered.get(name);
    if (registered) {
      const startedAt = performanceNow();
      const preview = context.preview || await this.preview(name, args, context);
      const decision = evaluateEvCapabilityPolicy(registered.descriptor, preview);
      if (!decision.allowed) {
        const result = policyFailure(decision.reason);
        this.emitLifecycle(registered, "failed", startedAt, result.error.code);
        return result;
      }
      if (decision.requiresConfirmation && context.approved !== true) {
        const result = confirmationRequired(name);
        this.emitLifecycle(registered, "awaiting_approval", startedAt, result.error.code);
        return result;
      }
      if (context.signal?.aborted) {
        const result = cancelledTool(name);
        this.emitLifecycle(registered, "cancelled", startedAt, result.error.code);
        return result;
      }

      this.emitLifecycle(registered, "started", startedAt);
      try {
        const result = await registered.adapter.execute(name, args, {
          ...context,
          ...(preview ? { preview } : {}),
        });
        const verified = verifyCapabilityResult(registered.descriptor, result);
        this.emitLifecycle(
          registered,
          verified.ok ? "completed" : "failed",
          startedAt,
          verified.ok ? undefined : verified.error.code,
        );
        return verified;
      } catch (error) {
        const result = adapterFailure(name, error);
        this.emitLifecycle(
          registered,
          isAbortError(error) ? "cancelled" : "failed",
          startedAt,
          result.error.code,
        );
        return result;
      }
    }
    if (this.fallbackExecute) {
      return normalizeToolResult(await this.fallbackExecute(name, args, context));
    }
    return unsupportedTool(name);
  }

  cancel(options?: EvCapabilityCancellation): void {
    for (const adapter of this.adapters.values()) adapter.cancel?.(options);
  }

  private emitLifecycle(
    registered: RegisteredCapability,
    status: EvCapabilityLifecycleStatus,
    startedAt: number,
    errorCode?: string,
  ) {
    this.onLifecycle?.({
      capability: registered.descriptor.id,
      adapter: registered.adapter.id,
      status,
      durationMs: Math.max(0, Math.round(performanceNow() - startedAt)),
      errorCode,
    });
  }
}

export function createEvCapabilities(
  declarations: readonly EvFunctionDeclaration[],
  metadata: (name: string) => Omit<EvCapabilityDescriptor, "id" | "version" | "declaration">,
): EvCapabilityDescriptor[] {
  return declarations.map((declaration) => ({
    id: declaration.name,
    version: 1,
    ...metadata(declaration.name),
    declaration,
  }));
}

function validateCapability(capability: EvCapabilityDescriptor) {
  if (!capability.id.trim()) throw new Error("E.V capability id is required.");
  if (!capability.declaration.name.trim()) throw new Error("E.V capability declaration name is required.");
  if (capability.id !== capability.declaration.name) {
    throw new Error(`E.V capability id must match its declaration name: ${capability.id}`);
  }
}

function freezeDescriptor(capability: EvCapabilityDescriptor): EvCapabilityDescriptor {
  return Object.freeze({
    ...capability,
    declaration: Object.freeze({
      ...capability.declaration,
      ...(capability.declaration.parameters
        ? { parameters: Object.freeze(structuredCloneSafe(capability.declaration.parameters)) }
        : {}),
    }),
  });
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeToolResult(result: EvToolResult<unknown> | Record<string, unknown>): EvToolResult<unknown> {
  if (isEvToolResult(result)) return result;
  if (typeof result.error === "string" && result.error) {
    return {
      ok: false,
      evidence: [],
      error: { code: "UNSUPPORTED_OPERATION", message: result.error },
      recovery: "Use one of E.V's declared capabilities or retry with a supported action.",
    };
  }
  return { ok: true, data: result, evidence: [] };
}

function isEvToolResult(result: EvToolResult<unknown> | Record<string, unknown>): result is EvToolResult<unknown> {
  return typeof result.ok === "boolean" && Array.isArray(result.evidence);
}

function unsupportedTool(name: string): EvToolResult<never> {
  return {
    ok: false,
    evidence: [],
    error: { code: "UNSUPPORTED_OPERATION", message: `Unsupported E.V capability: ${name}` },
    recovery: "Use one of E.V's declared capabilities.",
  };
}

function verifyCapabilityResult(
  descriptor: EvCapabilityDescriptor,
  result: EvToolResult<unknown>,
): EvToolResult<unknown> {
  if (!result.ok || !descriptor.requiresEvidence || result.evidence.length > 0) return result;
  return {
    ok: false,
    evidence: [],
    error: {
      code: "ACTION_VERIFICATION_FAILED",
      message: `${descriptor.id} returned success without the evidence required by its capability contract.`,
    },
    recovery: "Retry the capability and do not report success until it returns verifiable evidence.",
  };
}

function confirmationRequired(name: string): EvToolResult<never> {
  return {
    ok: false,
    evidence: [],
    error: { code: "PERMISSION_DENIED", message: `${name} requires explicit user approval before execution.` },
    recovery: "Show the approval dialog and execute only after the user approves.",
  };
}

function policyFailure(message: string): EvToolResult<never> {
  return {
    ok: false,
    evidence: [],
    error: { code: "UNSUPPORTED_OPERATION", message },
    recovery: "Inspect the capability policy and retry with a supported, verifiable request.",
  };
}

function cancelledTool(name: string): EvToolResult<never> {
  return {
    ok: false,
    evidence: [],
    error: { code: "TOOL_TIMEOUT", message: `${name} was cancelled before execution.` },
    recovery: "Start a new E.V turn if the capability is still needed.",
  };
}

function adapterFailure(name: string, error: unknown): EvToolResult<never> {
  const aborted = isAbortError(error);
  return {
    ok: false,
    evidence: [],
    error: {
      code: aborted ? "TOOL_TIMEOUT" : "UNSUPPORTED_OPERATION",
      message: error instanceof Error ? error.message : `${name} failed unexpectedly.`,
    },
    recovery: aborted
      ? "Start a new E.V turn if the capability is still needed."
      : "Review the capability error and retry only after correcting its input or runtime.",
  };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

function performanceNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
