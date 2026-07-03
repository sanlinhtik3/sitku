import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface LogAttemptRequest {
  email: string;
  success: boolean;
  attemptType: 'signin' | 'signup';
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

    const { email, success, attemptType }: LogAttemptRequest = await req.json();
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    console.log(`Logging ${attemptType} attempt for ${email}: ${success ? 'SUCCESS' : 'FAILED'}`);

    // Insert login attempt record
    const { error } = await supabase
      .from('login_attempts')
      .insert({
        email: email.toLowerCase(),
        ip_address: ipAddress,
        success,
        user_agent: userAgent,
        attempt_type: attemptType
      });

    if (error) {
      console.error('Error logging attempt:', error);
    }

    return Response.json(
      { success: true },
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('Error in log-auth-attempt:', error);
    return Response.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
};

serve(handler);
