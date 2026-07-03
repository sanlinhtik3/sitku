import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const VIMEO_ACCESS_TOKEN = Deno.env.get('VIMEO_ACCESS_TOKEN');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const extractVimeoId = (url: string): string | null => {
  const regExp = /(?:www\.|player\.)?vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:[a-zA-Z0-9_\-]+)?/;
  const match = url.match(regExp);
  return match ? match[1] : null;
};

const cleanFilename = (filename: string): string => {
  // Remove extension and clean up the filename
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  // Replace underscores and hyphens with spaces
  const cleaned = nameWithoutExt.replace(/[_-]/g, ' ');
  // Capitalize first letter of each word
  return cleaned.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, videoUrl, fileSize, fileName, vimeoId } = await req.json();
    
    if (action === 'create-upload') {
      console.log('Creating Vimeo upload for file:', fileName, 'size:', fileSize);
      
      // Create a new video entry on Vimeo with TUS upload approach
      const response = await fetch('https://api.vimeo.com/me/videos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VIMEO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.vimeo.*+json;version=3.4',
        },
        body: JSON.stringify({
          upload: {
            approach: 'tus',
            size: fileSize,
          },
          name: fileName,
          privacy: {
            view: 'unlisted', // Make videos unlisted by default
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vimeo create upload error:', response.status, errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to create Vimeo upload',
          details: errorText 
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const uploadData = await response.json();
      const videoId = uploadData.uri.split('/').pop();
      const cleanedTitle = cleanFilename(fileName);
      
      console.log('Successfully created Vimeo upload, ID:', videoId);
      
      return new Response(JSON.stringify({
        success: true,
        uploadLink: uploadData.upload.upload_link,
        videoUri: uploadData.uri,
        vimeoId: videoId,
        suggestedTitle: cleanedTitle,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (action === 'get-metadata') {
      console.log('Fetching metadata for Vimeo ID:', vimeoId);
      
      if (!vimeoId) {
        return new Response(JSON.stringify({ error: 'Missing vimeoId parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const response = await fetch(`https://api.vimeo.com/videos/${vimeoId}`, {
        headers: {
          'Authorization': `Bearer ${VIMEO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vimeo API error:', response.status, errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to fetch video metadata',
          details: errorText 
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const videoData = await response.json();
      const status = videoData.status;
      const isReady = status === 'available';
      
      console.log('Video metadata fetched, status:', status);
      
      return new Response(JSON.stringify({
        success: true,
        vimeoId,
        duration: Math.round(videoData.duration / 60), // Convert to minutes
        thumbnail: videoData.pictures?.sizes?.[videoData.pictures.sizes.length - 1]?.link || null,
        embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
        status,
        isReady,
        name: videoData.name,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (action === 'delete') {
      console.log('Deleting Vimeo video:', vimeoId);
      
      if (!vimeoId) {
        return new Response(JSON.stringify({ error: 'Missing vimeoId parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const response = await fetch(`https://api.vimeo.com/videos/${vimeoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${VIMEO_ACCESS_TOKEN}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        console.error('Vimeo delete error:', response.status, errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to delete video',
          details: errorText 
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Successfully deleted Vimeo video');
      
      return new Response(JSON.stringify({
        success: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (action === 'validate') {
      console.log('Validating Vimeo URL:', videoUrl);
      
      // Validate Vimeo URL and fetch metadata
      const vimeoId = extractVimeoId(videoUrl);
      if (!vimeoId) {
        console.error('Invalid Vimeo URL format');
        return new Response(JSON.stringify({ error: 'Invalid Vimeo URL' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch video metadata from Vimeo API
      console.log('Fetching video metadata for Vimeo ID:', vimeoId);
      const response = await fetch(`https://api.vimeo.com/videos/${vimeoId}`, {
        headers: {
          'Authorization': `Bearer ${VIMEO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vimeo API error:', response.status, errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to fetch video from Vimeo API',
          details: errorText 
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const videoData = await response.json();
      console.log('Successfully fetched Vimeo video metadata');
      
      return new Response(JSON.stringify({
        success: true,
        vimeoId,
        duration: Math.round(videoData.duration / 60), // Convert to minutes
        thumbnail: videoData.pictures?.sizes?.[0]?.link || null,
        embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle unknown actions
    console.error('Unknown action:', action);
    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Vimeo operation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
