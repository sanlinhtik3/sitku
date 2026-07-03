import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";
import { isLocalRepositoryRuntime } from "@/repositories/runtime/runtimeMode";

const DEFAULT_LOCAL_USER_ID = "local-user";

export function useWorkspaceIdentity() {
  const { user, loading } = useAuth();
  const { settings } = useRepositories();
  const isLocal = isLocalRepositoryRuntime();
  const [localUserId, setLocalUserId] = useState<string | null>(isLocal ? null : DEFAULT_LOCAL_USER_ID);

  useEffect(() => {
    if (!isLocal) return;
    let cancelled = false;

    settings.get<string>("workspace.localUserId")
      .then(async (stored) => {
        const nextUserId = stored || DEFAULT_LOCAL_USER_ID;
        if (!stored) await settings.set("workspace.localUserId", nextUserId);
        if (!cancelled) setLocalUserId(nextUserId);
      })
      .catch(() => {
        if (!cancelled) setLocalUserId(DEFAULT_LOCAL_USER_ID);
      });

    return () => {
      cancelled = true;
    };
  }, [isLocal, settings]);

  if (isLocal) {
    return {
      userId: localUserId,
      ready: Boolean(localUserId),
      isLocal: true,
    };
  }

  return {
    userId: user?.id ?? null,
    ready: !loading && Boolean(user?.id),
    isLocal: false,
  };
}
