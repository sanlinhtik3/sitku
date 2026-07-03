import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface UpdateSettingsRequest {
  signup_enabled?: boolean;
  signin_enabled?: boolean;
  rate_limit_enabled?: boolean;
  max_login_attempts?: number;
  lockout_duration_minutes?: number;
  require_email_verification?: boolean;
  unverified_cleanup_days?: number;
  block_disposable_emails?: boolean;
  google_auth_enabled?: boolean;
  email_auth_enabled?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json(
        { error: 'No authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Use service role client to verify JWT and get user
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Extract JWT token from Authorization header
    const jwt = authHeader.replace('Bearer ', '');
    
    // Verify user is authenticated by getting user from JWT
    const { data: { user }, error: userError } = await serviceSupabase.auth.getUser(jwt);
    if (userError || !user) {
      console.error('Auth error:', userError);
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { data: isAdmin } = await serviceSupabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (!isAdmin) {
      return Response.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403, headers: corsHeaders }
      );
    }

    const updates: UpdateSettingsRequest = await req.json();

    console.log('Admin updating auth settings:', updates);

    // Update settings
    const { data, error } = await serviceSupabase
      .from('auth_settings')
      .update({
        ...updates,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', (await serviceSupabase.from('auth_settings').select('id').single()).data?.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating settings:', error);
      return Response.json(
        { error: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    console.log('Auth settings updated successfully by', user.id);

    return Response.json(
      { data },
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('Error in update-auth-settings:', error);
    return Response.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
};

serve(handler);
