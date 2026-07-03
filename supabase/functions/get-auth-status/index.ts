import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role to read auth settings (no authentication required)
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch only the public-facing auth settings
    const { data, error } = await serviceSupabase
      .from('auth_settings')
      .select('signup_enabled, signin_enabled, google_auth_enabled, email_auth_enabled')
      .single();

    if (error) {
      console.error('Error fetching auth settings:', error);
      // Default to allowing all if there's an error
      return Response.json(
        { signup_enabled: true, signin_enabled: true, google_auth_enabled: true, email_auth_enabled: true },
        { headers: corsHeaders }
      );
    }

    return Response.json(
      { 
        signup_enabled: data.signup_enabled,
        signin_enabled: data.signin_enabled,
        google_auth_enabled: data.google_auth_enabled,
        email_auth_enabled: data.email_auth_enabled
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    // Default to allowing all if there's an error
    return Response.json(
      { signup_enabled: true, signin_enabled: true, google_auth_enabled: true, email_auth_enabled: true },
      { headers: corsHeaders }
    );
  }
});
