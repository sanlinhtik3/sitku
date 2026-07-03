import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/xml; charset=utf-8",
};

const BASE_URL = "https://zoecrypto.com";

const STATIC_ROUTES = [
  { loc: "/", priority: "1.0", changefreq: "daily" },
  { loc: "/courses", priority: "0.9", changefreq: "weekly" },
  { loc: "/learn", priority: "0.9", changefreq: "daily" },
  { loc: "/ai-content-pricing", priority: "0.7", changefreq: "monthly" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch published courses
    const { data: courses } = await supabase
      .from("courses")
      .select("slug, updated_at")
      .eq("is_published", true);

    // Fetch published posts
    const { data: posts } = await supabase
      .from("posts")
      .select("slug, published_at, updated_at")
      .eq("status", "published");

    const now = new Date().toISOString().split("T")[0];

    let urls = STATIC_ROUTES.map(
      (r) => `
  <url>
    <loc>${BASE_URL}${r.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
    );

    if (courses) {
      for (const c of courses) {
        urls.push(`
  <url>
    <loc>${BASE_URL}/course/${c.slug}</loc>
    <lastmod>${(c.updated_at || now).split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
      }
    }

    if (posts) {
      for (const p of posts) {
        urls.push(`
  <url>
    <loc>${BASE_URL}/post/${p.slug}</loc>
    <lastmod>${(p.published_at || p.updated_at || now).split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("")}
</urlset>`;

    return new Response(xml, { headers: corsHeaders });
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response("<error>Failed to generate sitemap</error>", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
