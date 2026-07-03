import { ReactNode } from "react";
import { MainSidebar } from "./MainSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Navbar } from "@/components/Navbar";
import { FloatingJobIndicator } from "@/components/easy-srt/FloatingJobIndicator";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { usePullToRefreshSlot } from "@/contexts/PullToRefreshContext";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const slot = usePullToRefreshSlot();
  const handler = slot?.handler ?? null;

  return (
    <div className="flex h-[100dvh] bg-black text-foreground overflow-hidden font-sans selection:bg-primary/30">

      {/* Mobile Navbar - Only visible on mobile */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50">
        <Navbar />
      </div>

      {/* LAYER 1: Sidebar (Base Layer - NOT floating, NOT fixed) */}
      <MainSidebar />

      {/* LAYER 2: Wrapper (Creates floating space with padding) */}
      <div className="flex-1 h-full p-2 sm:p-3 lg:p-3 xl:p-4 relative flex flex-col transition-all pt-16 lg:pt-2">

        {/* LAYER 3: Floating Canvas (The Actual 'App' Window) */}
        <main className="flex-1 w-full bg-[#0C0C0E] lg:rounded-[32px] lg:border lg:border-white/5 lg:ring-1 lg:ring-white/5 shadow-2xl overflow-hidden flex flex-col relative">

          {/* Subtle inner glow effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-40 pointer-events-none" />

          {/* Scrollable Content Area — ONLY THIS SCROLLS.
              Pull-to-refresh activates when a page registers a handler via
              usePullToRefreshRegister(); otherwise the gesture is a no-op. */}
          <PullToRefresh
            onRefresh={handler ?? (async () => {})}
            disabled={!handler}
            className="flex-1 overflow-x-hidden custom-scrollbar relative z-10"
            contentClassName="pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
          >
            {children}
          </PullToRefresh>

        </main>
      </div>

      {/* Floating Job Indicator - Shows background SRT jobs */}
      <FloatingJobIndicator />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
