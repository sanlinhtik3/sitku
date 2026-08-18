import type { AppRepositories } from "@/repositories/contracts/repositories";
import { getLocalRuntimeApi } from "@/runtime/LocalRuntimeApi";
import { createBrowserLocalRepositories } from "./browserLocal";
import { createRuntimeProxyRepository } from "./runtimeProxy";

export function createLocalRepositories(): AppRepositories {
  const browserRepos = createBrowserLocalRepositories();
  try {
    getLocalRuntimeApi();
    return {
      vault: createRuntimeProxyRepository("vault"),
      notes: createRuntimeProxyRepository("notes"),
      conversations: createRuntimeProxyRepository("conversations"),
      memories: createRuntimeProxyRepository("memories"),
      tasks: createRuntimeProxyRepository("tasks"),
      search: createRuntimeProxyRepository("search"),
      settings: createRuntimeProxyRepository("settings"),
      skills: createRuntimeProxyRepository("skills"),
      agentRuntime: createRuntimeProxyRepository("agentRuntime"),
    };
  } catch {
    return browserRepos;
  }
}
