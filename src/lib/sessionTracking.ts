import { supabase } from "@/integrations/supabase/client";

export const SESSION_TOKEN_KEY = 'session_token';

export function generateSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function setSessionToken(token: string): void {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function trackUserSession(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    let sessionToken = getSessionToken();
    if (!sessionToken) {
      sessionToken = generateSessionToken();
      setSessionToken(sessionToken);
    }

    const userAgent = navigator.userAgent;

    await supabase.functions.invoke('track-user-session', {
      body: {
        sessionToken,
        userAgent
      }
    });
  } catch (error) {
    console.error('Error tracking session:', error);
  }
}

export async function validateSession(): Promise<boolean> {
  try {
    const sessionToken = getSessionToken();
    if (!sessionToken) return false;

    // Use getSession() (local) instead of getUser() (network call)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    const { data: sessionData } = await supabase
      .from('user_sessions')
      .select('is_active, revoked_at')
      .eq('session_token', sessionToken)
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!sessionData || !sessionData.is_active || sessionData.revoked_at) {
      await supabase.auth.signOut();
      clearSessionToken();
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating session:', error);
    return false;
  }
}

export async function endUserSession(): Promise<void> {
  try {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    // Use getSession() (local) instead of getUser() (network call)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    await supabase
      .from('user_sessions')
      .update({ 
        is_active: false,
        revoked_at: new Date().toISOString()
      })
      .eq('session_token', sessionToken)
      .eq('user_id', session.user.id);
      
    clearSessionToken();
  } catch (error) {
    console.error('Error ending session:', error);
  }
}

// Optimized: Single DB operation instead of validate + getUser + update (4 ops → 1 op)
export async function updateSessionActivity(): Promise<void> {
  try {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    // Use getSession() (local, zero network latency) instead of getUser() (network)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    // Combined validation + update: if 0 rows affected, session is invalid
    const { data } = await supabase
      .from('user_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('session_token', sessionToken)
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .select('id');

    // If no rows were updated, session has been revoked
    if (data && data.length === 0) {
      await supabase.auth.signOut();
      clearSessionToken();
    }
  } catch (error) {
    console.error('Error updating session activity:', error);
  }
}

