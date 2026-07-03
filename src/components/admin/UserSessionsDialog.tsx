import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DeviceSessionCard } from "./DeviceSessionCard";
import { Badge } from "@/components/ui/badge";
import { LogOut, Shield, Globe } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface UserSessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  onSessionsUpdate?: () => void;
}

interface Session {
  id: string;
  device_type: string | null;
  device_name: string | null;
  os: string | null;
  browser: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  ip_address: string | null;
  created_at: string;
  last_activity: string;
  is_active: boolean;
  is_trusted: boolean;
}

export function UserSessionsDialog({ open, onOpenChange, userId, userName, onSessionsUpdate }: UserSessionsDialogProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['user-sessions', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('last_activity', { ascending: false });

      if (error) throw error;
      return data as Session[];
    },
    enabled: open
  });

  const logoutSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('admin_logout_user_session', {
        p_session_id: sessionId,
        p_admin_user_id: user.id
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Session ended successfully');
      queryClient.invalidateQueries({ queryKey: ['user-sessions', userId] });
      onSessionsUpdate?.();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to end session');
    }
  });

  const logoutAllMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('admin_logout_all_user_sessions', {
        p_user_id: userId,
        p_admin_user_id: user.id
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Ended ${data.sessions_revoked} session(s)`);
      queryClient.invalidateQueries({ queryKey: ['user-sessions', userId] });
      onSessionsUpdate?.();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to end sessions');
    }
  });

  const filteredSessions = sessions.filter(session => {
    if (filter === 'active') return session.is_active;
    if (filter === 'inactive') return !session.is_active;
    return true;
  });

  const activeSessionsCount = sessions.filter(s => s.is_active).length;

  // Get unique countries for the location overview
  const uniqueCountries = [...new Set(sessions.map(s => s.country).filter(Boolean))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">{userName}'s Sessions</DialogTitle>
              <DialogDescription className="mt-1">
                Manage all active and past device sessions
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {activeSessionsCount} Active
            </Badge>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 bg-muted/30 border-b">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Total Sessions: {sessions.length}
                </span>
              </div>
              {uniqueCountries.length > 0 && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Locations: {uniqueCountries.join(', ')}
                  </span>
                </div>
              )}
            </div>
            
            {activeSessionsCount > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={logoutAllMutation.isPending}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout All Devices
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Logout all devices?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will end all {activeSessionsCount} active session(s) for {userName}. They will need to log in again on all devices.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => logoutAllMutation.mutate()}>
                      Logout All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="flex-1">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="all">All ({sessions.length})</TabsTrigger>
              <TabsTrigger value="active">Active ({activeSessionsCount})</TabsTrigger>
              <TabsTrigger value="inactive">Inactive ({sessions.length - activeSessionsCount})</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[500px] px-6">
            <TabsContent value={filter} className="space-y-4 mt-4 pb-6">
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No {filter !== 'all' && filter} sessions found
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredSessions.map((session) => (
                    <DeviceSessionCard
                      key={session.id}
                      session={session}
                      onLogout={() => logoutSessionMutation.mutate(session.id)}
                      isLoading={logoutSessionMutation.isPending}
                    />
                  ))}
                </AnimatePresence>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}