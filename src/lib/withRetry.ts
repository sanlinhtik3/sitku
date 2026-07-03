import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: number[];
  showToast?: boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_BACKOFF = [1000, 2000, 5000];

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    backoffMs = DEFAULT_BACKOFF,
    showToast = true,
    onRetry,
  } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Auto-refresh session on 401
      if (lastError.message?.includes('401') || lastError.message?.includes('JWT')) {
        try {
          await supabase.auth.refreshSession();
        } catch {
          // Session refresh failed, continue with retry
        }
      }

      if (attempt < maxAttempts) {
        const delay = backoffMs[attempt - 1] || backoffMs[backoffMs.length - 1];
        
        if (showToast) {
          toast.info(`Retrying... (attempt ${attempt + 1}/${maxAttempts})`, {
            duration: delay,
          });
        }

        onRetry?.(attempt, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export async function invokeWithRetry<T = any>(
  functionName: string,
  body?: Record<string, any>,
  options?: RetryOptions
): Promise<T> {
  return withRetry(async () => {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });

    if (error) throw error;
    return data as T;
  }, options);
}
