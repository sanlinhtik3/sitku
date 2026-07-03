import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create client with user's auth token for authentication
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify user is authenticated
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      console.error('Unauthorized: No user found')
      throw new Error('Unauthorized')
    }

    // Create service role client for database operations (bypasses RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { courseId, couponCode, paymentMethodId, paymentReceiptUrl, paymentNotes } = await req.json()
    console.log('Enrollment request:', { courseId, couponCode, paymentMethodId, userId: user.id })

    // Check for duplicate enrollment
    const { data: existingEnrollment } = await supabaseClient
      .from('enrollments')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .maybeSingle()

    if (existingEnrollment) {
      const statusMessages = {
        'pending': 'You already have a pending enrollment for this course',
        'approved': 'You are already enrolled in this course',
        'denied': 'Your previous enrollment request was denied. Please contact support.'
      }
      const message = statusMessages[existingEnrollment.status as keyof typeof statusMessages] || 'You already have an enrollment for this course'
      
      console.log('Duplicate enrollment attempt:', { userId: user.id, courseId, status: existingEnrollment.status })
      return new Response(
        JSON.stringify({ error: message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Get course details
    const { data: course, error: courseError } = await supabaseClient
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single()

    if (courseError || !course) {
      console.error('Course not found:', courseError)
      throw new Error('Course not found')
    }

    let finalPrice = course.price || 0
    let discountApplied = 0
    let couponId = null
    let accessDurationDays = 30 // Default 30 days

    // Validate and apply coupon if provided
    if (couponCode) {
      const { data: coupon, error: couponError } = await supabaseClient
        .from('coupons')
        .select('*')
        .eq('code', couponCode.toUpperCase())
        .maybeSingle()

      if (couponError || !coupon) {
        console.log('Invalid coupon code:', couponCode)
        return new Response(
          JSON.stringify({ error: 'Invalid coupon code' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Validate coupon
      const now = new Date()
      const validFrom = new Date(coupon.valid_from)
      const validUntil = new Date(coupon.valid_until)

      if (!coupon.is_active) {
        console.log('Coupon not active:', couponCode)
        return new Response(
          JSON.stringify({ error: 'Coupon is not active' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Check if coupon applies to this course
      if (coupon.applicable_course_ids && coupon.applicable_course_ids.length > 0) {
        if (!coupon.applicable_course_ids.includes(courseId)) {
          return new Response(
            JSON.stringify({ error: 'Coupon is not valid for this course' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }
      }

      if (now < validFrom || now > validUntil) {
        console.log('Coupon expired or not yet valid:', couponCode)
        return new Response(
          JSON.stringify({ error: 'Coupon is expired or not yet valid' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      if (coupon.current_uses >= coupon.max_uses) {
        console.log('Coupon usage limit reached:', couponCode)
        return new Response(
          JSON.stringify({ error: 'Coupon usage limit reached' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Check if user already used this coupon
      const { data: existingUsage } = await supabaseClient
        .from('coupon_usage')
        .select('*')
        .eq('coupon_id', coupon.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existingUsage) {
        console.log('User already used coupon:', { userId: user.id, couponCode })
        return new Response(
          JSON.stringify({ error: 'You have already used this coupon' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Apply discount and get access duration from coupon
      discountApplied = coupon.discount_percentage
      finalPrice = course.price * (1 - discountApplied / 100)
      couponId = coupon.id
      accessDurationDays = coupon.access_duration_days || 30

      console.log('Coupon applied:', { discountApplied, finalPrice, couponId })

      // Increment coupon usage
      await supabaseClient
        .from('coupons')
        .update({ current_uses: coupon.current_uses + 1 })
        .eq('id', coupon.id)
    }

    // Create enrollment with payment info
    const { data: enrollment, error: enrollmentError } = await supabaseClient
      .from('enrollments')
      .insert({
        user_id: user.id,
        course_id: courseId,
        status: course.is_free ? 'approved' : 'pending',
        coupon_id: couponId,
        discount_applied: discountApplied,
        final_price: finalPrice,
        access_duration_days: accessDurationDays || 30,
        payment_method_id: paymentMethodId || null,
        payment_receipt_url: paymentReceiptUrl || null,
        payment_notes: paymentNotes || null,
        payment_submitted_at: paymentReceiptUrl ? new Date().toISOString() : null
      })
      .select()
      .single()

    if (enrollmentError) {
      console.error('Enrollment error:', enrollmentError)
      throw enrollmentError
    }

    console.log('Enrollment created:', {
      enrollmentId: enrollment.id,
      paymentMethodId,
      hasReceipt: !!paymentReceiptUrl
    })

    // Record coupon usage
    if (couponId) {
      await supabaseClient
        .from('coupon_usage')
        .insert({
          coupon_id: couponId,
          user_id: user.id,
          enrollment_id: enrollment.id
        })
      console.log('Coupon usage recorded')
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        enrollment,
        message: course.is_free ? 'Enrolled successfully!' : 'Enrollment request submitted!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error in enroll-with-coupon:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})