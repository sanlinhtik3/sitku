import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'https://zoecrypto.lovable.app';

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const { user_id, title, body, url, tag, image, sound, silent } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'user_id, title, and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all subscriptions for this user
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id);

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'No push subscriptions found for user' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payloadObj: Record<string, any> = {
      title,
      body,
      icon: '/pwa-192x192.png',
      badge: '/favicon.ico',
      url: url || '/',
      tag: tag || 'beebot-notification',
      vibrate: [200, 100, 200, 100, 200], // BeeBot Buzz-Buzz-Buzz
    };

    // Rich media: large banner image
    if (image) payloadObj.image = image;
    // Sound parameter (future Android support)
    if (sound) payloadObj.sound = sound;
    // Silent mode
    if (silent === true) payloadObj.silent = true;

    const payload = JSON.stringify(payloadObj);

    let sent = 0;
    const expiredIds: string[] = [];

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
        sent++;
      } catch (err: any) {
        console.error(`Push failed for ${sub.id}:`, err.statusCode, err.body);
        // 410 Gone or 404 = subscription expired/invalid
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredIds.push(sub.id);
        }
      }
    }

    // Clean up expired subscriptions
    if (expiredIds.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', expiredIds);
      console.log(`Cleaned up ${expiredIds.length} expired subscriptions`);
    }

    return new Response(
      JSON.stringify({ sent, expired: expiredIds.length, total: subscriptions.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Send push error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
