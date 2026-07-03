import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Bot, Clock, Shield, WifiOff, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthDisabledPage } from "@/components/AuthDisabledPage";
import { PasswordInput, PasswordStrengthIndicator } from "@/components/auth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// Memoized schemas for performance
const createSchemas = () => ({
  signUp: z.object({
    email: z.string().email('Invalid email').max(255),
    password: z.string()
      .min(8, 'Min 8 characters')
      .max(128)
      .regex(/[A-Z]/, 'Uppercase letter required')
      .regex(/[a-z]/, 'Lowercase letter required')
      .regex(/[0-9]/, 'Number required'),
    confirmPassword: z.string(),
    fullName: z.string().trim().min(1, 'Name required').max(100)
  }).refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"]
  }),
  signIn: z.object({
    email: z.string().email('Invalid email').max(255),
    password: z.string().min(1, 'Password required').max(128)
  })
});

const Auth = () => {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const [loading, setLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [authStatus, setAuthStatus] = useState<{ 
    signup_enabled: boolean; 
    signin_enabled: boolean;
    google_auth_enabled: boolean;
    email_auth_enabled: boolean;
  } | null>(null);
  const [loadingAuthStatus, setLoadingAuthStatus] = useState(true);
  
  // Password strength tracking for signup
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  
  // Two-step sign-in
  const [signInStep, setSignInStep] = useState<"email" | "password">("email");
  const [signInEmail, setSignInEmail] = useState("");
  
  // 2FA states with stored credentials
  const [twoFactorDialogOpen, setTwoFactorDialogOpen] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [twoFaAttempts, setTwoFaAttempts] = useState(0);
  const MAX_2FA_ATTEMPTS = 5;
  
  const schemas = useMemo(() => createSchemas(), []);

  // Fetch auth status on mount and subscribe to realtime changes
  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-auth-status');
        if (!error && data) {
          setAuthStatus(data);
        } else {
          setAuthStatus({ signup_enabled: true, signin_enabled: true, google_auth_enabled: true, email_auth_enabled: true });
        }
      } catch (error) {
        console.error('Error fetching auth status:', error);
        setAuthStatus({ signup_enabled: true, signin_enabled: true, google_auth_enabled: true, email_auth_enabled: true });
      } finally {
        setLoadingAuthStatus(false);
      }
    };

    fetchAuthStatus();

    const channel = supabase
      .channel('auth-settings-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auth_settings'
        },
        (payload) => {
          if (payload.new) {
            setAuthStatus({
              signup_enabled: payload.new.signup_enabled,
              signin_enabled: payload.new.signin_enabled,
              google_auth_enabled: payload.new.google_auth_enabled,
              email_auth_enabled: payload.new.email_auth_enabled
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === 'true') {
      toast.success("Email verified!", {
        description: "You can now sign in to your account.",
      });
      window.history.replaceState({}, '', '/auth');
    }
  }, []);

  useEffect(() => {
    if (lockoutUntil) {
      const timer = setInterval(() => {
        const now = new Date();
        const diff = Math.max(0, Math.floor((lockoutUntil.getTime() - now.getTime()) / 1000));
        setRemainingSeconds(diff);
        
        if (diff === 0) {
          setLockoutUntil(null);
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [lockoutUntil]);

  // Check password match on change
  useEffect(() => {
    if (confirmPassword && signupPassword !== confirmPassword) {
      setPasswordMismatch(true);
    } else {
      setPasswordMismatch(false);
    }
  }, [signupPassword, confirmPassword]);

  // Auto-verify 2FA when code is complete
  useEffect(() => {
    if (twoFactorCode.length === 6 && twoFaAttempts < MAX_2FA_ATTEMPTS) {
      handleVerify2FA();
    }
  }, [twoFactorCode]);

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!isOnline) {
      toast.error("You're offline", { description: "Please check your internet connection." });
      return;
    }
    
    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPwd = formData.get("confirmPassword") as string;
    const fullName = formData.get("fullName") as string;
    const honeypot = formData.get("website") as string;

    if (honeypot) return;

    const validationResult = schemas.signUp.safeParse({ email, password, confirmPassword: confirmPwd, fullName });
    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("signup-with-custom-email", {
        body: { 
          email, 
          password, 
          fullName
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      supabase.functions.invoke("log-auth-attempt", {
        body: { email, attemptType: "signup", success: true },
      }).catch(() => {});
      toast.success("Account created!", {
        description: "Check your email for the verification link.",
      });
      
      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
      form.reset();
      setSignupPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      supabase.functions.invoke("log-auth-attempt", {
        body: { email, attemptType: "signup", success: false },
      }).catch(() => {});
      
      // User-friendly error messages
      const message = error.message?.toLowerCase() || "";
      if (message.includes("already registered") || message.includes("already exists")) {
        toast.error("Account already exists", { description: "Try signing in instead." });
      } else {
        toast.error(error.message || "Sign up failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!isOnline) {
      toast.error("You're offline", { description: "Please check your internet connection." });
      return;
    }
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const validation = schemas.signIn.safeParse({ email, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password,
      });

      if (error) {
        const errorMessage = error.message?.toLowerCase() || '';
        const isVerificationError = 
          errorMessage.includes('confirm') || 
          errorMessage.includes('verified') || 
          errorMessage.includes('verification') ||
          errorMessage.includes('not confirmed');
        
        if (isVerificationError) {
          setLoading(false);
          toast.warning("Email verification required", {
            description: "Please verify your email to access your account.",
          });
          navigate(`/verify-email?email=${encodeURIComponent(email)}&unverified=true`);
          return;
        }
        
        supabase.functions.invoke('log-auth-attempt', {
          body: { email, success: false, attemptType: 'signin' }
        }).catch(() => {});
        
        // User-friendly error messages
        if (errorMessage.includes("invalid") || errorMessage.includes("credentials")) {
          throw new Error("Invalid email or password");
        }
        throw error;
      }

      if (data.user && !data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        setLoading(false);
        toast.warning("Email verification required", {
          description: "Please verify your email to access your account.",
        });
        navigate(`/verify-email?email=${encodeURIComponent(email)}&unverified=true`);
        return;
      }

      const { data: twoFaData } = await supabase
        .from("user_2fa")
        .select("is_enabled")
        .eq("user_id", data.user.id)
        .maybeSingle();

      const isTwoFactorEnabled = twoFaData?.is_enabled === true;

      if (isTwoFactorEnabled) {
        // Store credentials securely in state for 2FA re-auth
        setPendingUserId(data.user.id);
        setPendingCredentials({ email: validation.data.email, password: validation.data.password });
        setTwoFactorDialogOpen(true);
        setTwoFaAttempts(0);
        setLoading(false);
        
        await supabase.auth.signOut();
        
        toast.info("Two-Factor Authentication Required", {
          description: "Enter the 6-digit code from your authenticator app.",
        });
        return;
      }

      supabase.functions.invoke('log-auth-attempt', {
        body: { email, success: true, attemptType: 'signin' }
      }).catch(() => {});

      toast.success("Welcome back!");
      navigate("/beebot");
    } catch (error: any) {
      setLoading(false);
      toast.error(error.message || "Failed to sign in");
    }
  };

  const handleVerify2FA = async () => {
    if (!pendingUserId || !pendingCredentials || twoFactorCode.length !== 6) return;
    if (twoFaAttempts >= MAX_2FA_ATTEMPTS) {
      toast.error("Too many attempts", { description: "Please try signing in again." });
      handle2FACancel();
      return;
    }

    setVerifying2FA(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-2fa-login", {
        body: { 
          userId: pendingUserId, 
          totpCode: twoFactorCode,
          useBackupCode 
        },
      });

      if (error) throw error;

      if (data?.success) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: pendingCredentials.email,
          password: pendingCredentials.password,
        });

        if (signInError) throw signInError;

        toast.success("2FA verified!", { description: "Welcome back!" });
        
        setTwoFactorDialogOpen(false);
        setTwoFactorCode("");
        setPendingUserId(null);
        setPendingCredentials(null);
        setUseBackupCode(false);
        setTwoFaAttempts(0);
        navigate("/beebot");
      } else {
        throw new Error("Invalid verification code");
      }
    } catch (error: any) {
      setTwoFaAttempts(prev => prev + 1);
      const remaining = MAX_2FA_ATTEMPTS - twoFaAttempts - 1;
      
      if (remaining <= 0) {
        toast.error("Too many failed attempts", { description: "Please try signing in again." });
        handle2FACancel();
      } else {
        toast.error("Invalid code", {
          description: `${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        });
      }
      setTwoFactorCode("");
    } finally {
      setVerifying2FA(false);
    }
  };

  const handle2FACancel = () => {
    setTwoFactorDialogOpen(false);
    setTwoFactorCode("");
    setPendingUserId(null);
    setPendingCredentials(null);
    setUseBackupCode(false);
    setTwoFaAttempts(0);
    toast.info("Sign-in cancelled", { description: "You can try again anytime." });
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      toast.error("Please enter your email address");
      return;
    }
    
    if (!isOnline) {
      toast.error("You're offline", { description: "Please check your internet connection." });
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.functions.invoke('request-password-reset', {
        body: { email: resetEmail }
      });

      if (error) throw error;

      toast.success("If an account exists with this email, you will receive a password reset link shortly.");
      setForgotPasswordOpen(false);
      setResetEmail("");
    } catch (error: any) {
      toast.error("Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGoogleSignIn = async () => {
    if (!isOnline) {
      toast.error("You're offline", { description: "Please check your internet connection." });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) throw error;
    } catch (error: any) {
      toast.error("Google sign-in failed", { description: error.message });
      setLoading(false);
    }
  };

  if (!loadingAuthStatus && !authStatus?.signup_enabled && !authStatus?.signin_enabled) {
    return <AuthDisabledPage />;
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
            <WifiOff className="h-4 w-4" />
            <span className="text-sm font-medium">You're offline. Please check your connection.</span>
          </div>
        )}
        
        <Link to="/" className="flex items-center justify-center gap-2 mb-8" aria-label="Go to homepage">
          <Bot className="h-10 w-10 text-primary" aria-hidden="true" />
          <span className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            BeeBot
          </span>
        </Link>

        <Card className="border-white/[0.06] bg-card/20 backdrop-blur-xl rounded-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome</CardTitle>
            <CardDescription>
              Sign in to continue with your BeeBot agent
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAuthStatus ? (
              <div className="space-y-4" aria-busy="true" aria-label="Loading authentication options">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !authStatus?.signup_enabled && !authStatus?.signin_enabled ? (
              <div className="text-center py-8 space-y-2" role="alert">
                <p className="font-semibold text-muted-foreground">Authentication Disabled</p>
                <p className="text-sm text-muted-foreground">
                  Registration and sign-in are temporarily unavailable. Please check back later.
                </p>
              </div>
            ) : (
              <Tabs 
                defaultValue={authStatus?.signin_enabled ? "signin" : "signup"} 
                className="w-full"
              >
                <TabsList className={`grid w-full ${authStatus?.signup_enabled && authStatus?.signin_enabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {authStatus?.signin_enabled && <TabsTrigger value="signin" onClick={() => setSignInStep("email")}>Sign In</TabsTrigger>}
                  {authStatus?.signup_enabled && <TabsTrigger value="signup" onClick={() => setSignInStep("email")}>Sign Up</TabsTrigger>}
                </TabsList>

                <TabsContent value="signin">
                  {lockoutUntil && remainingSeconds > 0 ? (
                    <div className="text-center py-8 space-y-4" role="alert" aria-live="assertive">
                      <Clock className="h-12 w-12 mx-auto text-destructive" aria-hidden="true" />
                      <div>
                        <p className="font-semibold text-destructive">Account Temporarily Locked</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Too many failed attempts. Please try again in:
                        </p>
                        <p className="text-2xl font-bold text-primary mt-2" aria-live="polite">
                          {formatTime(remainingSeconds)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Google Sign-In Button */}
                      {authStatus?.google_auth_enabled && (
                        <Button 
                          type="button"
                          variant="outline" 
                          className="w-full flex items-center gap-3 h-11 border-border/50 hover:bg-accent/50"
                          onClick={handleGoogleSignIn}
                          disabled={loading || !isOnline}
                        >
                          <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                              fill="#4285F4"
                            />
                            <path
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                              fill="#34A853"
                            />
                            <path
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                              fill="#FBBC05"
                            />
                            <path
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                              fill="#EA4335"
                            />
                          </svg>
                          Continue with Google
                        </Button>
                      )}
                      
                      {/* Divider */}
                      {authStatus?.google_auth_enabled && authStatus?.email_auth_enabled && (
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-border/50" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-card px-2 text-muted-foreground">or continue with email</span>
                          </div>
                        </div>
                      )}

                      {/* Email/Password Form - Two Step */}
                      {authStatus?.email_auth_enabled && (
                        <>
                          {signInStep === "email" ? (
                            <div className="space-y-4" aria-label="Sign in - enter email">
                              <div className="space-y-2">
                                <Label htmlFor="signin-email">Email</Label>
                                <Input
                                  id="signin-email"
                                  type="email"
                                  placeholder="you@example.com"
                                  value={signInEmail}
                                  onChange={(e) => setSignInEmail(e.target.value)}
                                  autoComplete="email"
                                  inputMode="email"
                                  enterKeyHint="next"
                                  autoCapitalize="off"
                                  autoCorrect="off"
                                  spellCheck={false}
                                  aria-required="true"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const emailSchema = z.string().email("Invalid email").max(255);
                                      const result = emailSchema.safeParse(signInEmail);
                                      if (!result.success) {
                                        toast.error(result.error.errors[0].message);
                                        return;
                                      }
                                      setSignInStep("password");
                                    }
                                  }}
                                />
                              </div>
                              <Button
                                type="button"
                                className="w-full"
                                variant="hero"
                                disabled={!signInEmail || !isOnline}
                                onClick={() => {
                                  const emailSchema = z.string().email("Invalid email").max(255);
                                  const result = emailSchema.safeParse(signInEmail);
                                  if (!result.success) {
                                    toast.error(result.error.errors[0].message);
                                    return;
                                  }
                                  setSignInStep("password");
                                }}
                              >
                                Continue
                              </Button>
                            </div>
                          ) : (
                            <form onSubmit={handleSignIn} className="space-y-4" aria-label="Sign in form">
                              {/* Hidden email field for form submission */}
                              <input type="hidden" name="email" value={signInEmail} />
                              
                              <div className="space-y-2">
                                <Label>Email</Label>
                                <div className="flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                                  <span className="flex-1 truncate text-foreground">{signInEmail}</span>
                                  <button
                                    type="button"
                                    onClick={() => setSignInStep("email")}
                                    className="text-xs text-primary hover:underline whitespace-nowrap"
                                  >
                                    Change
                                  </button>
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label htmlFor="signin-password">Password</Label>
                                  <button
                                    type="button"
                                    onClick={() => setForgotPasswordOpen(true)}
                                    className="text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                                  >
                                    Forgot password?
                                  </button>
                                </div>
                                <PasswordInput
                                  id="signin-password"
                                  name="password"
                                  placeholder="••••••••"
                                  required
                                  autoFocus
                                  autoComplete="current-password"
                                  enterKeyHint="go"
                                  aria-required="true"
                                />
                              </div>
                              <Button 
                                type="submit" 
                                className="w-full" 
                                variant="hero" 
                                disabled={loading || !isOnline}
                                aria-busy={loading}
                              >
                                {loading ? "Signing in..." : "Sign In"}
                              </Button>
                            </form>
                          )}
                        </>
                      )}
                      
                      {/* No auth methods available */}
                      {!authStatus?.google_auth_enabled && !authStatus?.email_auth_enabled && (
                        <div className="text-center py-4">
                          <p className="text-sm text-muted-foreground">
                            No sign-in methods are currently available.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="signup">
                  <div className="space-y-4">
                    {/* Google Sign-Up Button */}
                    {authStatus?.google_auth_enabled && (
                      <Button 
                        type="button"
                        variant="outline" 
                        className="w-full flex items-center gap-3 h-11 border-border/50 hover:bg-accent/50"
                        onClick={handleGoogleSignIn}
                        disabled={loading || !isOnline}
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                          <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                          />
                          <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                          />
                          <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                          />
                          <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                          />
                        </svg>
                        Continue with Google
                      </Button>
                    )}
                    
                    {/* Divider */}
                    {authStatus?.google_auth_enabled && authStatus?.email_auth_enabled && (
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border/50" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">or sign up with email</span>
                        </div>
                      </div>
                    )}

                    {/* Email/Password Form */}
                    {authStatus?.email_auth_enabled && (
                      <form onSubmit={handleSignUp} className="space-y-4" aria-label="Sign up form">
                        <div className="space-y-2">
                          <Label htmlFor="signup-name">Full Name</Label>
                          <Input
                            id="signup-name"
                            name="fullName"
                            type="text"
                            placeholder="John Doe"
                            required
                            autoComplete="name"
                            autoCapitalize="words"
                            enterKeyHint="next"
                            aria-required="true"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-email">Email</Label>
                          <Input
                            id="signup-email"
                            name="email"
                            type="email"
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                            inputMode="email"
                            enterKeyHint="next"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-required="true"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-password">Password</Label>
                          <PasswordInput
                            id="signup-password"
                            name="password"
                            placeholder="••••••••"
                            required
                            autoComplete="new-password"
                            enterKeyHint="next"
                            value={signupPassword}
                            onChange={(e) => setSignupPassword(e.target.value)}
                            aria-required="true"
                            aria-describedby="password-requirements"
                          />
                          <PasswordStrengthIndicator password={signupPassword} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                          <PasswordInput
                            id="signup-confirm-password"
                            name="confirmPassword"
                            placeholder="••••••••"
                            required
                            autoComplete="new-password"
                            enterKeyHint="go"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            aria-required="true"
                            aria-invalid={passwordMismatch}
                            aria-describedby={passwordMismatch ? "password-mismatch-error" : undefined}
                          />
                          {passwordMismatch && (
                            <p 
                              id="password-mismatch-error" 
                              className="text-xs text-destructive flex items-center gap-1"
                              role="alert"
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              Passwords don't match
                            </p>
                          )}
                        </div>
                        {/* Honeypot field */}
                        <input
                          type="text"
                          name="website"
                          autoComplete="off"
                          tabIndex={-1}
                          className="absolute opacity-0 pointer-events-none"
                          aria-hidden="true"
                        />
                        <Button 
                          type="submit" 
                          className="w-full" 
                          variant="hero" 
                          disabled={loading || !isOnline || passwordMismatch}
                          aria-busy={loading}
                        >
                          {loading ? "Creating account..." : "Sign Up"}
                        </Button>
                      </form>
                    )}
                    
                    {/* No auth methods available */}
                    {!authStatus?.google_auth_enabled && !authStatus?.email_auth_enabled && (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">
                          No sign-up methods are currently available.
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent aria-describedby="forgot-password-description">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription id="forgot-password-description">
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                enterKeyHint="send"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
              />
            </div>
            <Button 
              onClick={handleForgotPassword} 
              className="w-full" 
              variant="hero"
              disabled={resetLoading || !resetEmail || !isOnline}
              aria-busy={resetLoading}
            >
              {resetLoading ? "Sending..." : "Send Reset Link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Two-Factor Authentication Dialog */}
      <Dialog open={twoFactorDialogOpen} onOpenChange={(open) => !open && handle2FACancel()}>
        <DialogContent className="sm:max-w-md" aria-describedby="2fa-description">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
              <DialogTitle>Two-Factor Authentication</DialogTitle>
            </div>
            <DialogDescription id="2fa-description">
              {useBackupCode 
                ? "Enter one of your backup codes"
                : "Enter the 6-digit code from your authenticator app"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {twoFaAttempts >= MAX_2FA_ATTEMPTS ? (
              <div className="text-center py-4" role="alert">
                <AlertTriangle className="h-8 w-8 mx-auto text-destructive mb-2" aria-hidden="true" />
                <p className="text-sm text-destructive font-medium">Too many failed attempts</p>
                <p className="text-xs text-muted-foreground mt-1">Please try signing in again.</p>
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(value) => setTwoFactorCode(value)}
                    disabled={verifying2FA}
                    autoFocus
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

                {twoFaAttempts > 0 && (
                  <p className="text-xs text-center text-muted-foreground" role="status" aria-live="polite">
                    {MAX_2FA_ATTEMPTS - twoFaAttempts} attempt{MAX_2FA_ATTEMPTS - twoFaAttempts === 1 ? '' : 's'} remaining
                  </p>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUseBackupCode(!useBackupCode)}
                  className="w-full"
                >
                  {useBackupCode ? "Use Authenticator Code" : "Use Backup Code"}
                </Button>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handle2FACancel}
              disabled={verifying2FA}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
