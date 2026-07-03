import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // Get enrollments that are expiring soon
    const { data: expiringEnrollments, error } = await supabaseClient
      .from('enrollments')
      .select(`
        id,
        user_id,
        course_id,
        access_expires_at,
        courses!inner (title)
      `)
      .eq('status', 'approved')
      .eq('is_expired', false)
      .not('access_expires_at', 'is', null)
      .lte('access_expires_at', sevenDaysFromNow.toISOString())

    if (error) throw error

    console.log(`Found ${expiringEnrollments?.length || 0} expiring enrollments`)

    for (const enrollment of expiringEnrollments || []) {
      const expiryDate = new Date(enrollment.access_expires_at!)
      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      
      let shouldNotify = false
      let daysBefore = 0

      if (daysRemaining === 7) {
        shouldNotify = true
        daysBefore = 7
      } else if (daysRemaining === 3) {
        shouldNotify = true
        daysBefore = 3
      } else if (daysRemaining === 1) {
        shouldNotify = true
        daysBefore = 1
      }

      if (shouldNotify) {
        // Check if we already sent this notification
        const { data: existingNotification } = await supabaseClient
          .from('expiry_notifications')
          .select('id')
          .eq('enrollment_id', enrollment.id)
          .eq('days_before', daysBefore)
          .single()

        if (!existingNotification) {
          const courseTitle = (enrollment.courses as any)?.title || 'Unknown Course'
          
          // Create notification
          const { error: notifError } = await supabaseClient
            .from('notifications')
            .insert({
              user_id: enrollment.user_id,
              type: 'expiry_reminder',
              title: `Course Access Expiring Soon!`,
              message: `Your access to "${courseTitle}" will expire in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}. Renew now to continue learning!`,
              related_id: enrollment.course_id
            })

          if (notifError) {
            console.error('Error creating notification:', notifError)
          } else {
            // Record that we sent this notification
            await supabaseClient
              .from('expiry_notifications')
              .insert({
                enrollment_id: enrollment.id,
                days_before: daysBefore
              })
            
            console.log(`Sent ${daysBefore}-day notification for enrollment ${enrollment.id}`)
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Processed ${expiringEnrollments?.length || 0} enrollments`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('Error in send-expiry-notifications:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
