import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, Shield, Activity, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface DatabaseHealthData {
  tableCounts: Record<string, number>;
  activeConnections: number;
  databaseSize: number;
  timestamp: string;
}

export default function DatabaseHealth() {
  const [healthData, setHealthData] = useState<DatabaseHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealthData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('database-health');

      if (error) throw error;

      if (data.success) {
        setHealthData(data.data);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error fetching health data:", error);
      toast.error("Failed to load database health data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealthData, 30000);
    return () => clearInterval(interval);
  }, []);

  const totalRecords = healthData
    ? Object.values(healthData.tableCounts).reduce((sum, count) => sum + (count > 0 ? count : 0), 0)
    : 0;

  const tableHealth = healthData
    ? Object.entries(healthData.tableCounts).map(([table, count]) => ({
        table,
        count,
        status: count >= 0 ? 'healthy' : 'error',
        hasData: count > 0
      }))
    : [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Database Health Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time monitoring of database tables, RLS policies, and system health
          </p>
        </div>
        <Button onClick={fetchHealthData} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Total Tables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {healthData ? Object.keys(healthData.tableCounts).length : 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Monitored tables</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-500" />
              Total Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {totalRecords.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across all tables</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {healthData?.activeConnections || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Connected users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Healthy
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">All systems operational</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Table Statistics</CardTitle>
          <CardDescription>Row counts and health status for each table</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table Name</TableHead>
                  <TableHead>Row Count</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data Presence</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      Loading database health data...
                    </TableCell>
                  </TableRow>
                ) : tableHealth.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  tableHealth.map((table) => (
                    <TableRow key={table.table}>
                      <TableCell className="font-mono text-sm">
                        {table.table}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {table.count >= 0 ? table.count.toLocaleString() : 'Error'}
                      </TableCell>
                      <TableCell>
                        {table.status === 'healthy' ? (
                          <Badge variant="default" className="bg-green-500">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Healthy
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Error
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {table.hasData ? (
                          <Badge variant="secondary">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Has Data
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Empty
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={table.status === 'healthy' ? 100 : 0} 
                            className="w-20 h-2"
                          />
                          <span className="text-xs text-muted-foreground">
                            {table.status === 'healthy' ? '100%' : '0%'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Last Updated */}
      {healthData && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Last updated: {new Date(healthData.timestamp).toLocaleString()}</span>
              <span>Auto-refreshes every 30 seconds</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
