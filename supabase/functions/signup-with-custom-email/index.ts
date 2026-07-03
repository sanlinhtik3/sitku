import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SignupRequest {
  email: string;
  password: string;
  fullName: string;
  referralCode?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { email, password, fullName, referralCode }: SignupRequest = await req.json();

    // Validate input
    if (!email || !password || !fullName) {
      return new Response(
        JSON.stringify({ error: 'Email, password, and full name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password length
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating user account for: ${email}`);

    // Create user WITHOUT sending default email
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Don't auto-confirm - user must verify via email
      user_metadata: { 
        full_name: fullName 
      }
    });

    if (createError) {
      console.error('Error creating user:', createError);
      
      // Handle specific error cases
      if (createError.message?.includes('already registered') || createError.message?.includes('already exists')) {
        return new Response(
          JSON.stringify({ error: 'An account with this email already exists' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: createError.message || 'Failed to create account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userData.user) {
      return new Response(
        JSON.stringify({ error: 'Failed to create user account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User created successfully: ${userData.user.id}`);

    // Process referral code if provided
    if (referralCode) {
      try {
        const { data: referralResult, error: referralError } = await supabase.rpc('process_referral_signup', {
          p_referred_user_id: userData.user.id,
          p_referral_code: referralCode
        });

        if (referralResult?.success) {
          console.log(`Referral processed successfully: ${referralCode}`);
        } else if (referralError) {
          console.log(`Referral processing failed: ${referralError.message}`);
        }
      } catch (refErr) {
        console.log('Referral processing error:', refErr);
        // Don't fail signup if referral fails
      }
    }

    // Generate magic link for verification
    const customDomain = 'https://zoe.sanlinhtike.com';
    const redirectUrl = `${customDomain}/dashboard?verified=true`;

    console.log(`Generating verification link with redirect to: ${redirectUrl}`);

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: redirectUrl
      }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Error generating verification link:', linkError);
      return new Response(
        JSON.stringify({ 
          error: 'Account created but failed to generate verification link',
          userId: userData.user.id
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Modify the action_link to use custom domain
    let verificationLink = linkData.properties.action_link;
    
    // Replace Supabase/Lovable domain with custom domain
    verificationLink = verificationLink.replace(
      /https?:\/\/[^\/]+/,
      customDomain
    );

    console.log(`Sending custom verification email to: ${email}`);

    // Send custom verification email via send-custom-verification-email function
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-custom-verification-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceRoleKey}`
      },
      body: JSON.stringify({
        email,
        verificationLink,
        userName: fullName
      })
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Failed to send custom email:', emailResult);
      // Don't fail signup, user can request resend
      return new Response(
        JSON.stringify({ 
          success: true, 
          userId: userData.user.id,
          message: 'Account created. Please check your email for verification link.',
          emailSent: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Custom verification email sent successfully to: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: userData.user.id,
        message: 'Account created successfully. Please check your email for verification link.',
        emailSent: true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Unexpected error in signup-with-custom-email:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
