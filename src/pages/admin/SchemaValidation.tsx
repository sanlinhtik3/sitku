import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Database, Shield, Code } from "lucide-react";
import { toast } from "sonner";

interface ValidationData {
  tables: Record<string, any[]>;
  tableCount: number;
  columnCount: number;
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    type: string;
    message: string;
    table?: string;
    tables?: string[];
    columns?: string[];
  }>;
  timestamp: string;
}

export default function SchemaValidation() {
  const [validationData, setValidationData] = useState<ValidationData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchValidation = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('schema-validation');

      if (error) throw error;

      if (data.success) {
        setValidationData(data.data);
        
        const criticalCount = data.data.issues.filter((i: any) => i.severity === 'critical').length;
        if (criticalCount > 0) {
          toast.error(`Found ${criticalCount} critical schema issues`);
        } else {
          toast.success("Schema validation completed successfully");
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error fetching validation data:", error);
      toast.error("Failed to validate schema");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValidation();
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'warning': return 'default';
      case 'info': return 'secondary';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'info': return <CheckCircle2 className="h-4 w-4" />;
      default: return null;
    }
  };

  const criticalIssues = validationData?.issues.filter(i => i.severity === 'critical').length || 0;
  const warningIssues = validationData?.issues.filter(i => i.severity === 'warning').length || 0;
  const infoIssues = validationData?.issues.filter(i => i.severity === 'info').length || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Schema Validation
          </h1>
          <p className="text-muted-foreground mt-1">
            Automated detection of schema mismatches and database issues
          </p>
        </div>
        <Button onClick={fetchValidation} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Run Validation
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Tables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{validationData?.tableCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Total tables analyzed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Code className="h-4 w-4 text-blue-500" />
              Columns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{validationData?.columnCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Total columns validated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{criticalIssues}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{warningIssues}</div>
            <p className="text-xs text-muted-foreground mt-1">Should be reviewed</p>
          </CardContent>
        </Card>
      </div>

      {/* Issues List */}
      {validationData && validationData.issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detected Issues</CardTitle>
            <CardDescription>Schema validation findings and recommendations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {validationData.issues.map((issue, index) => (
              <Alert key={index} variant={issue.severity === 'critical' ? 'destructive' : 'default'}>
                <div className="flex items-start gap-2">
                  {getSeverityIcon(issue.severity)}
                  <div className="flex-1">
                    <AlertTitle className="flex items-center gap-2">
                      <Badge variant={getSeverityColor(issue.severity) as any}>
                        {issue.severity.toUpperCase()}
                      </Badge>
                      {issue.type.replace(/_/g, ' ').toUpperCase()}
                    </AlertTitle>
                    <AlertDescription className="mt-2">
                      {issue.message}
                      {issue.table && (
                        <div className="mt-2 font-mono text-sm">
                          Table: <code className="bg-muted px-1 py-0.5 rounded">{issue.table}</code>
                        </div>
                      )}
                      {issue.columns && issue.columns.length > 0 && (
                        <div className="mt-2">
                          <span className="text-sm font-medium">Affected columns:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {issue.columns.map(col => (
                              <code key={col} className="bg-muted px-2 py-0.5 rounded text-xs">
                                {col}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Schema Details */}
      {validationData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Schema Details</CardTitle>
            <CardDescription>Complete database schema structure</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {Object.entries(validationData.tables).map(([tableName, columns]) => (
                <AccordionItem key={tableName} value={tableName}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      <span className="font-mono text-sm">{tableName}</span>
                      <Badge variant="secondary" className="ml-2">
                        {columns.length} columns
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Column</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Nullable</TableHead>
                            <TableHead>Default</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {columns.map((col) => (
                            <TableRow key={col.name}>
                              <TableCell className="font-mono text-sm">{col.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{col.type}</Badge>
                              </TableCell>
                              <TableCell>
                                {col.nullable ? (
                                  <Badge variant="secondary">YES</Badge>
                                ) : (
                                  <Badge variant="default">NO</Badge>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {col.default || 'None'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Last Validation */}
      {validationData && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Last validated: {new Date(validationData.timestamp).toLocaleString()}</span>
              <span className="flex items-center gap-2">
                {criticalIssues === 0 && warningIssues === 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Schema is healthy
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Issues detected
                  </>
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
