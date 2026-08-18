import { Outlet } from "react-router-dom";
import { useMemo } from "react";
import { EvVoiceAssistant, makeEvBrain } from "@/features/ev-voice";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";

/**
 * Standalone layout for the BeeBot workspace.
 * No sidebar, no header — just a neutral full-screen canvas.
 * All cloud providers (ProtectedRoute, GlobalPresence, BackgroundJobs,
 * AgentChat) have been removed for the local-first architecture.
 */
export function BeeBotLayout() {
  const repositories = useRepositories();
  const brain = useMemo(() => makeEvBrain(repositories), [repositories]);
  return (
    <div className="h-full w-full bg-background">
      <Outlet />
      <EvVoiceAssistant brain={brain} />
    </div>
  );
}
