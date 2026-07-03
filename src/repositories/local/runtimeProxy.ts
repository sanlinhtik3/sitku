import type { LocalRuntimeApi } from "@/runtime/LocalRuntimeApi";
import { getLocalRuntimeApi } from "@/runtime/LocalRuntimeApi";

export function createRuntimeProxyRepository<K extends keyof LocalRuntimeApi>(domain: K): LocalRuntimeApi[K] {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        const api = getLocalRuntimeApi();
        const repository = api[domain] as unknown as Record<PropertyKey, unknown>;
        const method = repository[prop];
        if (typeof method !== "function") {
          throw new Error("Local runtime repository method " + String(domain) + "." + String(prop) + " is unavailable.");
        }
        return method.apply(repository, args);
      };
    },
  }) as LocalRuntimeApi[K];
}
