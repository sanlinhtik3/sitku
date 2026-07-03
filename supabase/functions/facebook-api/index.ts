// ═══ Facebook Graph API Proxy Edge Function ═══
// Routes BeeBot agent tool calls to Facebook Graph API v21.0

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const { action, page_id, page_access_token, message, post_id, comment_id, reply_text, limit } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), { status: 400, headers: corsHeaders });
    }

    // Resolve token: from request body or from stored facebook_pages
    let accessToken = page_access_token;
    let resolvedPageId = page_id;

    if (!accessToken && page_id) {
      const { data: page } = await supabase
        .from("facebook_pages")
        .select("page_access_token, page_id")
        .eq("user_id", userId)
        .eq("page_id", page_id)
        .eq("is_active", true)
        .maybeSingle();
      if (page?.page_access_token) {
        accessToken = page.page_access_token;
        resolvedPageId = page.page_id;
      }
    }

    // If still no token, try default page
    if (!accessToken) {
      const { data: defaultPage } = await supabase
        .from("facebook_pages")
        .select("page_access_token, page_id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("is_default", true)
        .maybeSingle();
      if (defaultPage?.page_access_token) {
        accessToken = defaultPage.page_access_token;
        resolvedPageId = defaultPage.page_id;
      }
    }

    // For verify_token, token must come from body
    if (action === "verify_token") {
      if (!page_access_token) {
        return new Response(JSON.stringify({ error: "page_access_token is required for verification" }), { status: 400, headers: corsHeaders });
      }
      const res = await fetch(`${GRAPH_API}/me?access_token=${encodeURIComponent(page_access_token)}&fields=id,name,fan_count,about,category`);
      const data = await res.json();
      if (data.error) {
        return new Response(JSON.stringify({ success: false, error: data.error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, page: data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "No Facebook page token found. Please connect a page first." }), { status: 400, headers: corsHeaders });
    }

    let result: any;

    switch (action) {
      case "post": {
        if (!message) {
          return new Response(JSON.stringify({ error: "message is required for posting" }), { status: 400, headers: corsHeaders });
        }
        const res = await fetch(`${GRAPH_API}/${resolvedPageId}/feed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, access_token: accessToken }),
        });
        result = await res.json();
        if (result.error) throw new Error(result.error.message);
        result = { success: true, post_id: result.id, message: `✅ Posted to Facebook page successfully!` };
        break;
      }

      case "reply_comment": {
        if (!comment_id || !reply_text) {
          return new Response(JSON.stringify({ error: "comment_id and reply_text are required" }), { status: 400, headers: corsHeaders });
        }
        const res = await fetch(`${GRAPH_API}/${comment_id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: reply_text, access_token: accessToken }),
        });
        result = await res.json();
        if (result.error) throw new Error(result.error.message);
        result = { success: true, comment_id: result.id, message: "✅ Reply posted successfully!" };
        break;
      }

      case "get_posts": {
        const postLimit = Math.min(limit || 10, 25);
        const res = await fetch(`${GRAPH_API}/${resolvedPageId}/feed?fields=id,message,created_time,likes.summary(true),comments.summary(true)&limit=${postLimit}&access_token=${encodeURIComponent(accessToken)}`);
        result = await res.json();
        if (result.error) throw new Error(result.error.message);
        result = {
          success: true,
          posts: (result.data || []).map((p: any) => ({
            id: p.id,
            message: p.message?.substring(0, 200) || "(no text)",
            created_time: p.created_time,
            likes: p.likes?.summary?.total_count || 0,
            comments: p.comments?.summary?.total_count || 0,
          })),
          count: result.data?.length || 0,
        };
        break;
      }

      case "get_comments": {
        if (!post_id) {
          return new Response(JSON.stringify({ error: "post_id is required" }), { status: 400, headers: corsHeaders });
        }
        const commentLimit = Math.min(limit || 10, 25);
        const res = await fetch(`${GRAPH_API}/${post_id}/comments?fields=id,from,message,created_time,like_count&limit=${commentLimit}&access_token=${encodeURIComponent(accessToken)}`);
        result = await res.json();
        if (result.error) throw new Error(result.error.message);
        result = {
          success: true,
          comments: (result.data || []).map((c: any) => ({
            id: c.id,
            from: c.from?.name || "Unknown",
            message: c.message,
            created_time: c.created_time,
            likes: c.like_count || 0,
          })),
          count: result.data?.length || 0,
        };
        break;
      }

      case "delete_post": {
        if (!post_id) {
          return new Response(JSON.stringify({ error: "post_id is required" }), { status: 400, headers: corsHeaders });
        }
        const res = await fetch(`${GRAPH_API}/${post_id}?access_token=${encodeURIComponent(accessToken)}`, { method: "DELETE" });
        result = await res.json();
        if (result.error) throw new Error(result.error.message);
        result = { success: true, message: "✅ Post deleted successfully!" };
        break;
      }

      case "get_page_info": {
        const res = await fetch(`${GRAPH_API}/${resolvedPageId}?fields=id,name,fan_count,about,category,website,link&access_token=${encodeURIComponent(accessToken)}`);
        result = await res.json();
        if (result.error) throw new Error(result.error.message);
        result = { success: true, page: result };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[facebook-api] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
