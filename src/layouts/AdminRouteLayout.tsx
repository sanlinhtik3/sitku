import { Outlet } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { GlobalPresenceProvider } from "@/providers/GlobalPresenceProvider";
import { BackgroundJobsProvider } from "@/providers/BackgroundJobsProvider";
import { AgentChatProvider } from "@/providers/AgentChatProvider";

/**
 * Layout route wrapper for admin pages.
 * Includes providers so admin pages have full context access.
 */
export function AdminRouteLayout() {
  return (
    <ProtectedRoute requireAdmin>
      <GlobalPresenceProvider>
        <BackgroundJobsProvider>
          <AgentChatProvider>
            <Outlet />
          </AgentChatProvider>
        </BackgroundJobsProvider>
      </GlobalPresenceProvider>
    </ProtectedRoute>
  );
}
