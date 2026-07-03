import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SendEmailRequest {
  email: string;
  verificationLink: string;
  userName?: string;
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const getEmailTemplate = (verificationLink: string, userName?: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - ZOE CRYPTO</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #16213e 100%); min-height: 100vh;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #16213e 100%);">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; margin: 0 auto;">
          <!-- Logo -->
          <tr>
            <td style="text-align: center; padding-bottom: 30px;">
              <div style="display: inline-block; padding: 15px 25px; background: rgba(255, 255, 255, 0.05); border-radius: 16px; border: 1px solid rgba(0, 212, 255, 0.2);">
                <span style="font-size: 28px; font-weight: 700; background: linear-gradient(90deg, #00d4ff, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">🪙 ZOE CRYPTO</span>
              </div>
            </td>
          </tr>
          
          <!-- Main Card -->
          <tr>
            <td>
              <div style="background: rgba(255, 255, 255, 0.03); border-radius: 24px; border: 1px solid rgba(0, 212, 255, 0.15); padding: 40px 35px; box-shadow: 0 20px 60px rgba(0, 212, 255, 0.1);">
                <!-- Greeting -->
                <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0 0 20px 0; text-align: center;">
                  ${userName ? `Hello ${userName}! 👋` : 'Hello! 👋'}
                </h1>
                
                <!-- Message -->
                <p style="color: #a0aec0; font-size: 16px; line-height: 1.7; margin: 0 0 30px 0; text-align: center;">
                  Thank you for signing up for <strong style="color: #00d4ff;">ZOE CRYPTO</strong>. 
                  Please verify your email address to get started on your crypto journey.
                </p>
                
                <!-- Button -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="text-align: center; padding: 20px 0;">
                      <a href="${verificationLink}" 
                         style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 12px; box-shadow: 0 8px 25px rgba(0, 212, 255, 0.4); transition: all 0.3s ease;">
                        ✨ Verify Email Address
                      </a>
                    </td>
                  </tr>
                </table>
                
                <!-- Alternative Link -->
                <p style="color: #718096; font-size: 13px; line-height: 1.6; margin: 25px 0 0 0; text-align: center;">
                  If the button doesn't work, copy and paste this link into your browser:
                </p>
                <p style="color: #00d4ff; font-size: 12px; word-break: break-all; background: rgba(0, 212, 255, 0.1); padding: 12px; border-radius: 8px; margin: 10px 0 0 0; text-align: center;">
                  ${verificationLink}
                </p>
                
                <!-- Expiry Notice -->
                <div style="margin-top: 30px; padding: 15px; background: rgba(168, 85, 247, 0.1); border-radius: 12px; border: 1px solid rgba(168, 85, 247, 0.2);">
                  <p style="color: #a855f7; font-size: 13px; margin: 0; text-align: center;">
                    ⏰ This link expires in 24 hours
                  </p>
                </div>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 30px; text-align: center;">
              <p style="color: #4a5568; font-size: 12px; margin: 0 0 10px 0;">
                If you didn't create an account with ZOE CRYPTO, you can safely ignore this email.
              </p>
              <p style="color: #2d3748; font-size: 11px; margin: 0;">
                © 2024 ZOE CRYPTO. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, verificationLink, userName }: SendEmailRequest = await req.json();

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: "Valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!verificationLink) {
      return new Response(
        JSON.stringify({ error: "Verification link is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending custom verification email to: ${email}`);

    const emailHtml = getEmailTemplate(verificationLink, userName);

    const { data, error } = await resend.emails.send({
      from: "ZOE CRYPTO <noreply@zoe.sanlinhtike.com>",
      to: [email],
      subject: "Verify Your Email - ZOE CRYPTO",
      html: emailHtml,
    });

    if (error) {
      console.error("Resend API error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Email sent successfully to ${email}, ID: ${data?.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Verification email sent successfully",
        emailId: data?.id
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-custom-verification-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
