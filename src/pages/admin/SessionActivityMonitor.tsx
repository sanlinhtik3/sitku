import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Monitor, Globe, Clock, Search, RefreshCw, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface SessionData {
  id: string;
  user_id: string;
  device_name: string | null;
  os: string | null;
  browser: string | null;
  city: string | null;
  country: string | null;
  last_activity: string;
  created_at: string;
  is_active: boolean;
  ip_address: string | null;
  profiles: {
    full_name: string | null;
  } | null;
}

export default function SessionActivityMonitor() {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0
  });

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_sessions")
        .select(`
          *,
          profiles:user_id (
            full_name
          )
        `)
        .order("last_activity", { ascending: false });

      if (error) throw error;

      setSessions(data || []);
      
      const active = data?.filter(s => s.is_active).length || 0;
      const total = data?.length || 0;
      
      setStats({
        total,
        active,
        inactive: total - active
      });
    } catch (error) {
      console.error("Error fetching sessions:", error);
      toast.error("Failed to load session data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();

    // Real-time subscription
    const channel = supabase
      .channel("session-activity-monitor")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_sessions"
        },
        () => {
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredSessions = sessions.filter(session => {
    const searchLower = searchQuery.toLowerCase();
    return (
      session.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      session.device_name?.toLowerCase().includes(searchLower) ||
      session.os?.toLowerCase().includes(searchLower) ||
      session.browser?.toLowerCase().includes(searchLower) ||
      session.country?.toLowerCase().includes(searchLower) ||
      session.city?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Session Activity Monitor
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time monitoring of all user sessions across the platform
          </p>
        </div>
        <Button onClick={fetchSessions} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">All tracked sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Monitor className="h-4 w-4 text-green-500" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.active}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently online</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              Inactive Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.inactive}</div>
            <p className="text-xs text-muted-foreground mt-1">Logged out or expired</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Session Details</CardTitle>
          <CardDescription>Search and filter active sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by user, device, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Session Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading sessions...
                    </TableCell>
                  </TableRow>
                ) : filteredSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No sessions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        {session.is_active ? (
                          <Badge variant="default" className="bg-green-500">
                            <div className="h-2 w-2 rounded-full bg-white mr-1 animate-pulse" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {session.profiles?.full_name || "Unknown User"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {session.user_id.slice(0, 8)}...
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">
                              {session.device_name || "Unknown Device"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {session.os} • {session.browser}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm">
                              {session.city || "Unknown"}, {session.country || "Unknown"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {session.ip_address || "N/A"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {formatDistanceToNow(new Date(session.last_activity), { addSuffix: true })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(session.created_at), { addSuffix: false })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
