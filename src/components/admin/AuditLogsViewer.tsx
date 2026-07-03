import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchAuditLogs } from "@/lib/auditLog";
import { FileText, Search, Calendar, MapPin, Monitor } from "lucide-react";
import { format } from "date-fns";

export function AuditLogsViewer() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["auditLogs"],
    queryFn: async () => {
      const result = await fetchAuditLogs({ limit: 100 });
      if (result.error) throw result.error;
      
      // Fetch admin profiles separately
      const adminIds = [...new Set(result.data?.map(log => log.admin_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', adminIds);
      
      // Map profiles to logs
      return result.data?.map(log => ({
        ...log,
        admin: profiles?.find(p => p.user_id === log.admin_user_id)
      }));
    },
  });

  const filteredLogs = logs?.filter(log => 
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.admin?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionColor = (action: string) => {
    if (action.includes('delete') || action.includes('revoke') || action.includes('ban')) {
      return 'destructive';
    }
    if (action.includes('create') || action.includes('enable') || action.includes('approve')) {
      return 'default';
    }
    return 'secondary';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Audit Logs
            </CardTitle>
            <CardDescription>
              Track all administrative actions and system changes
            </CardDescription>
          </div>
          <Badge variant="outline">{logs?.length || 0} records</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by action or admin name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[600px] pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filteredLogs && filteredLogs.length > 0 ? (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 border rounded-lg hover:bg-accent/50 transition-colors space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={log.admin?.avatar_url} />
                        <AvatarFallback>
                          {log.admin?.full_name?.charAt(0) || 'A'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {log.admin?.full_name || 'Unknown Admin'}
                          </span>
                          <Badge variant={getActionColor(log.action)} className="text-xs">
                            {log.action.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        {log.resource_type && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Resource: {log.resource_type}
                            {log.resource_id && ` (ID: ${log.resource_id.slice(0, 8)}...)`}
                          </p>
                        )}
                        {log.details && (
                          <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono">
                            {JSON.stringify(log.details, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(log.created_at), 'PPp')}
                    </div>
                    {log.ip_address && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {log.ip_address}
                      </div>
                    )}
                    {log.user_agent && (
                      <div className="flex items-center gap-1 truncate">
                        <Monitor className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{log.user_agent}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? 'No matching audit logs found' : 'No audit logs yet'}
              </p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
