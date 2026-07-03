import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface SecurityCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'loading';
  message: string;
  action?: string;
}

export default function AdminSecurityCheck() {
  const { user, session, isAdmin, loading: authLoading } = useAuth();
  const [checks, setChecks] = useState<SecurityCheck[]>([]);
  const [checking, setChecking] = useState(false);

  const runSecurityChecks = async () => {
    setChecking(true);
    const newChecks: SecurityCheck[] = [];

    // Check 1: User is authenticated
    newChecks.push({
      name: "Authentication",
      status: user ? 'pass' : 'fail',
      message: user ? `Logged in as ${user.email}` : "Not authenticated",
      action: user ? undefined : "Please log in to continue"
    });

    // Check 2: Session is valid
    newChecks.push({
      name: "Session Validity",
      status: session ? 'pass' : 'fail',
      message: session ? "Valid session token found" : "No active session",
      action: session ? undefined : "Please refresh the page or log in again"
    });

    // Check 3: Admin role in database
    if (user) {
      try {
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        newChecks.push({
          name: "Admin Role (Database)",
          status: roleData ? 'pass' : 'fail',
          message: roleData ? "Admin role found in database" : "No admin role in database",
          action: roleData ? undefined : "Contact system administrator to grant admin access"
        });

        if (roleError) {
          console.error("Role check error:", roleError);
        }
      } catch (error) {
        newChecks.push({
          name: "Admin Role (Database)",
          status: 'fail',
          message: "Error checking admin role",
          action: "Database connection issue - check console for details"
        });
      }
    }

    // Check 4: Admin status in context
    newChecks.push({
      name: "Admin Status (Context)",
      status: isAdmin ? 'pass' : 'fail',
      message: isAdmin ? "Admin status confirmed in auth context" : "Not recognized as admin in auth context",
      action: isAdmin ? undefined : "Role verification may have failed"
    });

    // Check 5: RLS policies
    if (user) {
      try {
        // Try to access an admin-only table
        const { data, error } = await supabase
          .from('user_roles')
          .select('*')
          .limit(1);

        newChecks.push({
          name: "RLS Policies",
          status: error ? 'fail' : 'pass',
          message: error ? "Cannot access protected tables" : "Row-level security working correctly",
          action: error ? "RLS policies may be misconfigured" : undefined
        });
      } catch (error) {
        newChecks.push({
          name: "RLS Policies",
          status: 'warning',
          message: "Could not verify RLS policies",
          action: "Check database connection"
        });
      }
    }

    // Check 6: Email verification
    if (user) {
      newChecks.push({
        name: "Email Verification",
        status: user.email_confirmed_at ? 'pass' : 'warning',
        message: user.email_confirmed_at ? "Email verified" : "Email not verified",
        action: user.email_confirmed_at ? undefined : "Some features may be limited"
      });
    }

    setChecks(newChecks);
    setChecking(false);
  };

  useEffect(() => {
    if (!authLoading) {
      runSecurityChecks();
    }
  }, [user, session, isAdmin, authLoading]);

  const getStatusIcon = (status: SecurityCheck['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-5 w-5 text-success" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default:
        return <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: SecurityCheck['status']) => {
    switch (status) {
      case 'pass':
        return <Badge className="bg-success/20 text-success border-success">Pass</Badge>;
      case 'fail':
        return <Badge variant="destructive">Fail</Badge>;
      case 'warning':
        return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500">Warning</Badge>;
      default:
        return <Badge variant="outline">Checking...</Badge>;
    }
  };

  const failedChecks = checks.filter(c => c.status === 'fail').length;
  const warningChecks = checks.filter(c => c.status === 'warning').length;

  return (
    <AdminLayout>
      <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Security Status
          </h1>
          <p className="text-muted-foreground mt-1">
            Verify your authentication and authorization status
          </p>
        </div>
        <Button
          onClick={runSecurityChecks}
          disabled={checking}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
          Re-check
        </Button>
      </div>

      {/* Overall Status */}
      {checks.length > 0 && (
        <Alert className={
          failedChecks > 0 ? "border-destructive" :
          warningChecks > 0 ? "border-amber-500" :
          "border-success"
        }>
          <AlertTitle className="flex items-center gap-2">
            {failedChecks > 0 ? (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                Security Issues Detected
              </>
            ) : warningChecks > 0 ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Minor Issues Found
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-success" />
                All Security Checks Passed
              </>
            )}
          </AlertTitle>
          <AlertDescription>
            {failedChecks > 0
              ? `${failedChecks} critical issue(s) found that need immediate attention.`
              : warningChecks > 0
              ? `${warningChecks} warning(s) detected. Your security is adequate but can be improved.`
              : "Your authentication and authorization are properly configured."}
          </AlertDescription>
        </Alert>
      )}

      {/* Security Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Security Checks</CardTitle>
          <CardDescription>
            Detailed verification of authentication components
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checks.map((check, index) => (
            <div
              key={index}
              className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="mt-0.5">
                {getStatusIcon(check.status)}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{check.name}</h3>
                  {getStatusBadge(check.status)}
                </div>
                <p className="text-sm text-muted-foreground">{check.message}</p>
                {check.action && (
                  <p className="text-sm font-medium text-primary">
                    Action: {check.action}
                  </p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
          <CardDescription>
            Common solutions for security issues
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">If you're not recognized as admin:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Verify that your user ID has an 'admin' role in the user_roles table</li>
              <li>Try logging out and logging back in to refresh your session</li>
              <li>Clear your browser cache and cookies</li>
              <li>Contact the system administrator to grant admin access</li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Session issues:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Click the "Re-check" button above to refresh your auth status</li>
              <li>If issues persist, sign out and sign back in</li>
              <li>Check if cookies are enabled in your browser</li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Database connection issues:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Check your internet connection</li>
              <li>Verify that the Supabase backend is accessible</li>
              <li>Check browser console for any error messages</li>
            </ol>
          </div>
        </CardContent>
      </Card>
      </div>
    </AdminLayout>
  );
}
