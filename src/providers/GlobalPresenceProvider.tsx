import { ReactNode, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionToken } from '@/lib/sessionTracking';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { GlobalPresenceContext, GlobalPresenceContextType } from '@/contexts/GlobalPresenceContext';

interface PresenceState {
  [key: string]: Array<{
    user_id: string;
    session_token: string;
    online_at: string;
  }>;
}

// ═══ BATCHED PRESENCE STATE: Single atom prevents intermediate renders ═══
interface PresenceAtom {
  users: Set<string>;
  sessions: Map<string, Set<string>>;
}

const EMPTY_PRESENCE: PresenceAtom = { users: new Set(), sessions: new Map() };

export const GlobalPresenceProvider = ({ children }: { children: ReactNode }) => {
  const [presence, setPresence] = useState<PresenceAtom>(EMPTY_PRESENCE);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const visibilityListenerRef = useRef<(() => void) | null>(null);

  // Derive individual values from the atom for backward compatibility
  const onlineUsers = presence.users;
  const onlineSessions = presence.sessions;

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      // Defer presence setup by 2s to prioritize dashboard data
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (cancelled) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;

      const user = session.user;
      const sessionToken = getSessionToken();
      if (!sessionToken) return;

      const presenceChannel = supabase.channel('global-presence', {
        config: { presence: { key: 'session_token' } },
      });

      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return;
          const state = presenceChannel.presenceState() as PresenceState;
          const users = new Set<string>();
          const sessions = new Map<string, Set<string>>();

          Object.values(state).forEach((presences) => {
            presences.forEach((p) => {
              if (p.user_id && p.session_token) {
                users.add(p.user_id);
                if (!sessions.has(p.user_id)) {
                  sessions.set(p.user_id, new Set());
                }
                sessions.get(p.user_id)?.add(p.session_token);
              }
            });
          });

          // Single state update — no intermediate renders
          setPresence({ users, sessions });
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          if (cancelled) return;
          setPresence(prev => {
            const users = new Set(prev.users);
            const sessions = new Map(prev.sessions);
            newPresences.forEach((p: any) => {
              if (p.user_id && p.session_token) {
                users.add(p.user_id);
                if (!sessions.has(p.user_id)) {
                  sessions.set(p.user_id, new Set());
                }
                sessions.get(p.user_id)?.add(p.session_token);
              }
            });
            return { users, sessions };
          });
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          if (cancelled) return;
          setPresence(prev => {
            const users = new Set(prev.users);
            const sessions = new Map(prev.sessions);
            leftPresences.forEach((p: any) => {
              if (p.user_id && p.session_token) {
                const userSessions = sessions.get(p.user_id);
                if (userSessions) {
                  userSessions.delete(p.session_token);
                  if (userSessions.size === 0) {
                    sessions.delete(p.user_id);
                    users.delete(p.user_id);
                  }
                }
              }
            });
            return { users, sessions };
          });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && !cancelled) {
            await presenceChannel.track({
              user_id: user.id,
              session_token: sessionToken,
              online_at: new Date().toISOString(),
            });

            // Only run heartbeat on authenticated routes, not public pages
            const path = window.location.pathname;
            const isAuthRoute = path.startsWith('/beebot');

            if (isAuthRoute) {
              const fireHeartbeat = async () => {
                const currentToken = getSessionToken();
                if (currentToken) {
                  await presenceChannel.track({
                    user_id: user.id,
                    session_token: currentToken,
                    online_at: new Date().toISOString(),
                  });
                }
              };

              const startHeartbeat = () => {
                if (heartbeatRef.current) clearInterval(heartbeatRef.current);
                heartbeatRef.current = setInterval(() => {
                  if (!document.hidden) fireHeartbeat();
                }, 60000);
              };

              const handleVisibility = () => {
                if (document.hidden) {
                  if (heartbeatRef.current) {
                    clearInterval(heartbeatRef.current);
                    heartbeatRef.current = null;
                  }
                } else {
                  fireHeartbeat();
                  startHeartbeat();
                }
              };

              document.addEventListener('visibilitychange', handleVisibility);
              visibilityListenerRef.current = handleVisibility;
              startHeartbeat();
            }
          }
        });

      channelRef.current = presenceChannel;
      // Fix 1: REMOVED the redundant unfiltered `session-changes` channel entirely
    };

    setup();

    return () => {
      cancelled = true;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      if (visibilityListenerRef.current) {
        document.removeEventListener('visibilitychange', visibilityListenerRef.current);
        visibilityListenerRef.current = null;
      }
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  const isUserOnline = useCallback((userId: string): boolean => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  const isSessionOnline = useCallback((sessionToken: string): boolean => {
    for (const sessions of onlineSessions.values()) {
      if (sessions.has(sessionToken)) return true;
    }
    return false;
  }, [onlineSessions]);

  const value: GlobalPresenceContextType = {
    onlineUsers,
    onlineSessions,
    isUserOnline,
    isSessionOnline,
    totalOnlineCount: onlineUsers.size,
    presenceChannel: channelRef.current,
  };

  return (
    <GlobalPresenceContext.Provider value={value}>
      {children}
    </GlobalPresenceContext.Provider>
  );
};
