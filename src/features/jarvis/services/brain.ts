import type { AppRepositories } from "@/repositories/contracts/repositories";
import type { Intent, JarvisAction } from "../core/intentParser";
import { parseVoiceCommandText } from "../core/intentParser";
import { execAction, offlineRoute } from "./actions";
import { understandAudio, understandText, resetConversation, runGeminiOperator } from "./gemini";
import { makeToolExecutor } from "./tools";
import { EvOperatorAgent } from "@/features/ev-voice/operator";
import { createLangChainOperatorModel } from "@/features/agent-runtime/langchainOperatorAdapter";
import { createEvWorkspaceToolRegistry } from "@/features/ev-voice/workspace/toolRegistry";
import type { EvToolExecutionContext } from "@/features/ev-voice/workspace/contracts";
import { createEvTerminalToolRegistry } from "@/features/ev-voice/terminal/terminalRegistry";
import { createEvNotionToolRegistry } from "@/features/ev-voice/notion/notionRegistry";
import { createEvStorytellingToolRegistry } from "@/features/ev-voice/storytelling/storytellingRegistry";
import { createLangChainTavilySearch } from "@/features/web-search/tavily";
import { getEvMemoryRepository } from "@/features/ev-voice/memory/memoryService";
import { recordEvEvent } from "@/features/ev-voice/observability";
import {
  createEvCapabilities,
  EvCapabilityRegistry,
  type EvCapabilityDescriptor,
} from "@/features/ev-voice/capabilities/capabilityRegistry";

export { parseVoiceCommandText } from "../core/intentParser";
export type { Intent, JarvisAction } from "../core/intentParser";
export { geminiKey, jarvisEnabled, jarvisModels, jarvisWakeWord, isWakePhrase } from "./settings";
export { evEnabled, evModels, evWakeWord } from "./settings";
export { resetConversation } from "./gemini";

export function makeJarvisBrain(repositories: Pick<AppRepositories, "notes" | "search" | "tasks" | "memories">) {
  const { notes, search, tasks, memories } = repositories;
  const operator = new EvOperatorAgent({
    tasks,
    model: createLangChainOperatorModel(({ request, signal }) => runGeminiOperator(request, signal)),
  });
  const boundExec = (action: JarvisAction, title?: string, intent?: Intent) =>
    execAction({ notes, tasks, memories, operator }, action, title, intent);
  const legacyTools = makeToolExecutor(notes, search, boundExec);
  const tavilySearch = createLangChainTavilySearch();
  const workspaceTools = createEvWorkspaceToolRegistry({
    notes,
    search,
    operator,
    memory: getEvMemoryRepository(),
    webSearch: async (query, signal, options) => {
      const result = await tavilySearch({ query, ...options, signal });
      return {
        answer: result.answer || result.results.map((item) => item.content).filter(Boolean).join("\n\n").slice(0, 6_000),
        sources: result.results.map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.content,
          score: item.score,
          publishedDate: item.publishedDate,
        })),
      };
    },
  });
  const terminalTools = createEvTerminalToolRegistry();
  const notionTools = createEvNotionToolRegistry();
  const storytellingTools = createEvStorytellingToolRegistry({ notes, operator });
  const capabilities = new EvCapabilityRegistry({
    fallbackExecute: (name, args) => legacyTools(name, args),
    onLifecycle: ({ capability, adapter, status, durationMs, errorCode }) => {
      // The voice engine already emits normal tool start/completion events.
      // Keep capability diagnostics focused on policy and failure boundaries.
      if (status === "started" || status === "completed") return;
      recordEvEvent({
        level: status === "failed" ? "error" : "info",
        event: `capability.${status}`,
        status: status === "awaiting_approval" ? "awaiting_approval" : status,
        actionId: capability,
        durationMs,
        errorCode,
        metadata: { adapter },
      });
    },
  });
  capabilities.register({
    id: "workspace",
    capabilities: createEvCapabilities(workspaceTools.declarations, workspaceCapabilityMetadata),
    execute: workspaceTools.execute,
    cancel: workspaceTools.cancel,
  });
  capabilities.register({
    id: "terminal",
    capabilities: createEvCapabilities(terminalTools.declarations, () => ({
      domain: "terminal",
      transport: "electron-ipc",
      risk: "dynamic",
      confirmation: "dynamic",
      requiresEvidence: true,
    })),
    preview: terminalTools.preview,
    execute: terminalTools.execute,
    cancel: terminalTools.cancel,
  });
  capabilities.register({
    id: "storytelling",
    capabilities: createEvCapabilities(storytellingTools.declarations, (name) => ({
      domain: "storytelling",
      transport: "local",
      risk: name === "storytelling_apply_revision" ? "state_change" : "read_only",
      confirmation: name === "storytelling_apply_revision" ? "always" : "never",
      requiresEvidence: name !== "storytelling_create_script",
    })),
    preview: storytellingTools.preview,
    execute: storytellingTools.execute,
    cancel: storytellingTools.cancel,
  });
  capabilities.register({
    id: "notion",
    capabilities: createEvCapabilities(notionTools.declarations, (name) => ({
      domain: "notion",
      transport: "electron-ipc",
      risk: name.startsWith("notion_create_")
        || name.startsWith("notion_update_")
        || name.startsWith("notion_move_")
        || name.startsWith("notion_duplicate_")
        ? "state_change"
        : "read_only",
      confirmation: name.startsWith("notion_create_")
        || name.startsWith("notion_update_")
        || name.startsWith("notion_move_")
        || name.startsWith("notion_duplicate_")
        ? "always"
        : "never",
      requiresEvidence: true,
    })),
    preview: notionTools.preview,
    execute: notionTools.execute,
    cancel: notionTools.cancel,
  });
  return {
    understandAudio,
    understandText,
    execAction: boundExec,
    offline: (text: string) => offlineRoute(text),
    reset: resetConversation,
    cancelAction: () => {
      capabilities.cancel();
    },
    cancelForegroundAction: () => capabilities.cancel({ interruptibility: "foreground" }),
    cancelExecution: (executionId: string) => capabilities.cancel({ executionId }),
    subscribeOperator: (listener: Parameters<typeof operator.subscribeSettled>[0]) => operator.subscribeSettled(listener),
    capabilityRegistry: capabilities,
    toolDeclarations: capabilities.declarations(),
    previewTool: (
      name: string,
      args: Record<string, unknown> = {},
      context: EvToolExecutionContext = { userTranscript: "" },
    ) => capabilities.preview(name, args, context),
    execTool: (
      name: string,
      args: Record<string, unknown> = {},
      context: EvToolExecutionContext = { userTranscript: "" },
    ) => capabilities.execute(name, args, context),
  };
}

function workspaceCapabilityMetadata(name: string): Omit<EvCapabilityDescriptor, "id" | "version" | "declaration"> {
  if (name === "web_search") {
    return {
      domain: "research",
      transport: "network",
      risk: "read_only",
      confirmation: "important",
      requiresEvidence: true,
    };
  }
  if (name === "memory_recall") {
    return {
      domain: "memory",
      transport: "local",
      risk: "read_only",
      confirmation: "never",
      requiresEvidence: true,
    };
  }
  return {
    domain: name.startsWith("notes_") ? "notes" : "workspace",
    transport: "local",
    risk: "read_only",
    confirmation: "never",
    requiresEvidence: true,
  };
}

export const makeEvBrain = makeJarvisBrain;
