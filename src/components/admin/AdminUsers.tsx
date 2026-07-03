import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Mail, Calendar, Ban, ShieldCheck, Search, Eye, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminUserDetailDialog } from "./AdminUserDetailDialog";
import { BulkUserActions } from "./BulkUserActions";
import { useGlobalPresence } from "@/hooks/useGlobalPresence";
import { UserOnlineStatus } from "./UserOnlineStatus";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  is_banned: boolean;
  banned_at: string | null;
  banned_by: string | null;
  email?: string;
  email_verified?: boolean;
}

interface UserSession {
  device_name: string | null;
  os: string | null;
  browser: string | null;
  city: string | null;
  country: string | null;
}

const USERS_PER_PAGE = 8;

export const AdminUsers = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSessions, setUserSessions] = useState<Map<string, UserSession>>(new Map());

  // Global presence tracking for all users
  const { isUserOnline } = useGlobalPresence();

  useEffect(() => {
    fetchUsers();
  }, [searchQuery, statusFilter, currentPage]);

  // Real-time subscription for profiles table
  useEffect(() => {
    const channel = supabase
      .channel('profiles-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [searchQuery, statusFilter, currentPage]);

  // Fetch active sessions for online users
  useEffect(() => {
    const fetchActiveSessions = async () => {
      const userIds = users.map(u => u.user_id);
      if (userIds.length === 0) return;

      const { data } = await supabase
        .from('user_sessions')
        .select('user_id, device_name, os, browser, city, country, is_active, last_activity')
        .in('user_id', userIds)
        .eq('is_active', true)
        .order('last_activity', { ascending: false });

      if (data) {
        const sessionsMap = new Map<string, UserSession>();
        data.forEach(session => {
          if (!sessionsMap.has(session.user_id)) {
            sessionsMap.set(session.user_id, {
              device_name: session.device_name,
              os: session.os,
              browser: session.browser,
              city: session.city,
              country: session.country,
            });
          }
        });
        setUserSessions(sessionsMap);
      }
    };

    if (users.length > 0) {
      fetchActiveSessions();
    }
  }, [users]);

  // Real-time subscription for user_sessions
  useEffect(() => {
    const channel = supabase
      .channel('user-sessions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_sessions',
        },
        () => {
          // Refetch sessions when any session changes
          const userIds = users.map(u => u.user_id);
          if (userIds.length > 0) {
            supabase
              .from('user_sessions')
              .select('user_id, device_name, os, browser, city, country, is_active, last_activity')
              .in('user_id', userIds)
              .eq('is_active', true)
              .order('last_activity', { ascending: false })
              .then(({ data }) => {
                if (data) {
                  const sessionsMap = new Map<string, UserSession>();
                  data.forEach(session => {
                    if (!sessionsMap.has(session.user_id)) {
                      sessionsMap.set(session.user_id, {
                        device_name: session.device_name,
                        os: session.os,
                        browser: session.browser,
                        city: session.city,
                        country: session.country,
                      });
                    }
                  });
                  setUserSessions(sessionsMap);
                }
              });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [users]);

  const fetchUsers = async () => {
    setLoading(true);
    const from = currentPage * USERS_PER_PAGE;
    const to = from + USERS_PER_PAGE - 1;

    let query = supabase
      .from("profiles")
      .select("*", { count: 'exact' })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (searchQuery) {
      query = query.ilike('full_name', `%${searchQuery}%`);
    }

    if (statusFilter === 'banned') {
      query = query.eq('is_banned', true);
    } else if (statusFilter === 'active') {
      query = query.eq('is_banned', false);
    }

    const { data, error, count } = await query;

    if (!error && data) {
      // Fetch email verification status from auth.users
      const { data: authData } = await supabase.auth.admin.listUsers();
      const authUsers = authData?.users || [];
      const enrichedUsers: Profile[] = data.map(profile => {
        const authUser = authUsers.find(u => u.id === profile.user_id);
        return {
          ...profile,
          email: authUser?.email,
          email_verified: !!authUser?.email_confirmed_at
        };
      });
      setUsers(enrichedUsers);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const handleBanUser = async (userId: string, userName: string) => {
    if (!currentUser) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        is_banned: true,
        banned_at: new Date().toISOString(),
        banned_by: currentUser.id
      })
      .eq("user_id", userId);

    if (error) {
      toast.error("Failed to ban user");
      return;
    }

    // Create notification for banned user
    await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        type: "ban",
        title: "Account Banned",
        message: "Your account has been banned by an administrator."
      });

    toast.success(`${userName} has been banned`);
    fetchUsers();
  };

  const handleUnbanUser = async (userId: string, userName: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({
        is_banned: false,
        banned_at: null,
        banned_by: null
      })
      .eq("user_id", userId);

    if (error) {
      toast.error("Failed to unban user");
      return;
    }

    // Create notification for unbanned user
    await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        type: "unban",
        title: "Account Unbanned",
        message: "Your account has been unbanned. You can now access all features."
      });

    toast.success(`${userName} has been unbanned`);
    fetchUsers();
  };

  const handleSendVerificationCode = async (email: string, userName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-send-verification-code', {
        body: { email }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Verification code sent to ${userName}'s email`);
      } else {
        toast.error(data.error || "Failed to send verification code");
      }
    } catch (error: any) {
      console.error('Error sending verification code:', error);
      toast.error("Failed to send verification code");
    }
  };

  const totalPages = Math.ceil(totalCount / USERS_PER_PAGE);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUserIds(users.map(u => u.user_id));
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleSelectUser = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUserIds(prev => [...prev, userId]);
    } else {
      setSelectedUserIds(prev => prev.filter(id => id !== userId));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Users Management</h2>
        <div className="flex items-center gap-2">
          {selectedUserIds.length > 0 && (
            <Badge variant="secondary">{selectedUserIds.length} selected</Badge>
          )}
          <Badge variant="outline">{totalCount} Total Users</Badge>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={users.length > 0 && selectedUserIds.length === users.length}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">Select all</span>
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(0);
            }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => {
          setStatusFilter(value);
          setCurrentPage(0);
        }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-pulse text-primary">Loading users...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {users.map((user) => (
            <Card key={user.id} className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Checkbox
                    checked={selectedUserIds.includes(user.user_id)}
                    onCheckedChange={(checked) => handleSelectUser(user.user_id, checked as boolean)}
                  />
                  <div className="flex items-center justify-between flex-1">
                    <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold">{user.full_name || "No name"}</h3>
                      {user.is_banned ? (
                        <Badge variant="destructive">Banned</Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                      {user.email_verified ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Email Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                          Email Not Verified
                        </Badge>
                      )}
                    </div>
                    <UserOnlineStatus 
                      isOnline={isUserOnline(user.user_id)}
                      deviceInfo={userSessions.get(user.user_id)}
                    />
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        {user.email || 'No email'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(user.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {user.is_banned && user.banned_at && (
                      <div className="text-xs text-muted-foreground">
                        Banned on {new Date(user.banned_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user);
                        setDetailDialogOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    
                    {!user.email_verified && user.email && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSendVerificationCode(user.email!, user.full_name || "User")}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Send Verification Code
                      </Button>
                    )}
                    
                    {currentUser?.id !== user.user_id && (
                      <>
                        {user.is_banned ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <ShieldCheck className="h-4 w-4 mr-1" />
                              Unban User
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Unban User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to unban {user.full_name || "this user"}? They will regain full access to the platform.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleUnbanUser(user.user_id, user.full_name || "User")}>
                                Unban
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Ban className="h-4 w-4 mr-1" />
                              Ban User
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ban User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to ban {user.full_name || "this user"}? This will restrict their access to the platform.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleBanUser(user.user_id, user.full_name || "User")}>
                                Ban
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      </>
                    )}
                  </div>
                </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                className={currentPage === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  onClick={() => setCurrentPage(i)}
                  isActive={currentPage === i}
                  className="cursor-pointer"
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                className={currentPage === totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <AdminUserDetailDialog
        user={selectedUser}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onUserUpdate={fetchUsers}
      />

      <BulkUserActions
        selectedUserIds={selectedUserIds}
        onActionComplete={() => {
          setSelectedUserIds([]);
          fetchUsers();
        }}
      />
    </div>
  );
};
