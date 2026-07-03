import { supabase } from "@/integrations/supabase/client";

type Severity = 'info' | 'warning' | 'error' | 'critical';

interface ErrorLogEntry {
  error_source: string;
  error_message: string;
  error_stack?: string;
  severity?: Severity;
  context?: Record<string, any>;
}

/**
 * Log a system error to the centralized system_error_logs table.
 * Uses service role via edge function to bypass RLS.
 * Falls back to console.error if logging fails.
 */
export async function logSystemError(entry: ErrorLogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Use edge function to write with service role (bypasses RLS)
    await supabase.functions.invoke('app-health-check', {
      body: {
        action: 'log_error',
        ...entry,
        severity: entry.severity || 'error',
        user_id: user?.id || null,
      },
    });
  } catch (e) {
    // Fallback: don't let error logging break the app
    console.error('[SystemErrorLogger] Failed to log error:', entry.error_message, e);
  }
}

/**
 * Capture unhandled errors globally.
 * Call this once in your app's entry point.
 */
export function initGlobalErrorCapture(): void {
  window.addEventListener('error', (event) => {
    logSystemError({
      error_source: 'window.onerror',
      error_message: event.message,
      error_stack: event.error?.stack,
      severity: 'error',
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    logSystemError({
      error_source: 'unhandledrejection',
      error_message: reason?.message || String(reason),
      error_stack: reason?.stack,
      severity: 'error',
    });
  });
}
