import { Outlet } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { GlobalPresenceProvider } from "@/providers/GlobalPresenceProvider";
import { BackgroundJobsProvider } from "@/providers/BackgroundJobsProvider";
import { AgentChatProvider } from "@/providers/AgentChatProvider";
import { PullToRefreshProvider } from "@/contexts/PullToRefreshContext";
import { RouteTransition } from "@/components/RouteTransition";
import { MainLayout } from "./MainLayout";

/**
 * Layout route wrapper: ProtectedRoute + Providers + MainLayout + Outlet.
 * Providers only initialize for authenticated users — not public visitors.
 */
export function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <GlobalPresenceProvider>
        <BackgroundJobsProvider>
          <AgentChatProvider>
            <PullToRefreshProvider>
              <MainLayout>
                <RouteTransition>
                  <Outlet />
                </RouteTransition>
              </MainLayout>
            </PullToRefreshProvider>
          </AgentChatProvider>
        </BackgroundJobsProvider>
      </GlobalPresenceProvider>
    </ProtectedRoute>
  );
}
