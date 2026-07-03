import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SendVerificationRequest {
  email: string;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the caller is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email }: SendVerificationRequest = await req.json();

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin ${user.email} sending verification email to: ${email}`);

    // Check if user exists
    const { data: userData } = await supabase.auth.admin.listUsers();
    const targetUser = userData?.users.find(u => u.email === email);

    if (!targetUser) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (targetUser.email_confirmed_at) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Email is already verified"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the admin action
    await supabase
      .from('admin_audit_logs')
      .insert({
        admin_user_id: user.id,
        action: 'send_verification_email',
        resource_type: 'user',
        resource_id: targetUser.id,
        details: { target_email: email },
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown'
      });

    // Generate verification link using Admin API
    // Use custom domain for redirect - goes directly to dashboard
    const customDomain = 'https://zoe.sanlinhtike.com';
    const redirectUrl = `${customDomain}/dashboard?verified=true`;
    
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: redirectUrl,
      }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Error generating verification link:', linkError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate verification link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace redirect_to in the generated link with custom domain
    let verificationLink = linkData.properties.action_link;
    const oldDomain = 'https://zoecrypto.lovable.app';
    const newDomain = redirectUrl;
    
    // Try unencoded version first (most common)
    verificationLink = verificationLink.replace(oldDomain, newDomain);
    // Also try encoded version as fallback
    verificationLink = verificationLink.replace(encodeURIComponent(oldDomain), encodeURIComponent(newDomain));
    
    console.log('Original link:', linkData.properties.action_link);
    console.log('Modified verification link:', verificationLink);

    // Get user's name from profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', targetUser.id)
      .single();

    // Send custom email via Resend
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-custom-verification-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        email: email,
        verificationLink: verificationLink,
        userName: profileData?.full_name || null,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Error sending custom email:', errorData);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send verification email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Verification email sent successfully to ${email} by admin via custom email`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Verification email sent successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in admin-send-verification-code function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
