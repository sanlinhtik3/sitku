import { Outlet } from "react-router-dom";
import { useMemo } from "react";
import { Jarvis } from "@/components/jarvis/Jarvis";
import { makeJarvisBrain } from "@/components/jarvis/jarvisBrain";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";

/**
 * Standalone layout for the BeeBot workspace.
 * No sidebar, no header — just a neutral full-screen canvas.
 * All cloud providers (ProtectedRoute, GlobalPresence, BackgroundJobs,
 * AgentChat) have been removed for the local-first architecture.
 */
export function BeeBotLayout() {
  const { notes } = useRepositories();
  const brain = useMemo(() => makeJarvisBrain(notes), [notes]);
  return (
    <div className="h-full w-full bg-background">
      <Outlet />
      <Jarvis brain={brain} />
    </div>
  );
}
