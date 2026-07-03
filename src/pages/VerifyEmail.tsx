import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, Mail, RefreshCw, ArrowLeft, CheckCircle, Inbox } from "lucide-react";
import { FuturisticBackground } from "@/components/ui/FuturisticBackground";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, emailVerified, signOut } = useAuth();
  
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailSent, setEmailSent] = useState(false);
  
  // Get email from URL params or current user
  const emailFromParams = searchParams.get("email");
  const email = emailFromParams || user?.email || "";

  // Redirect to dashboard if already verified
  useEffect(() => {
    if (user && emailVerified) {
      navigate("/beebot", { replace: true });
    }
  }, [user, emailVerified, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    if (!email || resendCooldown > 0) return;

    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-verification-email", {
        body: { email },
      });

      if (error) throw error;

      // Check if we hit the cooldown
      if (data?.cooldownSeconds) {
        setResendCooldown(data.cooldownSeconds);
        toast.warning("Please wait before requesting another email", {
          description: `You can request a new link in ${data.cooldownSeconds} seconds.`,
        });
        return;
      }

      setEmailSent(true);
      setResendCooldown(60); // 60 second cooldown
      
      toast.success("Verification link sent!", {
        description: "Check your inbox and spam folder.",
      });
    } catch (error: any) {
      console.error("Error resending verification:", error);
      toast.error("Failed to send verification email", {
        description: error.message || "Please try again later.",
      });
    } finally {
      setResending(false);
    }
  };

  const handleBackToLogin = async () => {
    // Sign out if logged in, then navigate to auth
    if (user) {
      await signOut();
    }
    navigate("/auth");
  };

  // If no email provided, redirect to auth
  if (!email) {
    return (
      <FuturisticBackground className="flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-destructive/30 bg-background/80 backdrop-blur-xl">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-2" />
            <CardTitle className="text-xl">No Email Provided</CardTitle>
            <CardDescription>
              Please sign up or sign in first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/auth")} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </FuturisticBackground>
    );
  }

  return (
    <FuturisticBackground className="flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/20 bg-background/80 backdrop-blur-xl shadow-2xl shadow-primary/10">
        <CardHeader className="text-center space-y-4">
          {/* Warning Header */}
          <div className="mx-auto w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/30">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          </div>
          
          <CardTitle className="text-2xl font-bold text-foreground">
            Email Not Verified
          </CardTitle>
          
          <CardDescription className="text-base">
            A verification link was sent to:
          </CardDescription>
          
          {/* Email Display */}
          <div className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <Mail className="h-5 w-5 text-primary" />
            <span className="font-medium text-foreground">{email}</span>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Instructions */}
          <div className="bg-muted/30 backdrop-blur-sm rounded-lg p-4 border border-border/50 space-y-3">
            <p className="font-medium text-foreground flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" />
              Follow these steps:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-2">
              <li>Open your email inbox (check spam folder too)</li>
              <li>Click the verification link in the email</li>
              <li>Return here and sign in to your account</li>
            </ol>
          </div>

          {/* Success Message (after resend) */}
          {emailSent && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm">New verification link sent!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Resend Button */}
            <Button
              onClick={handleResendVerification}
              disabled={resending || resendCooldown > 0}
              className="w-full"
              variant="default"
            >
              {resending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : resendCooldown > 0 ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resend in {resendCooldown}s
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resend Verification Email
                </>
              )}
            </Button>

            {/* Back to Login Button */}
            <Button
              onClick={handleBackToLogin}
              variant="outline"
              className="w-full border-primary/30 hover:bg-primary/10"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-center text-muted-foreground">
            Didn't receive the email? Check your spam folder or click resend above.
          </p>
        </CardContent>
      </Card>
    </FuturisticBackground>
  );
}
