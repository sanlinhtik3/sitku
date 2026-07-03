import { createContext, useContext, useState, useEffect, useCallback, lazy, Suspense, memo, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useAuth } from "@/hooks/useAuth";

const AgentChatDialog = lazy(() =>
  import("@/components/agent-chat/AgentChatDialog").then(m => ({ default: m.AgentChatDialog }))
);

// ═══ LOCALIZED ERROR BOUNDARY for Agent Chat ═══
// Catches streaming/rendering errors without killing the entire app UI.
class AgentChatErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AgentChat] Rendering error caught by ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card rounded-lg p-6 max-w-md mx-4 shadow-lg border">
            <h3 className="text-lg font-semibold mb-2">BeeBot encountered an error</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {this.state.error?.message || "Something went wrong with the chat interface."}
            </p>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset();
              }}
            >
              Close & Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface AgentChatContextValue {
  open: (prefill?: string) => void;
  close: () => void;
  isOpen: boolean;
}

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

const fallback: AgentChatContextValue = { open: () => {}, close: () => {}, isOpen: false };

export function useAgentChatDialog() {
  const ctx = useContext(AgentChatContext);
  return ctx ?? fallback;
}

export const AgentChatProvider = memo(({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | undefined>();

  const open = useCallback((msg?: string) => {
    setPrefill(msg);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setPrefill(undefined);
  }, []);

  // Listen for global custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      open(detail?.message);
    };
    window.addEventListener("beebot:open-chat", handler);
    return () => window.removeEventListener("beebot:open-chat", handler);
  }, [open]);

  const handleOpenChange = useCallback((val: boolean) => {
    if (!val) close();
    else setIsOpen(true);
  }, [close]);

  return (
    <AgentChatContext.Provider value={{ open, close, isOpen }}>
      {children}
      {user && isOpen && (
        <AgentChatErrorBoundary onReset={close}>
          <Suspense fallback={null}>
            <AgentChatDialog
              open={isOpen}
              onOpenChange={handleOpenChange}
              userId={user.id}
              initialMessage={prefill}
            />
          </Suspense>
        </AgentChatErrorBoundary>
      )}
    </AgentChatContext.Provider>
  );
});

AgentChatProvider.displayName = "AgentChatProvider";
