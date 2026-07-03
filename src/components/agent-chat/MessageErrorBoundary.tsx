import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  messageId?: string;
}

interface State {
  hasError: boolean;
}

export class MessageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[ChatMessage ${this.props.messageId}] Render error:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>This message failed to render.</span>
        </div>
      );
    }
    return this.props.children;
  }
}
