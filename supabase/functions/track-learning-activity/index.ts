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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      // Return gracefully instead of throwing - user may not be logged in
      return new Response(
        JSON.stringify({ success: false, message: 'No authorization header' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200, // Return 200 to prevent frontend errors
        }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    
    if (authError || !user) {
      // Return gracefully - token may be expired or invalid
      console.log('Auth check failed:', authError?.message || 'No user found')
      return new Response(
        JSON.stringify({ success: false, message: 'Not authenticated' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200, // Return 200 to prevent frontend errors
        }
      )
    }

    const today = new Date().toISOString().split('T')[0]

    // Record today's activity
    const { error: streakError } = await supabaseClient
      .from('learning_streaks')
      .upsert({
        user_id: user.id,
        streak_date: today,
        activity_count: 1
      }, {
        onConflict: 'user_id,streak_date',
        ignoreDuplicates: false
      })

    if (streakError) {
      console.error('Streak upsert error:', streakError)
      return new Response(
        JSON.stringify({ success: false, error: streakError.message }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Calculate current streak
    const { data: recentStreaks } = await supabaseClient
      .from('learning_streaks')
      .select('streak_date')
      .eq('user_id', user.id)
      .order('streak_date', { ascending: false })
      .limit(100)

    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0

    if (recentStreaks && recentStreaks.length > 0) {
      const sortedDates = recentStreaks
        .map(s => new Date(s.streak_date))
        .sort((a, b) => b.getTime() - a.getTime())

      // Calculate current streak
      let expectedDate = new Date()
      for (const date of sortedDates) {
        const dateStr = date.toISOString().split('T')[0]
        const expectedStr = expectedDate.toISOString().split('T')[0]
        
        if (dateStr === expectedStr) {
          currentStreak++
          expectedDate.setDate(expectedDate.getDate() - 1)
        } else {
          break
        }
      }

      // Calculate longest streak
      let prevDate: Date | null = null
      for (const date of sortedDates.reverse()) {
        if (!prevDate) {
          tempStreak = 1
        } else {
          const diffDays = Math.floor((date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays === 1) {
            tempStreak++
          } else {
            longestStreak = Math.max(longestStreak, tempStreak)
            tempStreak = 1
          }
        }
        prevDate = date
      }
      longestStreak = Math.max(longestStreak, tempStreak)
    }

    // Update user statistics
    const { error: statsError } = await supabaseClient
      .from('user_statistics')
      .upsert({
        user_id: user.id,
        current_streak: currentStreak,
        longest_streak: Math.max(longestStreak, currentStreak),
        last_activity_date: today
      }, {
        onConflict: 'user_id'
      })

    if (statsError) {
      console.error('Stats upsert error:', statsError)
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        currentStreak,
        longestStreak: Math.max(longestStreak, currentStreak)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('Error tracking learning activity:', error)
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Return 200 to prevent frontend crashes
      }
    )
  }
})
