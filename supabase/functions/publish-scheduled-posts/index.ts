import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting scheduled posts publication check...');

    // Find all posts that should be published
    const { data: scheduledPosts, error: fetchError } = await supabase
      .from('posts')
      .select('id, title, published_at')
      .eq('is_published', false)
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString());

    if (fetchError) {
      console.error('Error fetching scheduled posts:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${scheduledPosts?.length || 0} posts to publish`);

    if (!scheduledPosts || scheduledPosts.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No posts to publish',
          publishedCount: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Publish the posts
    const postIds = scheduledPosts.map(post => post.id);
    const { error: updateError } = await supabase
      .from('posts')
      .update({ is_published: true })
      .in('id', postIds);

    if (updateError) {
      console.error('Error publishing posts:', updateError);
      throw updateError;
    }

    console.log(`Successfully published ${scheduledPosts.length} posts:`, 
      scheduledPosts.map(p => p.title).join(', '));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Published ${scheduledPosts.length} posts`,
        publishedCount: scheduledPosts.length,
        posts: scheduledPosts.map(p => ({ id: p.id, title: p.title }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in publish-scheduled-posts function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
