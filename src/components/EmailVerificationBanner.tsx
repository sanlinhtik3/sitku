import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Mail, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const EmailVerificationBanner = () => {
  const { user, emailVerified } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);

  if (!user || emailVerified || dismissed) {
    return null;
  }

  const handleResendVerification = async () => {
    if (!user?.email) return;

    setResending(true);
    try {
      const { error } = await supabase.functions.invoke("resend-verification-email", {
        body: { email: user.email },
      });

      if (error) throw error;

      toast.success("Verification email sent!", {
        description: "Check your inbox and spam folder.",
      });
    } catch (error: any) {
      console.error("Error resending verification:", error);
      toast.error("Failed to resend email", {
        description: error.message || "Please try again later.",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <Alert className="relative border-warning bg-warning/10 mb-6">
      <Mail className="h-4 w-4 text-warning" />
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-4 pr-8">
        <div className="flex-1">
          <span className="font-semibold">Please verify your email address</span>
          <span className="text-sm block sm:inline sm:ml-2">
            We sent a verification link to <span className="font-medium">{user.email}</span>
          </span>
        </div>
        <Button
          onClick={handleResendVerification}
          disabled={resending}
          size="sm"
          variant="outline"
          className="w-full sm:w-auto shrink-0"
        >
          {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Resend Email
        </Button>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
};
