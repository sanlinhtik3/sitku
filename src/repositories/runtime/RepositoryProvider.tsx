import { createContext, useContext, useMemo } from "react";
import type { AppRepositories } from "@/repositories/contracts/repositories";
import { createSupabaseRepositories } from "@/repositories/supabase";
import { createLocalRepositories } from "@/repositories/local";
import { resolveRepositoryRuntimeMode, type RepositoryRuntimeMode } from "./runtimeMode";

const RepositoryContext = createContext<AppRepositories | null>(null);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const repositories = useMemo(() => {
    const mode: RepositoryRuntimeMode = resolveRepositoryRuntimeMode();
    return mode === "local" ? createLocalRepositories() : createSupabaseRepositories();
  }, []);

  return <RepositoryContext.Provider value={repositories}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): AppRepositories {
  const repositories = useContext(RepositoryContext);
  if (!repositories) {
    throw new Error("useRepositories must be used inside RepositoryProvider");
  }
  return repositories;
}
