import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const appUrl = Deno.env.get("APP_URL") || "https://zoecrypto.lovable.app";

    if (error) {
      return Response.redirect(`${appUrl}/beebot?notion_error=${encodeURIComponent(error)}`, 302);
    }

    if (!code || !state) {
      return Response.redirect(`${appUrl}/beebot?notion_error=missing_params`, 302);
    }

    // Verify signed state
    let userId: string;
    try {
      const parsed = JSON.parse(atob(state));
      const { p: payload, s: signature } = parsed;
      if (!payload || !signature) throw new Error("Invalid state structure");

      // Verify HMAC signature
      const secret = Deno.env.get("NOTION_OAUTH_CLIENT_SECRET")!;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
      );
      const sigBytes = new Uint8Array(signature.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
      const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payload));
      if (!valid) throw new Error("Signature mismatch");

      const payloadData = JSON.parse(payload);
      userId = payloadData.userId;
      if (!userId) throw new Error("No userId");

      // Check expiry — 10 min max
      const age = Date.now() - (payloadData.ts || 0);
      if (age > 10 * 60 * 1000) throw new Error("State expired");
    } catch (e) {
      console.error("State verification failed:", (e as Error).message);
      return Response.redirect(`${appUrl}/beebot?notion_error=invalid_state`, 302);
    }

    const clientId = Deno.env.get("NOTION_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("NOTION_OAUTH_CLIENT_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notion-oauth-callback`;

    // Exchange code for access token
    const tokenResp = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text();
      console.error("Notion token exchange failed:", errBody);
      return Response.redirect(`${appUrl}/beebot?notion_error=token_exchange_failed`, 302);
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    const workspaceName = tokenData.workspace_name || "Notion Workspace";

    // Save to database using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: dbError } = await supabase
      .from("ai_user_settings")
      .upsert(
        {
          user_id: userId,
          notion_api_key: accessToken,
          notion_workspace_name: workspaceName,
        },
        { onConflict: "user_id" }
      );

    if (dbError) {
      console.error("DB save error:", dbError);
      return Response.redirect(`${appUrl}/beebot?notion_error=save_failed`, 302);
    }

    // Success — redirect back to app
    return Response.redirect(`${appUrl}/beebot?notion_connected=true`, 302);
  } catch (err) {
    console.error("Notion OAuth callback error:", err);
    const appUrl = Deno.env.get("APP_URL") || "https://zoecrypto.lovable.app";
    return Response.redirect(`${appUrl}/beebot?notion_error=unexpected`, 302);
  }
});
