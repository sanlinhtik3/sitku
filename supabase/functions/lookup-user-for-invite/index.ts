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

    const { searchTerm } = await req.json();

    if (!searchTerm || searchTerm.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Search term is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const term = searchTerm.trim();
    const isEmail = term.includes('@');
    console.log('Looking up user with term:', term, 'isEmail:', isEmail);

    // First, try to find user by email or invite_code in profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, avatar_url, email, invite_code')
      .or(`email.ilike.${term},invite_code.ilike.${term.toUpperCase()}`)
      .maybeSingle();

    if (profileError) {
      console.error('Database error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If found in profiles, return it
    if (profile) {
      console.log('User found in profiles:', profile.user_id);
      return new Response(
        JSON.stringify({ profile }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If searching by email and not found in profiles, try auth.users (self-healing)
    if (isEmail) {
      console.log('Email not found in profiles, checking auth.users...');
      
      const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (authError) {
        console.error('Auth lookup error:', authError);
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find user by email in auth.users
      const authUser = authUsers.users.find(u => u.email?.toLowerCase() === term.toLowerCase());
      
      if (authUser) {
        console.log('User found in auth.users, syncing to profile:', authUser.id);
        
        // Update the profile with the email (self-healing)
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ email: authUser.email })
          .eq('user_id', authUser.id);

        if (updateError) {
          console.error('Failed to sync email to profile:', updateError);
        } else {
          console.log('Email synced to profile successfully');
        }

        // Fetch the updated profile
        const { data: updatedProfile } = await supabaseAdmin
          .from('profiles')
          .select('user_id, full_name, avatar_url, email, invite_code')
          .eq('user_id', authUser.id)
          .single();

        if (updatedProfile) {
          return new Response(
            JSON.stringify({ profile: updatedProfile }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    console.log('User not found for term:', term);
    return new Response(
      JSON.stringify({ error: 'User not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in lookup-user-for-invite:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
