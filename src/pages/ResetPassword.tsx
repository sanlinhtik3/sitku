import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Coins, WifiOff } from "lucide-react";
import { z } from "zod";
import { PasswordInput, PasswordStrengthIndicator } from "@/components/auth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

const ResetPassword = () => {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const [loading, setLoading] = useState(false);
  const [validToken, setValidToken] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidToken(true);
      } else {
        toast.error("Invalid or expired reset link");
        setTimeout(() => navigate("/auth"), 3000);
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (confirmPassword && password !== confirmPassword) {
      setPasswordMismatch(true);
    } else {
      setPasswordMismatch(false);
    }
  }, [password, confirmPassword]);

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!isOnline) {
      toast.error("You're offline", { description: "Please check your internet connection." });
      return;
    }
    
    setLoading(true);

    try {
      const validation = resetPasswordSchema.safeParse({ password, confirmPassword });
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast.error(firstError.message);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: validation.data.password
      });

      if (error) throw error;

      toast.success("Password updated successfully! Redirecting to sign in...");
      
      await supabase.auth.signOut();
      setTimeout(() => navigate("/auth"), 2000);
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (!validToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="animate-pulse text-primary" role="status" aria-live="polite">
          Validating reset link...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Offline Banner */}
        {!isOnline && (
          <div 
            className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive"
            role="alert"
            aria-live="assertive"
          >
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm font-medium">You're offline. Please check your connection.</span>
          </div>
        )}
        
        <Link to="/" className="flex items-center justify-center gap-2 mb-8" aria-label="Go to homepage">
          <Coins className="h-10 w-10 text-primary" aria-hidden="true" />
          <span className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            ZOE CRYPTO
          </span>
        </Link>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Reset Password</CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4" aria-label="Reset password form">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-required="true"
                  aria-describedby="password-requirements"
                />
                <PasswordStrengthIndicator password={password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-required="true"
                  aria-invalid={passwordMismatch}
                  aria-describedby={passwordMismatch ? "password-mismatch-error" : undefined}
                />
                {passwordMismatch && (
                  <p 
                    id="password-mismatch-error" 
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    Passwords don't match
                  </p>
                )}
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                variant="hero" 
                disabled={loading || !isOnline || passwordMismatch}
                aria-busy={loading}
              >
                {loading ? "Updating password..." : "Reset Password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Remember your password? <Link to="/auth" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
