import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceTimeSnapshot, formatUtcOffset } from "@/lib/deviceTime";

// Re-export for backward compatibility (if any external module imports these).
export { OFFSET_TO_IANA, IANA_EXPECTED_OFFSET, formatUtcOffset } from "@/lib/deviceTime";

function detectTimezone(): { timezone: string; offset: number; offsetLabel: string; corrected: boolean } {
  const snap = getDeviceTimeSnapshot();
  return {
    timezone: snap.timezone,
    offset: snap.offsetMinutes,
    offsetLabel: snap.offsetLabel,
    corrected: snap.corrected,
  };
}

interface TimezoneState {
  timezone: string;
  offset: number;
  offsetLabel: string;
  isLoading: boolean;
  corrected: boolean;
  updateTimezone: (tz: string) => Promise<void>;
}

export function useTimezone(userId: string | undefined): TimezoneState {
  const detected = useMemo(() => detectTimezone(), []);
  const [timezone, setTimezone] = useState(detected.timezone);
  const [isLoading, setIsLoading] = useState(!!userId);
  const [synced, setSynced] = useState(false);

  // Load from DB and reconcile
  useEffect(() => {
    if (!userId || synced) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_agent_settings")
          .select("timezone")
          .eq("user_id", userId)
          .single();

        if (cancelled) return;

        const dbTz = data?.timezone;

        if (dbTz && !detected.corrected) {
          // DB has a timezone and device didn't detect a mismatch — use DB value
          setTimezone(dbTz);
        } else if (!dbTz || detected.corrected) {
          // DB is empty OR device detected a correction — save detected to DB
          setTimezone(detected.timezone);
          await supabase
            .from("user_agent_settings")
            .update({ timezone: detected.timezone, updated_at: new Date().toISOString() })
            .eq("user_id", userId);
        }
      } catch {
        // Fallback to detected timezone on any error
        setTimezone(detected.timezone);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setSynced(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [userId, synced, detected]);

  const updateTimezone = useCallback(async (tz: string) => {
    setTimezone(tz);
    if (!userId) return;
    await supabase
      .from("user_agent_settings")
      .update({ timezone: tz, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }, [userId]);

  return {
    timezone,
    offset: detected.offset,
    offsetLabel: detected.corrected ? formatUtcOffset(detected.offset) : formatUtcOffset(new Date().getTimezoneOffset()),
    isLoading,
    corrected: detected.corrected,
    updateTimezone,
  };
}
