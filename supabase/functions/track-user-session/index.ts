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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    
    // If no user (logged out or invalid token), return success without tracking
    if (!user) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active user session' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userAgent, sessionToken } = await req.json();
    
    // Get IP address from request
    const ipAddress = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';

    // Fetch geolocation data
    let geoData: any = { country: null, city: null, region: null };
    try {
      const geoResponse = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,country,regionName,city,lat,lon`);
      if (geoResponse.ok) {
        const geo = await geoResponse.json();
        if (geo.status === 'success') {
          geoData = {
            country: geo.country,
            city: geo.city,
            region: geo.regionName,
            coordinates: { lat: geo.lat, lon: geo.lon }
          };
        }
      }
    } catch (error) {
      console.error('Geolocation fetch error:', error);
    }

    // Parse user agent to extract device info
    const deviceInfo = parseUserAgent(userAgent);

    // Check single device enforcement and session settings (currently used only for timeout configuration)
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('enforce_single_device, max_concurrent_sessions')
      .eq('user_id', user.id)
      .single();

    const { data: settings } = await supabaseClient
      .from('session_settings')
      .select('*')
      .single();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (settings?.default_session_timeout_minutes || 10080));

    const sessionData = {
      user_id: user.id,
      session_token: sessionToken,
      ip_address: ipAddress,
      user_agent: userAgent,
      device_info: JSON.stringify(deviceInfo),
      country: geoData.country,
      city: geoData.city,
      region: geoData.region,
      coordinates: geoData.coordinates,
      os: deviceInfo.os,
      browser: deviceInfo.browser,
      device_type: deviceInfo.deviceType,
      device_name: deviceInfo.deviceName,
      is_active: true,
      expires_at: expiresAt.toISOString(),
      last_activity: new Date().toISOString()
    };

    const { data: existingSession } = await supabaseClient
      .from('user_sessions')
      .select('id')
      .eq('session_token', sessionToken)
      .eq('user_id', user.id)
      .maybeSingle();

    let session;
    let error;

    if (existingSession) {
      // Update existing session
      const result = await supabaseClient
        .from('user_sessions')
        .update(sessionData)
        .eq('id', existingSession.id)
        .select()
        .single();
      session = result.data;
      error = result.error;
    } else {
      // Insert new session
      const result = await supabaseClient
        .from('user_sessions')
        .insert(sessionData)
        .select()
        .single();
      session = result.data;
      error = result.error;

      // If we get a duplicate key error, it means another request inserted it first
      // Try to update the existing session instead
      if (error && (error as any).code === '23505') {
        console.log('Duplicate session token detected, updating existing session instead');
        const updateResult = await supabaseClient
          .from('user_sessions')
          .update(sessionData)
          .eq('session_token', sessionToken)
          .eq('user_id', user.id)
          .select()
          .maybeSingle();
        session = updateResult.data;
        // Only treat as error if it's not a "no rows" issue
        error = updateResult.error && (updateResult.error as any).code !== 'PGRST116' ? updateResult.error : null;
      }
    }

    if (error) {
      console.error('Session operation error:', error);
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, session }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in track-user-session:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseUserAgent(ua: string): any {
  if (!ua) {
    return {
      os: 'Unknown',
      browser: 'Unknown',
      deviceType: 'Unknown',
      deviceName: 'Unknown Device'
    };
  }

  const isWindows = /Windows/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua);
  const isLinux = /Linux/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  let os = 'Unknown';
  let deviceType = 'Desktop';
  let deviceName = 'Unknown Device';

  if (isWindows) {
    os = 'Windows';
    const match = ua.match(/Windows NT ([\d.]+)/);
    if (match) {
      const version = match[1];
      const versions: Record<string, string> = {
        '10.0': '10/11',
        '6.3': '8.1',
        '6.2': '8',
        '6.1': '7'
      };
      os = `Windows ${versions[version] || version}`;
    }
    deviceName = 'Windows PC';
  } else if (isMac) {
    os = 'macOS';
    deviceName = 'Mac';
  } else if (isAndroid) {
    os = 'Android';
    deviceType = 'Mobile';
    const match = ua.match(/Android ([\d.]+)/);
    if (match) os = `Android ${match[1]}`;
    deviceName = 'Android Device';
  } else if (isIOS) {
    deviceType = 'Mobile';
    if (/iPad/i.test(ua)) {
      os = 'iPadOS';
      deviceName = 'iPad';
      deviceType = 'Tablet';
    } else if (/iPhone/i.test(ua)) {
      os = 'iOS';
      deviceName = 'iPhone';
    } else {
      os = 'iOS';
      deviceName = 'iPod';
    }
    const match = ua.match(/OS ([\d_]+)/);
    if (match) {
      const version = match[1].replace(/_/g, '.');
      os = `${os} ${version}`;
    }
  } else if (isLinux) {
    os = 'Linux';
    deviceName = 'Linux PC';
  }

  // Detect browser
  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/MSIE|Trident\//i.test(ua)) {
    browser = 'Internet Explorer';
  }

  return { os, browser, deviceType, deviceName };
}