import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const title = url.searchParams.get("title") || "ZOE CRYPTO";
    const author = url.searchParams.get("author") || "";
    const type = url.searchParams.get("type") || "article";

    const truncatedTitle = title.length > 80 ? title.substring(0, 77) + "..." : title;
    const typeBadge = type === "course" ? "📚 Course" : "📝 Article";

    return new ImageResponse(
      React.createElement(
        "div",
        {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "60px",
            background: "linear-gradient(135deg, #0a0f1e 0%, #1a1f3e 50%, #0a0f1e 100%)",
            fontFamily: "Inter, sans-serif",
          },
        },
        // Top: Logo + Badge
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            },
          },
          React.createElement(
            "div",
            {
              style: {
                fontSize: "28px",
                fontWeight: "700",
                color: "#ffffff",
                letterSpacing: "2px",
              },
            },
            "ZOE CRYPTO"
          ),
          React.createElement(
            "div",
            {
              style: {
                fontSize: "18px",
                color: "#a78bfa",
                background: "rgba(167, 139, 250, 0.15)",
                padding: "8px 20px",
                borderRadius: "20px",
                border: "1px solid rgba(167, 139, 250, 0.3)",
              },
            },
            typeBadge
          )
        ),
        // Middle: Title card
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: "20px",
              padding: "40px",
              border: "1px solid rgba(167, 139, 250, 0.2)",
              boxShadow: "0 0 60px rgba(167, 139, 250, 0.1)",
            },
          },
          React.createElement(
            "div",
            {
              style: {
                fontSize: "44px",
                fontWeight: "700",
                color: "#ffffff",
                lineHeight: "1.2",
                display: "-webkit-box",
                overflow: "hidden",
              },
            },
            truncatedTitle
          ),
          author
            ? React.createElement(
                "div",
                {
                  style: {
                    fontSize: "22px",
                    color: "rgba(255, 255, 255, 0.6)",
                  },
                },
                `By ${author}`
              )
            : null
        ),
        // Bottom: URL
        React.createElement(
          "div",
          {
            style: {
              fontSize: "18px",
              color: "rgba(255, 255, 255, 0.4)",
              letterSpacing: "1px",
            },
          },
          "zoecrypto.com"
        )
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error("OG image error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate image" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
