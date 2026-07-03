import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { isLocalRepositoryRuntime } from "@/repositories/runtime/runtimeMode";

interface UserStatus {
  isBanned: boolean;
}

const DEFAULT_STATUS: UserStatus = { isBanned: false };

// Minimal user shape that satisfies downstream consumers
interface LocalUser {
  id: string;
  email?: string;
  email_confirmed_at?: string;
}

interface AuthContextType {
  user: LocalUser | null;
  session: unknown | null;
  isAdmin: boolean;
  isCreator: boolean;
  isBanned: boolean;
  emailVerified: boolean;
  loading: boolean;
  pending2FA: boolean;
  setPending2FA: (pending: boolean) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isAdmin: false,
  isCreator: false,
  isBanned: false,
  emailVerified: false,
  loading: true,
  pending2FA: false,
  setPending2FA: () => {},
  signOut: async () => {},
});

// Synthetic local user — no login required
const LOCAL_USER: LocalUser = {
  id: "local-user",
  email: "local@beebot.local",
  email_confirmed_at: new Date().toISOString(),
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const isLocalRuntime = isLocalRepositoryRuntime();
  const navigate = useNavigate();

  // ── Local-first fast path: no Supabase, no network, no waiting ──
  if (isLocalRuntime) {
    const signOut = async () => {
      navigate("/beebot");
    };

    return (
      <AuthContext.Provider
        value={{
          user: LOCAL_USER,
          session: null,
          isAdmin: false,
          isCreator: false,
          isBanned: false,
          emailVerified: true,
          loading: false,
          pending2FA: false,
          setPending2FA: () => {},
          signOut,
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  // ── Cloud path: lazy-load Supabase only when needed ──
  return <SupabaseAuthProvider navigate={navigate}>{children}</SupabaseAuthProvider>;
};

/**
 * Supabase auth is isolated in this component so that the Supabase client
 * module is only imported when the runtime mode is "supabase".
 * In local mode the import never happens, preventing any network calls.
 */
function SupabaseAuthProvider({
  children,
  navigate,
}: {
  children: React.ReactNode;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [session, setSession] = useState<unknown | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus>(DEFAULT_STATUS);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending2FA, setPending2FA] = useState(false);
  const lastProcessedUserId = useRef<string | null>(null);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    import("@/integrations/supabase/client").then(({ supabase }) => {
      const { data } = supabase.auth.onAuthStateChange((_event: string, sess: any) => {
        setSession(sess);
        setUser(sess?.user ?? null);
        setEmailVerified(!!sess?.user?.email_confirmed_at);
        setLoading(false);
      });
      subscription = data.subscription;

      supabase.auth.getSession().then(({ data: { session: sess } }: any) => {
        setSession(sess);
        setUser(sess?.user ?? null);
        setEmailVerified(!!sess?.user?.email_confirmed_at);
        setLoading(false);
      });
    }).catch(() => {
      // Supabase unavailable — fall back to unauthenticated
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setUser(null);
    setSession(null);
    setUserStatus(DEFAULT_STATUS);
    setEmailVerified(false);
    navigate("/auth");
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAdmin: false,
        isCreator: false,
        isBanned: userStatus.isBanned,
        emailVerified,
        loading,
        pending2FA,
        setPending2FA,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
