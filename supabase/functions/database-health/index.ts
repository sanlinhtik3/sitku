import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify admin access
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { data: roles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roles) {
      throw new Error('Admin access required');
    }

    // Get table row counts
    const tableNames = [
      'profiles', 'user_sessions', 'courses', 'lessons', 'enrollments',
      'posts', 'notifications', 'user_credits', 'credit_transactions',
      'ai_generated_content', 'user_roles', 'achievements', 'user_achievements',
      'certificates', 'learning_streaks', 'user_statistics'
    ];

    const tableCounts: Record<string, number> = {};
    
    for (const table of tableNames) {
      try {
        const { count } = await supabaseClient
          .from(table)
          .select('*', { count: 'exact', head: true });
        tableCounts[table] = count || 0;
      } catch (error) {
        console.error(`Error counting ${table}:`, error);
        tableCounts[table] = -1; // -1 indicates error
      }
    }

    // Get RLS status for tables
    const { data: rlsData, error: rlsError } = await supabaseClient
      .rpc('get_rls_status' as any);

    // Get database size
    const { data: dbSize } = await supabaseClient
      .rpc('pg_database_size', { database_name: 'postgres' } as any);

    // Get active connections
    const { count: activeConnections } = await supabaseClient
      .from('user_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          tableCounts,
          rlsStatus: rlsData || [],
          activeConnections: activeConnections || 0,
          databaseSize: dbSize || 0,
          timestamp: new Date().toISOString()
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in database-health:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
