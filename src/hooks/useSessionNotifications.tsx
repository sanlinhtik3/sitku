import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSessionToken } from "@/lib/sessionTracking";
import { Smartphone, Monitor, Tablet } from "lucide-react";

interface SessionNotificationData {
  id: string;
  user_id: string;
  session_token: string;
  device_type: string | null;
  device_name: string | null;
  os: string | null;
  browser: string | null;
  city: string | null;
  country: string | null;
  ip_address: string | null;
  created_at: string;
}

const getDeviceIcon = (deviceType: string | null) => {
  switch (deviceType?.toLowerCase()) {
    case 'mobile':
      return Smartphone;
    case 'tablet':
      return Tablet;
    default:
      return Monitor;
  }
};

export const useSessionNotifications = (userId: string | undefined) => {
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (!userId) return;

    const currentSessionToken = getSessionToken();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Defer subscription by 3s — not time-critical for UX
    const timer = setTimeout(() => {
      channel = supabase
        .channel(`session-notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'user_sessions',
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            if (Date.now() - mountedAt.current < 5000) return;

            const newSession = payload.new as SessionNotificationData;
            if (newSession.session_token === currentSessionToken) return;

            const DeviceIcon = getDeviceIcon(newSession.device_type);
            const deviceName = newSession.device_name || newSession.os || 'Unknown device';
            const location = newSession.city && newSession.country 
              ? `${newSession.city}, ${newSession.country}`
              : newSession.country || 'Unknown location';

            toast.warning("New Login Detected", {
              description: `${deviceName} from ${location}`,
              icon: <DeviceIcon className="h-4 w-4" />,
              duration: 10000,
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_sessions',
            filter: `user_id=eq.${userId}`
          },
          async (payload) => {
            const updatedSession = payload.new as SessionNotificationData;
            
            if (updatedSession.session_token === currentSessionToken) {
              const isActive = (payload.new as any).is_active;
              const revokedAt = (payload.new as any).revoked_at;
              const revokedBy = (payload.new as any).revoked_by as string | null;
              
              if (!isActive || revokedAt) {
                await supabase.auth.signOut();
                
                let description = "Your session has ended. Please sign in again.";
                const isSelfRevoked = revokedBy === userId;
                
                if (!revokedBy) {
                  description = "You logged in from another device, so this session was ended.";
                } else if (isSelfRevoked) {
                  description = "You ended this session from another device.";
                }
                
                toast.error("Session Ended", { description, duration: 5000 });
                window.location.href = "/auth";
              }
            }
          }
        )
        .subscribe();
    }, 3000);

    return () => {
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);
};
