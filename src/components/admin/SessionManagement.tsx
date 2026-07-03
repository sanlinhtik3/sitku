import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shield, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useGlobalPresence } from "@/hooks/useGlobalPresence";
import { getSessionToken } from "@/lib/sessionTracking";
import { ActiveSessionCard } from "./ActiveSessionCard";
import { AnimatePresence } from "motion/react";
import { logAdminAction } from "@/lib/auditLog";

interface SessionManagementProps {
  userId?: string;
  isUserView?: boolean;
}

export function SessionManagement({ userId, isUserView = false }: SessionManagementProps) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [currentSessionToken, setCurrentSessionToken] = useState<string | null>(null);
  const { isSessionOnline } = useGlobalPresence();

  // Get current session token
  useEffect(() => {
    const getCurrentSession = async () => {
      const token = getSessionToken();
      setCurrentSessionToken(token);
      
      // Also get the current user to ensure we're tracking the right session
      const { data: { user } } = await supabase.auth.getUser();
      if (user && token) {
        // Verify this session exists in the database
        const { data } = await supabase
          .from('user_sessions')
          .select('id')
          .eq('session_token', token)
          .eq('user_id', user.id)
          .single();
        
        if (!data) {
          // Session doesn't exist, clear the token
          localStorage.removeItem('session_token');
          setCurrentSessionToken(null);
        }
      }
    };
    
    getCurrentSession();
  }, []);

  // Fetch all active sessions
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["adminSessions", selectedUserId, userId],
    queryFn: async () => {
      let query = supabase
        .from("user_sessions")
        .select('*')
        .eq("is_active", true)
        .order("last_activity", { ascending: false });

      // If userId prop is provided, filter by that user
      if (userId) {
        query = query.eq("user_id", userId);
      } else if (selectedUserId) {
        query = query.eq("user_id", selectedUserId);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      
      // Map session data with current session flag
      return (data || []).map(session => ({
        ...session,
        isCurrentSession: session.session_token === currentSessionToken
      }));
    },
  });

  // Subscribe to real-time changes
  useEffect(() => {
    if (!userId && !selectedUserId) return;

    const targetUserId = userId || selectedUserId;
    if (!targetUserId) return;

    const channel = supabase
      .channel(`user-sessions:${targetUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_sessions',
          filter: `user_id=eq.${targetUserId}`
        },
        () => {
          // Refetch sessions on any change
          queryClient.invalidateQueries({ queryKey: ["adminSessions"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, selectedUserId, queryClient]);

  // Revoke session mutation
  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_sessions")
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
        })
        .eq("id", sessionId);

      if (error) throw error;

      const session = sessions?.find(s => s.id === sessionId);
      await logAdminAction(
        "session_revoked",
        "session",
        sessionId,
        { user_id: session?.user_id }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminSessions"] });
      toast.success("Session Revoked", {
        description: "The session has been revoked successfully",
      });
    },
    onError: () => {
      toast.error("Revocation Failed", {
        description: "Failed to revoke the session",
      });
    },
  });

  // Trust device mutation
  const trustDeviceMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("user_sessions")
        .update({ is_trusted: true })
        .eq("id", sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminSessions"] });
      toast.success("Device Trusted", {
        description: "This device has been marked as trusted",
      });
    },
    onError: () => {
      toast.error("Failed to Trust Device", {
        description: "Could not mark this device as trusted",
      });
    },
  });

  // Untrust device mutation
  const untrustDeviceMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("user_sessions")
        .update({ is_trusted: false })
        .eq("id", sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminSessions"] });
      toast.success("Device Untrusted", {
        description: "This device is no longer marked as trusted",
      });
    },
    onError: () => {
      toast.error("Failed to Untrust Device", {
        description: "Could not remove trusted status from this device",
      });
    },
  });

  // Revoke all sessions mutation
  const revokeAllMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_sessions")
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
        })
        .eq("user_id", targetUserId)
        .eq("is_active", true);

      if (error) throw error;

      await logAdminAction(
        "all_sessions_revoked",
        "session",
        targetUserId,
        { revoked_sessions_count: sessions?.length || 0 }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminSessions"] });
      toast.success("All Sessions Revoked", {
        description: "All user sessions have been revoked successfully",
      });
    },
    onError: () => {
      toast.error("Revocation Failed", {
        description: "Failed to revoke all sessions",
      });
    },
  });

  if (isUserView) {
    return (
      <div className="space-y-3">
        <ScrollArea className="max-h-[400px] pr-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <div className="animate-pulse">Loading sessions...</div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active sessions found
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {sessions.map((session) => {
                  const isOnline = isSessionOnline(session.session_token);
                  const isCurrentSession = session.session_token === currentSessionToken;
                  
                  return (
                    <div key={session.id} className="space-y-2">
                      <ActiveSessionCard
                        session={session}
                        isCurrentDevice={isCurrentSession}
                        isOnline={isOnline}
                        onEndSession={(sessionId) => revokeSessionMutation.mutate(sessionId)}
                        isLoading={revokeSessionMutation.isPending}
                      />
                      
                      <div className="flex justify-end">
                        {session.is_trusted ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => untrustDeviceMutation.mutate(session.id)}
                            disabled={untrustDeviceMutation.isPending}
                            className="text-muted-foreground hover:text-destructive gap-2"
                          >
                            <ShieldOff className="h-4 w-4" />
                            Remove Trust
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => trustDeviceMutation.mutate(session.id)}
                            disabled={trustDeviceMutation.isPending}
                            className="text-muted-foreground hover:text-primary gap-2"
                          >
                            <Shield className="h-4 w-4" />
                            Trust Device
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background to-background">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-2xl">
          <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Active Sessions
          </span>
          {selectedUserId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  Revoke All Sessions
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke all sessions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will immediately log out the user from all devices. They will need to sign in again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => selectedUserId && revokeAllMutation.mutate(selectedUserId)}
                    disabled={revokeAllMutation.isPending}
                  >
                    {revokeAllMutation.isPending ? "Revoking..." : "Revoke All"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardTitle>
        <CardDescription className="text-base">
          View and manage user's active sessions with real-time status
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="animate-pulse">Loading sessions...</div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No active sessions found
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {sessions.map((session) => {
                  const isOnline = isSessionOnline(session.session_token);
                  const isCurrentSession = session.session_token === currentSessionToken;
                  
                  return (
                    <div key={session.id} className="space-y-2">
                      <ActiveSessionCard
                        session={session}
                        isCurrentDevice={isCurrentSession}
                        isOnline={isOnline}
                        onEndSession={(sessionId) => revokeSessionMutation.mutate(sessionId)}
                        isLoading={revokeSessionMutation.isPending}
                      />
                      
                      {isUserView && (
                        <div className="flex justify-end">
                          {session.is_trusted ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => untrustDeviceMutation.mutate(session.id)}
                              disabled={untrustDeviceMutation.isPending}
                              className="text-muted-foreground hover:text-destructive gap-2"
                            >
                              <ShieldOff className="h-4 w-4" />
                              Remove Trust
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => trustDeviceMutation.mutate(session.id)}
                              disabled={trustDeviceMutation.isPending}
                              className="text-muted-foreground hover:text-primary gap-2"
                            >
                              <Shield className="h-4 w-4" />
                              Trust Device
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
