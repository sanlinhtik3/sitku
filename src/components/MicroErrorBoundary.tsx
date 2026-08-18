import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  name: string;
  children: ReactNode;
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Pillar 5: Self-Healing Micro-Error Boundary & Circuit Breaker.
 *
 * Isolates UI crashes to specific sections (Editor, Sidebar, Right Rail, Modals)
 * so that if one component fails or crashes during calculation, the rest of the
 * workspace remains 100% interactive and unaffected.
 *
 * Automatically heals (resets error state) when `resetKeys` (e.g. activePath) change.
 */
export class MicroErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(`[MicroErrorBoundary: ${this.props.name}] Crash caught:`, error);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && this.props.resetKeys && prevProps.resetKeys) {
      const changed = this.props.resetKeys.some((val, i) => val !== prevProps.resetKeys?.[i]);
      if (changed) {
        this.setState({ hasError: false, error: undefined });
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 min-h-[140px] m-2 p-6 rounded-2xl bg-[var(--bb-bg-1)] border border-[rgba(255,255,255,0.08)] flex flex-col items-center justify-center text-center gap-3 shadow-lg overflow-hidden">
          <div className="h-10 w-10 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <span className="text-sm font-semibold text-foreground">
              {this.props.name} encountered an error
            </span>
            <span className="text-xs text-muted-foreground line-clamp-2 font-mono break-all">
              {this.state.error?.message || "Unexpected rendering failure."}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
            className="mt-1 h-8 px-3 text-xs gap-1.5 border-[rgba(255,255,255,0.12)] hover:bg-[var(--bb-bg-3)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
