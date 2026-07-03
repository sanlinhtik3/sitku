import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface PasswordResetRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email }: PasswordResetRequest = await req.json();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return Response.json(
        { error: 'Invalid email format' },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`Password reset requested for: ${email}`);

    // Send password reset email using resetPasswordForEmail
    // This method actually sends the email (unlike admin.generateLink which only generates)
    // Supabase handles checking if email exists - doesn't reveal account existence
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${req.headers.get('origin') || 'http://localhost:8080'}/reset-password`,
    });

    if (error) {
      console.error('Error sending reset email:', error);
      // Still return success to not reveal if email exists
    } else {
      console.log(`Password reset email sent to ${email}`);
    }

    // Always return generic success message
    return Response.json(
      { 
        message: 'If an account exists with this email, you will receive a password reset link shortly.' 
      },
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('Error in request-password-reset:', error);
    return Response.json(
      { error: 'An error occurred processing your request' },
      { status: 500, headers: corsHeaders }
    );
  }
};

serve(handler);
