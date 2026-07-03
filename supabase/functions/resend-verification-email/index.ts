import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ResendVerificationRequest {
  email: string;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email }: ResendVerificationRequest = await req.json();

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: "Valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Resend verification requested for: ${email}`);

    // Check if user exists and if email is already verified
    const { data: userData } = await supabase.auth.admin.listUsers();
    const user = userData?.users.find(u => u.email === email);

    if (!user) {
      // Don't reveal if user exists
      return new Response(
        JSON.stringify({ message: "If this email is registered, a verification email has been sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (user.email_confirmed_at) {
      return new Response(
        JSON.stringify({ 
          error: "Email is already verified",
          message: "Your email is already verified. You can sign in now."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cooldown - only allow 1 email per 60 seconds per email
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    
    const { data: recentAttempts } = await supabase
      .from('login_attempts')
      .select('id')
      .eq('email', email)
      .eq('attempt_type', 'verification_resend')
      .gte('attempt_time', oneMinuteAgo)
      .limit(1);

    if (recentAttempts && recentAttempts.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: "Please wait 60 seconds before requesting another verification email",
          cooldownSeconds: 60 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the resend attempt
    await supabase
      .from('login_attempts')
      .insert({
        email,
        attempt_type: 'verification_resend',
        success: true,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown'
      });

    // Generate verification link using Admin API
    // Use custom domain for redirect - goes directly to dashboard
    const customDomain = 'https://zoe.sanlinhtike.com';
    const redirectUrl = `${customDomain}/dashboard?verified=true`;
    
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: redirectUrl,
      }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Error generating verification link:', linkError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate verification link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace redirect_to in the generated link with custom domain
    let verificationLink = linkData.properties.action_link;
    const oldDomain = 'https://zoecrypto.lovable.app';
    const newDomain = redirectUrl;
    
    // Try unencoded version first (most common)
    verificationLink = verificationLink.replace(oldDomain, newDomain);
    // Also try encoded version as fallback
    verificationLink = verificationLink.replace(encodeURIComponent(oldDomain), encodeURIComponent(newDomain));
    
    console.log('Original link:', linkData.properties.action_link);
    console.log('Modified verification link:', verificationLink);

    // Get user's name from profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .single();

    // Try to send custom verification email first
    try {
      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-custom-verification-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          email: email,
          verificationLink: verificationLink,
          userName: profileData?.full_name || null,
        }),
      });

      if (!emailResponse.ok) {
        throw new Error('Custom email failed');
      }

      console.log(`Custom verification email sent to ${email}`);
      console.log(`Verification link sent successfully to ${email} via custom email`);

      return new Response(
        JSON.stringify({ 
          success: true,
          message: "Verification email sent successfully"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (customEmailError) {
      console.log('Custom email failed, falling back to Supabase default email');
      
      // Fallback to Supabase's default verification email
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (resendError) {
        console.error('Fallback email also failed:', resendError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to send verification email" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Fallback verification email sent to ${email}`);

      return new Response(
        JSON.stringify({ 
          success: true,
          message: "Verification email sent successfully (via fallback)"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error("Error in resend-verification-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
