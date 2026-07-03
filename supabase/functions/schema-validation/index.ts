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

    // Get all columns using RPC function
    const { data: schemaData, error: schemaError } = await supabaseClient
      .rpc('get_table_columns');

    if (schemaError) {
      console.error('Schema query error:', schemaError);
      throw new Error('Failed to fetch schema information');
    }

    // Group by table
    const tables: Record<string, any[]> = {};
    (schemaData || []).forEach((col: any) => {
      if (!tables[col.table_name]) {
        tables[col.table_name] = [];
      }
      tables[col.table_name].push({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
        default: col.column_default
      });
    });

    // Check for common issues
    const issues = [];

    // Check for tables without primary keys
    const { data: pkData } = await supabaseClient
      .rpc('get_tables_without_pk');

    if (pkData && pkData.length > 0) {
      issues.push({
        severity: 'warning',
        type: 'missing_primary_key',
        message: `Tables without primary keys: ${pkData.join(', ')}`,
        tables: pkData
      });
    }

    // Check for nullable foreign keys
    for (const [tableName, columns] of Object.entries(tables)) {
      const nullableFKs = columns.filter(col => 
        (col.name.endsWith('_id') || col.name === 'user_id') && 
        col.nullable && 
        col.name !== 'id'
      );

      if (nullableFKs.length > 0) {
        issues.push({
          severity: 'info',
          type: 'nullable_foreign_key',
          message: `Table '${tableName}' has nullable foreign keys`,
          table: tableName,
          columns: nullableFKs.map(c => c.name)
        });
      }
    }

    // Check RLS enabled
    const { data: rlsCheck } = await supabaseClient
      .rpc('get_tables_without_rls');

    if (rlsCheck && rlsCheck.length > 0) {
      issues.push({
        severity: 'critical',
        type: 'rls_disabled',
        message: `Tables without RLS enabled: ${rlsCheck.join(', ')}`,
        tables: rlsCheck
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          tables,
          tableCount: Object.keys(tables).length,
          columnCount: Object.values(tables).reduce((sum, cols) => sum + cols.length, 0),
          issues,
          timestamp: new Date().toISOString()
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in schema-validation:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
