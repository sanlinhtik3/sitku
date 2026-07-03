import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isLocalRepositoryRuntime } from "@/repositories/runtime/runtimeMode";

export const ProtectedRoute = ({
  children,
  requireEmailVerification = true,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireEmailVerification?: boolean;
}) => {
  const { user, isBanned, emailVerified, loading, pending2FA } = useAuth();
  const navigate = useNavigate();
  const isLocalRuntime = isLocalRepositoryRuntime();

  useEffect(() => {
    if (isLocalRuntime) return;
    if (!loading) {
      if (!user) {
        navigate("/auth");
      } else if (pending2FA) {
        navigate("/auth/callback");
      } else if (requireEmailVerification && !emailVerified) {
        const email = user.email || "";
        navigate(`/verify-email?email=${encodeURIComponent(email)}&unverified=true`);
      } else if (isBanned) {
        navigate("/auth");
      }
    }
  }, [user, isBanned, emailVerified, loading, navigate, requireEmailVerification, pending2FA, isLocalRuntime]);

  if (isLocalRuntime) return <>{children}</>;
  if (loading) return null;

  if (!user || pending2FA || isBanned || (requireEmailVerification && !emailVerified)) {
    return null;
  }

  return <>{children}</>;
};
