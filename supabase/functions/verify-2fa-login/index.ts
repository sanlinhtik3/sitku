import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import * as OTPAuth from "https://esm.sh/otpauth@9.4.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Rate limiting configuration
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, totpCode, useBackupCode = false } = await req.json();

    if (!userId || !totpCode) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get request metadata for logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Server-side rate limiting check
    const lockoutThreshold = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
    
    const { count: recentAttemptCount, error: countError } = await supabaseAdmin
      .from('two_fa_verification_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('success', false)
      .gte('attempted_at', lockoutThreshold);

    if (countError) {
      console.error('Error checking rate limit:', countError);
    }

    // Check if user is rate limited
    if (recentAttemptCount !== null && recentAttemptCount >= MAX_ATTEMPTS) {
      // Log the blocked attempt
      await supabaseAdmin
        .from('two_fa_verification_attempts')
        .insert({
          user_id: userId,
          attempted_at: new Date().toISOString(),
          success: false,
          ip_address: ipAddress,
          user_agent: userAgent
        });

      const lockoutUntil = new Date(Date.now() + LOCKOUT_WINDOW_MS).toISOString();
      console.log(`Rate limited user ${userId}: ${recentAttemptCount} failed attempts in window`);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Too many verification attempts. Please try again in 5 minutes.',
          lockoutUntil,
          rateLimited: true
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch 2FA configuration for user
    const { data: twoFaData, error: fetchError } = await supabaseAdmin
      .from('user_2fa')
      .select('totp_secret, backup_codes, is_enabled')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .single();

    if (fetchError || !twoFaData) {
      console.error('2FA fetch error:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: '2FA not enabled for this user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let isValid = false;

    if (useBackupCode) {
      // Verify backup code
      isValid = twoFaData.backup_codes.includes(totpCode.toUpperCase());
      
      if (isValid) {
        // Remove used backup code
        const updatedCodes = twoFaData.backup_codes.filter(
          (code: string) => code !== totpCode.toUpperCase()
        );
        await supabaseAdmin
          .from('user_2fa')
          .update({ backup_codes: updatedCodes })
          .eq('user_id', userId);
        
        console.log('Backup code used for user:', userId);
      }
    } else {
      // Verify TOTP code
      try {
        const totp = new OTPAuth.TOTP({
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(twoFaData.totp_secret),
        });

        const delta = totp.validate({ token: totpCode, window: 1 });
        isValid = delta !== null;
        
        console.log('TOTP verification for user:', userId, 'result:', isValid);
      } catch (error) {
        console.error('TOTP verification error:', error);
        isValid = false;
      }
    }

    // Log the verification attempt (success or failure)
    await supabaseAdmin
      .from('two_fa_verification_attempts')
      .insert({
        user_id: userId,
        attempted_at: new Date().toISOString(),
        success: isValid,
        ip_address: ipAddress,
        user_agent: userAgent
      });

    return new Response(
      JSON.stringify({ success: isValid }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-2fa-login:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
