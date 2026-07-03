// ═══ Sentry initialization ═══
// Init at module load. Reads VITE_SENTRY_DSN from env. Silently no-ops if unset
// (so local dev does not require a DSN).
import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.info("[Sentry] VITE_SENTRY_DSN not set — error reporting disabled.");
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_APP_VERSION as string) || undefined,
    // Performance: sample 10% in prod, 100% in dev
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Session replay (optional, off by default — enable when DSN supports it)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 0.05 : 0,
    // Drop noisy / non-actionable errors before send
    beforeSend(event, hint) {
      const err = hint?.originalException;
      const msg = err instanceof Error ? err.message : String(err ?? "");
      // ResizeObserver loop benign warning
      if (/ResizeObserver loop/.test(msg)) return null;
      // Network aborts from cancelled streams (we trigger these intentionally)
      if (err instanceof Error && err.name === "AbortError") return null;
      // Browser extension noise
      if (/extension:\/\//.test(msg)) return null;
      return event;
    },
  });
  initialized = true;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    console.error("[App error]", error, context);
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info"): void {
  if (!initialized) return;
  Sentry.captureMessage(message, level);
}

export function setUser(user: { id: string; email?: string } | null): void {
  if (!initialized) return;
  Sentry.setUser(user);
}

export function setContext(key: string, value: Record<string, unknown> | null): void {
  if (!initialized) return;
  Sentry.setContext(key, value);
}
