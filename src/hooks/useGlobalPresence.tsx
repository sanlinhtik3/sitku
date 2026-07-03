import { useContext } from 'react';
import { GlobalPresenceContext } from '@/contexts/GlobalPresenceContext';

export const useGlobalPresence = () => {
  const context = useContext(GlobalPresenceContext);
  
  if (!context) {
    // Return safe defaults during initialization
    return {
      onlineUsers: new Set<string>(),
      onlineSessions: new Map<string, Set<string>>(),
      isUserOnline: () => false,
      isSessionOnline: () => false,
      totalOnlineCount: 0,
      presenceChannel: null,
    };
  }
  
  return context;
};
