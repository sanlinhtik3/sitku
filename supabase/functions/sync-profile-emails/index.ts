import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Get all profiles without email
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, invite_code')
      .or('email.is.null,invite_code.is.null');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${profiles?.length || 0} profiles to sync`);

    let synced = 0;
    let errors = 0;

    for (const profile of profiles || []) {
      try {
        const updates: any = {};

        // Sync email if missing
        if (!profile.email) {
          const { data: authData } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
          if (authData?.user?.email) {
            updates.email = authData.user.email;
          }
        }

        // Generate invite code if missing
        if (!profile.invite_code) {
          const code = profile.user_id.replace(/-/g, '').substring(0, 8).toUpperCase();
          updates.invite_code = code;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update(updates)
            .eq('user_id', profile.user_id);

          if (updateError) {
            console.error(`Error updating profile ${profile.user_id}:`, updateError);
            errors++;
          } else {
            synced++;
          }
        }
      } catch (err) {
        console.error(`Error processing profile ${profile.user_id}:`, err);
        errors++;
      }
    }

    console.log(`Sync complete: ${synced} synced, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced, 
        errors,
        total: profiles?.length || 0 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-profile-emails:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
