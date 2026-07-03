export type RepositoryRuntimeMode = "supabase" | "local";

export function resolveRepositoryRuntimeMode(): RepositoryRuntimeMode {
  // Local-first: always use local repositories.
  // Supabase mode is retained in the type for future optional sync.
  return "local";
}

export function isLocalRepositoryRuntime(): boolean {
  return resolveRepositoryRuntimeMode() === "local";
}
