import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { AlertCircle, Shield, Loader2, Key } from "lucide-react";
import { toast } from "sonner";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { setPending2FA } = useAuth();
  const [loading, setLoading] = useState(true);
  const [show2FADialog, setShow2FADialog] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  const MAX_ATTEMPTS = 5;

  const handleVerificationFailure = useCallback(async () => {
    setPending2FA(false);
    await supabase.auth.signOut();
    toast.error("2FA verification failed. Please sign in again.");
    navigate("/auth");
  }, [navigate, setPending2FA]);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // Handle OAuth hash fragment - Supabase returns tokens in URL hash
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1)
        );
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        // If we have tokens in hash, let Supabase handle them
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.error("Error setting session from hash:", sessionError);
            navigate("/auth");
            return;
          }
        }

        // Get the session (either from hash or existing)
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          console.error("OAuth callback error:", error);
          navigate("/auth");
          return;
        }

        const user = session.user;
        setUserId(user.id);

        // Check if user has 2FA enabled
        const { data: twoFactorData, error: twoFactorError } = await supabase
          .from("user_2fa")
          .select("is_enabled")
          .eq("user_id", user.id)
          .maybeSingle();

        if (twoFactorError) {
          console.error("Error checking 2FA status:", twoFactorError);
          // If we can't check 2FA, proceed to dashboard (fail open for UX)
          setPending2FA(false);
          navigate("/beebot");
          return;
        }

        if (twoFactorData?.is_enabled) {
          // User has 2FA enabled, show verification dialog
          setPending2FA(true);
          setLoading(false);
          setShow2FADialog(true);
        } else {
          // No 2FA, proceed to dashboard
          setPending2FA(false);
          navigate("/beebot");
        }
      } catch (err) {
        console.error("OAuth callback error:", err);
        navigate("/auth");
      }
    };

    handleOAuthCallback();
  }, [navigate, setPending2FA]);

  const handleVerify2FA = async () => {
    if (attempts >= MAX_ATTEMPTS) {
      await handleVerificationFailure();
      return;
    }

    const codeToVerify = useBackupCode ? backupCode.trim() : totpCode;

    if (!codeToVerify || (!useBackupCode && codeToVerify.length !== 6)) {
      toast.error("Please enter a valid code");
      return;
    }

    setVerifying(true);

    try {
      const response = await supabase.functions.invoke("verify-2fa-login", {
        body: {
          userId,
          totpCode: codeToVerify,
          useBackupCode,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.success) {
        setPending2FA(false);
        toast.success("2FA verification successful!");
        navigate("/beebot");
      } else {
        setAttempts((prev) => prev + 1);
        const remainingAttempts = MAX_ATTEMPTS - attempts - 1;

        if (remainingAttempts <= 0) {
          await handleVerificationFailure();
        } else {
          toast.error(`Invalid code. ${remainingAttempts} attempts remaining.`);
          setTotpCode("");
          setBackupCode("");
        }
      }
    } catch (error) {
      console.error("2FA verification error:", error);
      setAttempts((prev) => prev + 1);
      const remainingAttempts = MAX_ATTEMPTS - attempts - 1;

      if (remainingAttempts <= 0) {
        await handleVerificationFailure();
      } else {
        toast.error(`Verification failed. ${remainingAttempts} attempts remaining.`);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleCancel2FA = async () => {
    setPending2FA(false);
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Dialog open={show2FADialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              {useBackupCode
                ? "Enter one of your backup codes to continue"
                : "Enter the 6-digit code from your authenticator app"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {!useBackupCode ? (
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={totpCode}
                  onChange={(value) => setTotpCode(value)}
                  disabled={verifying}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="Enter backup code"
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-center font-mono text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={verifying}
                />
              </div>
            )}

            {attempts > 0 && (
              <div className="flex items-center gap-2 text-destructive text-sm justify-center">
                <AlertCircle className="h-4 w-4" />
                <span>{MAX_ATTEMPTS - attempts} attempts remaining</span>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleVerify2FA}
                disabled={verifying || (!useBackupCode && totpCode.length !== 6) || (useBackupCode && !backupCode.trim())}
                className="w-full"
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setTotpCode("");
                  setBackupCode("");
                }}
                className="w-full text-sm"
                disabled={verifying}
              >
                <Key className="mr-2 h-4 w-4" />
                {useBackupCode ? "Use authenticator app" : "Use backup code instead"}
              </Button>

              <Button
                variant="outline"
                onClick={handleCancel2FA}
                disabled={verifying}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuthCallback;
