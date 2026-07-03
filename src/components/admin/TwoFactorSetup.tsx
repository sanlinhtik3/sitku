import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { generateTOTPSecret, verifyTOTPToken, generateBackupCodes } from "@/lib/twoFactorAuth";
import { logAdminAction } from "@/lib/auditLog";
import { Shield, ShieldCheck, ShieldOff, Copy, Key } from "lucide-react";

interface TwoFactorSetupProps {
  embedded?: boolean;
}

export function TwoFactorSetup({ embedded = false }: TwoFactorSetupProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [verificationCode, setVerificationCode] = useState("");
  const [setupData, setSetupData] = useState<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  } | null>(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  // Fetch current 2FA status
  const { data: twoFactorStatus, isLoading } = useQuery({
    queryKey: ["twoFactorStatus"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("user_2fa")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  // Start 2FA setup
  const startSetupMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("User email not found");

      const { secret, qrCode } = await generateTOTPSecret(user.email);
      const backupCodes = generateBackupCodes();

      return { secret, qrCode, backupCodes };
    },
    onSuccess: (data) => {
      setSetupData(data);
      toast({
        title: "2FA Setup Started",
        description: "Scan the QR code with your authenticator app",
      });
    },
    onError: () => {
      toast({
        title: "Setup Failed",
        description: "Failed to start 2FA setup",
        variant: "destructive",
      });
    },
  });

  // Verify and enable 2FA
  const enableMutation = useMutation({
    mutationFn: async () => {
      if (!setupData) throw new Error("Setup data not found");
      if (!verifyTOTPToken(setupData.secret, verificationCode)) {
        throw new Error("Invalid verification code");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("user_2fa").upsert({
        user_id: user.id,
        totp_secret: setupData.secret,
        backup_codes: setupData.backupCodes,
        is_enabled: true,
        enabled_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

      if (error) throw error;

      await logAdminAction("2fa_enabled", "security", user.id);
    },
    onSuccess: () => {
      setShowBackupCodes(true);
      queryClient.invalidateQueries({ queryKey: ["twoFactorStatus"] });
      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication has been enabled",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disable 2FA
  const disableMutation = useMutation({
    mutationFn: async (disableCode: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch current 2FA config
      const { data: twoFaData, error: fetchError } = await supabase
        .from("user_2fa")
        .select("totp_secret, backup_codes")
        .eq("user_id", user.id)
        .eq("is_enabled", true)
        .single();

      if (fetchError || !twoFaData) {
        throw new Error("2FA not enabled");
      }

      // Verify the code before disabling
      const isValidTotp = verifyTOTPToken(twoFaData.totp_secret, disableCode);
      const isValidBackup = twoFaData.backup_codes.includes(disableCode.toUpperCase());

      if (!isValidTotp && !isValidBackup) {
        throw new Error("Invalid verification code");
      }

      const { error } = await supabase
        .from("user_2fa")
        .update({ is_enabled: false })
        .eq("user_id", user.id);

      if (error) throw error;

      await logAdminAction("2fa_disabled", "security", user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["twoFactorStatus"] });
      setSetupData(null);
      setVerificationCode("");
      setShowDisableConfirm(false);
      setDisableCode("");
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to disable 2FA",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyBackupCodes = () => {
    if (setupData) {
      navigator.clipboard.writeText(setupData.backupCodes.join("\n"));
      toast({ title: "Copied", description: "Backup codes copied to clipboard" });
    }
  };

  if (isLoading) {
    return <div className="h-4 w-24 rounded bg-muted/30 animate-pulse" />;
  }

  const isEnabled = twoFactorStatus?.is_enabled;

  const contentBody = (
    <>
      {!isEnabled && !setupData && (
        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              Enable 2FA to protect your account with time-based one-time passwords (TOTP).
            </AlertDescription>
          </Alert>
          <Button onClick={() => startSetupMutation.mutate()} disabled={startSetupMutation.isPending}>
            <Shield className="mr-2 h-4 w-4" />
            Enable 2FA
          </Button>
        </div>
      )}

      {setupData && !showBackupCodes && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">Step 1: Scan QR Code</h4>
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </p>
            <div className="flex justify-center p-4 bg-background rounded-lg border">
              <img src={setupData.qrCode} alt="2FA QR Code" className="w-48 h-48" />
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Step 2: Verify Code</h4>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                maxLength={6}
                className="text-center text-lg tracking-widest"
              />
              <Button
                onClick={() => enableMutation.mutate()}
                disabled={verificationCode.length !== 6 || enableMutation.isPending}
              >
                Verify & Enable
              </Button>
            </div>
          </div>

          <Button variant="ghost" onClick={() => setSetupData(null)}>
            Cancel
          </Button>
        </div>
      )}

      {setupData && showBackupCodes && (
        <div className="space-y-4">
          <Alert>
            <Key className="h-4 w-4" />
            <AlertDescription>
              Save these backup codes in a secure place. You can use them to access your account if you lose your authenticator device.
            </AlertDescription>
          </Alert>
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {setupData.backupCodes.map((code, i) => (
                <div key={i} className="p-2 bg-background rounded border text-center">
                  {code}
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={copyBackupCodes} className="w-full">
              <Copy className="mr-2 h-4 w-4" />
              Copy Backup Codes
            </Button>
          </div>
          <Button onClick={() => {
            setShowBackupCodes(false);
            setSetupData(null);
            setVerificationCode("");
          }}>
            Done
          </Button>
        </div>
      )}

      {isEnabled && !setupData && (
        <div className="space-y-4">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>
              Your account is protected with two-factor authentication.
            </AlertDescription>
          </Alert>
          
          <AlertDialog open={showDisableConfirm} onOpenChange={setShowDisableConfirm}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <ShieldOff className="mr-2 h-4 w-4" />
                Disable 2FA
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disable Two-Factor Authentication</AlertDialogTitle>
                <AlertDialogDescription className="space-y-4">
                  <p>This will make your account less secure. To confirm, enter your current 6-digit code from your authenticator app or a backup code.</p>
                  <InputOTP
                    maxLength={6}
                    value={disableCode}
                    onChange={(value) => setDisableCode(value)}
                    disabled={disableMutation.isPending}
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
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel 
                  onClick={() => {
                    setDisableCode("");
                    setShowDisableConfirm(false);
                  }}
                  disabled={disableMutation.isPending}
                >
                  Cancel
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (disableCode.length === 6) {
                      disableMutation.mutate(disableCode);
                    }
                  }}
                  disabled={disableMutation.isPending || disableCode.length !== 6}
                >
                  {disableMutation.isPending ? "Disabling..." : "Verify & Disable"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isEnabled ? <ShieldCheck className="h-5 w-5 text-primary" /> : <Shield className="h-5 w-5" />}
            <span className="font-semibold">Two-Factor Authentication</span>
          </div>
          <Badge variant={isEnabled ? "default" : "secondary"}>
            {isEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        {contentBody}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isEnabled ? <ShieldCheck className="h-5 w-5 text-primary" /> : <Shield className="h-5 w-5" />}
              Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your admin account
            </CardDescription>
          </div>
          <Badge variant={isEnabled ? "default" : "secondary"}>
            {isEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {contentBody}
      </CardContent>
    </Card>
  );
}
