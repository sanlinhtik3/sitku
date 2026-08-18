import type {
  EvidenceRef,
  EvFunctionDeclaration,
  EvToolExecutionContext,
  EvToolPreview,
  EvToolResult,
} from "@/features/ev-voice/workspace/contracts";

type NotionPolicy = "read" | "write";

interface NotionToolSpec {
  localName: string;
  remoteName: string;
  policy: NotionPolicy;
  description: string;
  parameters: Record<string, unknown>;
}

const objectArguments = {
  type: "object",
  properties: {
    arguments: {
      type: "object",
      description: "JSON object containing the arguments required by the official Notion MCP tool.",
    },
  },
  required: ["arguments"],
};

const TOOLS: readonly NotionToolSpec[] = [
  read("notion_search", "notion-search", "Search the connected Notion workspace for pages, databases, and content.", {
    type: "object", properties: { query: { type: "string" } }, required: ["query"],
  }),
  read("notion_fetch", "notion-fetch", "Fetch a Notion page or database by its Notion URL or ID.", {
    type: "object", properties: { id: { type: "string", description: "Notion page/database URL or ID." } }, required: ["id"],
  }),
  read("notion_get_self", "notion-get-self", "Read the connected Notion identity and workspace."),
  read("notion_get_users", "notion-get-users", "List users visible to the connected Notion workspace."),
  read("notion_get_teams", "notion-get-teams", "List teams visible to the connected Notion workspace."),
  read("notion_query_data_sources", "notion-query-data-sources", "Query across Notion data sources."),
  read("notion_query_database_view", "notion-query-database-view", "Query a Notion database view."),
  read("notion_get_comments", "notion-get-comments", "Read comments from a Notion page or block."),
  write("notion_create_pages", "notion-create-pages", "Create one or more Notion pages."),
  write("notion_update_page", "notion-update-page", "Update a Notion page without destructive full-content replacement."),
  write("notion_move_pages", "notion-move-pages", "Move Notion pages to a new parent."),
  write("notion_duplicate_page", "notion-duplicate-page", "Duplicate a Notion page."),
  write("notion_create_database", "notion-create-database", "Create a Notion database."),
  write("notion_update_data_source", "notion-update-data-source", "Update a Notion data source."),
  write("notion_create_view", "notion-create-view", "Create a Notion database view."),
  write("notion_update_view", "notion-update-view", "Update a Notion database view."),
  write("notion_create_comment", "notion-create-comment", "Create a comment in Notion."),
];

export const notionToolSpecs = TOOLS;

export function createEvNotionToolRegistry() {
  const controllers = new Map<string, AbortController>();
  const declarations: EvFunctionDeclaration[] = TOOLS.map(({ localName, description, parameters }) => ({
    name: localName,
    description: `${description} Use only when the user explicitly refers to Notion or a Notion workspace.`,
    parameters,
  }));

  const preview = async (
    name: string,
    args: Record<string, unknown>,
    _context: EvToolExecutionContext,
  ): Promise<EvToolPreview | null> => {
    const spec = findSpec(name);
    if (!spec) return unsupported(name);
    const remoteArgs = unwrapArgs(args);
    if (hasForbiddenReplacement(remoteArgs)) {
      return {
        ok: false,
        error: { code: "UNSUPPORTED_OPERATION", message: "Destructive Notion full-content replacement is blocked to protect child pages and databases." },
        recovery: "Use a scoped append or property update instead.",
      };
    }
    if (spec.policy === "read") return null;
    const target = targetLabel(remoteArgs);
    return {
      ok: true,
      requiresConfirmation: true,
      prompt: `Approve ${spec.description}${target ? ` Target: ${target}.` : ""}`,
      intent: spec.localName,
      skill: "system_skill",
      mode: "command",
      data: { tool: spec.remoteName, target, arguments: remoteArgs },
    };
  };

  const execute = async (
    name: string,
    args: Record<string, unknown>,
    context: EvToolExecutionContext,
  ): Promise<EvToolResult<unknown>> => {
    const spec = findSpec(name);
    if (!spec) return failure("UNSUPPORTED_OPERATION", `Unsupported Notion capability: ${name}`, "Use a supported Notion MCP action.");
    const bridge = typeof window !== "undefined" ? window.beebotDesktop : undefined;
    if (!bridge?.notionMcpCallTool || !bridge.notionMcpListTools) {
      return failure("NOTION_DISCONNECTED", "Notion MCP is available only in Sitku Desktop.", "Open Sitku Desktop and connect Notion MCP in Settings.");
    }
    const executionId = context.executionId || crypto.randomUUID();
    const controller = new AbortController();
    controllers.set(executionId, controller);
    const relayAbort = () => controller.abort(context.signal?.reason);
    context.signal?.addEventListener("abort", relayAbort, { once: true });
    try {
      if (controller.signal.aborted) throw new DOMException("Notion call cancelled", "AbortError");
      const advertised = await bridge.notionMcpListTools();
      if (!advertised.tools.some((tool) => tool.name === spec.remoteName)) {
        return failure("UNSUPPORTED_OPERATION", `Connected Notion MCP does not advertise ${spec.remoteName}.`, "Reconnect Notion and retry after its tool list refreshes.");
      }
      const result = await bridge.notionMcpCallTool({
        name: spec.remoteName,
        arguments: unwrapArgs(args),
        approved: context.approved === true,
        executionId,
        idempotencyKey: spec.policy === "write" ? (context.idempotencyKey || `${executionId}:${spec.remoteName}`) : "",
      });
      if (!result.ok) return mapBridgeFailure(result.error);
      const evidence = normalizeEvidence(result.evidence, spec.remoteName, result.requestId || executionId);
      return { ok: true, data: { summary: result.summary, result: result.data, requestId: result.requestId }, evidence };
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return failure("TOOL_TIMEOUT", "Notion action was cancelled.", "Retry the Notion action when ready.");
      }
      return mapBridgeFailure({ code: "REMOTE_TOOL_FAILED", message: error instanceof Error ? error.message : String(error) });
    } finally {
      context.signal?.removeEventListener("abort", relayAbort);
      controllers.delete(executionId);
    }
  };

  const cancel = ({ executionId, interruptibility }: { executionId?: string; interruptibility?: "foreground" | "background" } = {}) => {
    if (interruptibility === "foreground") return;
    if (executionId) controllers.get(executionId)?.abort();
    else for (const controller of controllers.values()) controller.abort();
  };

  return { declarations, preview, execute, cancel };
}

function read(localName: string, remoteName: string, description: string, parameters = objectArguments): NotionToolSpec {
  return { localName, remoteName, policy: "read", description, parameters };
}

function write(localName: string, remoteName: string, description: string): NotionToolSpec {
  return { localName, remoteName, policy: "write", description, parameters: objectArguments };
}

function findSpec(name: string) {
  return TOOLS.find((tool) => tool.localName === name) || null;
}

function unwrapArgs(args: Record<string, unknown>) {
  return args.arguments && typeof args.arguments === "object" && !Array.isArray(args.arguments)
    ? args.arguments as Record<string, unknown>
    : args;
}

function targetLabel(args: Record<string, unknown>) {
  for (const key of ["page_id", "database_id", "data_source_id", "view_id", "parent_id", "id", "url"]) {
    if (typeof args[key] === "string" && args[key].trim()) return args[key].trim().slice(0, 160);
  }
  return "";
}

function hasForbiddenReplacement(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    (["allow_deleting_content", "erase_content", "replace_content", "delete_content"].includes(key) && Boolean(child))
    || hasForbiddenReplacement(child));
}

function normalizeEvidence(value: unknown, tool: string, requestId: string): EvidenceRef[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ id: `notion:${requestId}`, type: "notion", tool, capturedAt: new Date().toISOString() }];
  }
  return value.slice(0, 40).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: String(record.id || `notion:${requestId}:${index}`),
      type: "notion" as const,
      tool,
      notionId: typeof record.notionId === "string" ? record.notionId : undefined,
      url: typeof record.url === "string" ? record.url : undefined,
      capturedAt: typeof record.capturedAt === "string" ? record.capturedAt : new Date().toISOString(),
    };
  });
}

function mapBridgeFailure(error: { code?: string; message?: string } = {}) {
  const code = String(error.code || "REMOTE_TOOL_FAILED");
  if (/AUTH|DISCONNECT|401|403|PERMISSION/.test(code)) {
    return failure("NOTION_DISCONNECTED", error.message || "Notion MCP is not authorized.", "Reconnect Notion MCP in Settings.");
  }
  if (/429|QUOTA|RATE/.test(code)) return failure("PROVIDER_QUOTA", error.message || "Notion is rate-limited.", "Wait briefly and retry.");
  if (/TIMEOUT/.test(code)) return failure("TOOL_TIMEOUT", error.message || "Notion did not respond in time.", "Retry the action.");
  if (/APPROVAL/.test(code)) return failure("APPROVAL_REQUIRED", error.message || "Approval is required.", "Approve the visible Notion action preview.");
  return failure("REMOTE_TOOL_FAILED", error.message || "Notion MCP action failed.", "Check the Notion connection and retry.");
}

function unsupported(name: string): EvToolPreview {
  return { ok: false, error: { code: "UNSUPPORTED_OPERATION", message: `Unsupported Notion capability: ${name}` }, recovery: "Use a supported Notion MCP action." };
}

function failure(code: "NOTION_DISCONNECTED" | "UNSUPPORTED_OPERATION" | "REMOTE_TOOL_FAILED" | "PROVIDER_QUOTA" | "TOOL_TIMEOUT" | "APPROVAL_REQUIRED", message: string, recovery: string): EvToolResult<never> {
  return { ok: false, evidence: [], error: { code, message }, recovery };
}
