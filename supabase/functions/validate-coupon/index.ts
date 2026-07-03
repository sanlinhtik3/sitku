import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
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

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Authentication required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      );
    }

    const { couponCode, courseId } = await req.json();

    if (!couponCode || !courseId) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Coupon code and course ID are required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log('Validating coupon:', { couponCode, courseId, userId: user.id });

    // Fetch the coupon
    const { data: coupon, error: couponError } = await supabaseClient
      .from('coupons')
      .select('*')
      .eq('code', couponCode.toUpperCase())
      .single();

    if (couponError || !coupon) {
      console.log('Coupon not found:', couponCode);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'This coupon code does not exist. Please check and try again.' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Check if coupon is active
    if (!coupon.is_active) {
      console.log('Coupon is not active:', couponCode);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'This coupon is no longer available.' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Check if coupon is within valid date range
    const now = new Date();
    const validFrom = new Date(coupon.valid_from);
    const validUntil = new Date(coupon.valid_until);

    if (now < validFrom || now > validUntil) {
      console.log('Coupon expired or not yet valid:', { now, validFrom, validUntil });
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'This coupon has expired and can no longer be used.' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Check usage limit
    if (coupon.current_uses >= coupon.max_uses) {
      console.log('Coupon usage limit reached:', { current: coupon.current_uses, max: coupon.max_uses });
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'This coupon has reached its maximum number of uses.' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Check if user already used this coupon
    const { data: existingUsage } = await supabaseClient
      .from('coupon_usage')
      .select('id')
      .eq('user_id', user.id)
      .eq('coupon_id', coupon.id)
      .maybeSingle();

    if (existingUsage) {
      console.log('User already used this coupon:', user.id);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "You've already used this coupon code." 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Check if coupon applies to this course
    if (coupon.applicable_course_ids && coupon.applicable_course_ids.length > 0) {
      if (!coupon.applicable_course_ids.includes(courseId)) {
        console.log('Coupon not valid for this course:', { couponCode, courseId });
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: 'This coupon is not valid for this course. Try browsing other courses where it may apply.' 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }
    }

    // Fetch course details to calculate discount
    const { data: course, error: courseError } = await supabaseClient
      .from('courses')
      .select('price')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      console.error('Course not found:', courseId);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Course not found' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      );
    }

    const originalPrice = parseFloat(course.price);
    const discountAmount = (originalPrice * coupon.discount_percentage) / 100;
    const finalPrice = originalPrice - discountAmount;

    console.log('Coupon validation successful:', {
      code: coupon.code,
      discount: coupon.discount_percentage,
      originalPrice,
      finalPrice,
      accessDuration: coupon.access_duration_days
    });

    return new Response(
      JSON.stringify({
        valid: true,
        coupon: {
          code: coupon.code,
          discount_percentage: coupon.discount_percentage,
          access_duration_days: coupon.access_duration_days,
          original_price: originalPrice,
          discounted_price: finalPrice,
          savings: discountAmount,
          expires_at: coupon.valid_until
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in validate-coupon function:', error);
    return new Response(
      JSON.stringify({ 
        valid: false, 
        error: error instanceof Error ? error.message : 'An error occurred while validating the coupon' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
