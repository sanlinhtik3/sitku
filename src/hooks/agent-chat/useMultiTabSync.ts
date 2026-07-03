// ═══ Multi-Tab Message Sync via BroadcastChannel ═══
// Keeps BeeBot message history synchronized across multiple browser tabs
// without creating duplicate SSE streams. Uses the lightweight BroadcastChannel API.

import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";

const CHANNEL_NAME = "beebot-multi-tab-sync";

interface SyncMessage {
  type: "messages_updated" | "session_changed" | "streaming_state";
  sessionId: string;
  tabId: string;
  timestamp: number;
}

// Unique ID for this tab — prevents self-echo
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function useMultiTabSync(
  activeSessionId: string | null,
  isStreamingRef: React.MutableRefObject<boolean>,
  queryClient: QueryClient,
) {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    // BroadcastChannel not supported in some environments (e.g. Safari <15.4)
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;
      if (!msg || msg.tabId === TAB_ID) return; // Ignore own broadcasts

      switch (msg.type) {
        case "messages_updated":
          // Another tab's stream finished — refresh messages if same session & not streaming locally
          if (msg.sessionId === activeSessionId && !isStreamingRef.current) {
            queryClient.invalidateQueries({ queryKey: ["agent-messages", activeSessionId] });
          }
          break;

        case "session_changed":
          // Another tab changed sessions — refresh session list
          queryClient.invalidateQueries({ queryKey: ["agent-sessions"] });
          break;
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [activeSessionId, queryClient, isStreamingRef]);

  // Broadcast when messages are updated (called after stream ends)
  useEffect(() => {
    if (!activeSessionId || typeof BroadcastChannel === "undefined") return;

    // Listen for query cache updates to broadcast to other tabs
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.query.queryKey[0] === "agent-messages" &&
        event.query.queryKey[1] === activeSessionId &&
        !isStreamingRef.current
      ) {
        channelRef.current?.postMessage({
          type: "messages_updated",
          sessionId: activeSessionId,
          tabId: TAB_ID,
          timestamp: Date.now(),
        } satisfies SyncMessage);
      }

      if (
        event.type === "updated" &&
        event.query.queryKey[0] === "agent-sessions"
      ) {
        channelRef.current?.postMessage({
          type: "session_changed",
          sessionId: activeSessionId,
          tabId: TAB_ID,
          timestamp: Date.now(),
        } satisfies SyncMessage);
      }
    });

    return unsubscribe;
  }, [activeSessionId, queryClient, isStreamingRef]);
}
