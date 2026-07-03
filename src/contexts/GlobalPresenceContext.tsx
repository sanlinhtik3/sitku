import { createContext } from 'react';

export interface GlobalPresenceContextType {
  onlineUsers: Set<string>;
  onlineSessions: Map<string, Set<string>>;
  isUserOnline: (userId: string) => boolean;
  isSessionOnline: (sessionToken: string) => boolean;
  totalOnlineCount: number;
  presenceChannel: any | null;
}

export const GlobalPresenceContext = createContext<GlobalPresenceContextType | null>(null);
