import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("No authorization header");
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Fetching learning data for user:", user.id);

    // Get user's enrolled courses
    const { data: enrolledCourses } = await supabase
      .from("enrollments")
      .select(`
        course_id,
        courses (
          id,
          title,
          category,
          difficulty,
          description
        )
      `)
      .eq("user_id", user.id)
      .eq("status", "approved");

    // Get user's completed certificates
    const { data: certificates } = await supabase
      .from("certificates")
      .select("course_id")
      .eq("user_id", user.id);

    // Extract course objects from enrollments
    type CourseData = { id: string; title: string; category: string; difficulty: string; description: string };
    const enrolledCoursesData: CourseData[] = [];
    if (enrolledCourses) {
      for (const enrollment of enrolledCourses) {
        if (enrollment.courses && typeof enrollment.courses === 'object' && !Array.isArray(enrollment.courses)) {
          enrolledCoursesData.push(enrollment.courses as CourseData);
        }
      }
    }

    // Get all available courses (not enrolled)
    const enrolledIds = (enrolledCourses?.map(e => e.course_id) || []).filter(Boolean);
    let availableQuery = supabase
      .from("courses")
      .select("id, title, category, difficulty, description, instructor_name")
      .eq("is_published", true)
      .eq("approval_status", "approved");

    if (enrolledIds.length > 0) {
      availableQuery = availableQuery.not("id", "in", `(${enrolledIds.join(",")})`);
    }

    const { data: availableCourses } = await availableQuery;

    const completedCourseIds = new Set(certificates?.map(c => c.course_id) || []);
    const completedCourses = enrolledCoursesData.filter(c => completedCourseIds.has(c.id));
    const inProgressCourses = enrolledCoursesData.filter(c => !completedCourseIds.has(c.id));

    console.log("Learning data:", {
      completed: completedCourses.length,
      inProgress: inProgressCourses.length,
      available: availableCourses?.length || 0,
    });

    // If no courses available to recommend, return empty
    if (!availableCourses || availableCourses.length === 0) {
      console.log("No available courses to recommend");
      return new Response(JSON.stringify({ recommendations: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context for AI
    const userContext = `
User Learning Profile:
- Completed Courses (${completedCourses.length}): ${completedCourses.map(c => `${c.title} (${c.category}, ${c.difficulty})`).join(", ") || "None"}
- In Progress (${inProgressCourses.length}): ${inProgressCourses.map(c => `${c.title} (${c.category}, ${c.difficulty})`).join(", ") || "None"}

Available Courses to Recommend:
${availableCourses?.map(c => `- ${c.title} | Category: ${c.category} | Difficulty: ${c.difficulty} | Instructor: ${c.instructor_name || "Unknown"}`).join("\n") || "No courses available"}
    `.trim();

    const systemPrompt = `You are a course recommendation expert for a cryptocurrency learning platform. 
Analyze the user's learning history and suggest 3-5 courses that would be most beneficial for them to take next.

Consider:
1. Natural progression from completed courses
2. Filling knowledge gaps
3. Difficulty progression (don't jump too many levels)
4. Category diversity while maintaining coherence
5. Building on their existing knowledge

Return recommendations with clear reasoning for each suggestion.`;

    // Resolve personal API key
    const { data: userSettings } = await supabase
      .from("ai_user_settings")
      .select("gemini_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    let personalKey = userSettings?.gemini_api_key || null;
    if (!personalKey) {
      const serviceSupabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const { data: sysSettings } = await serviceSupabase
        .from("ai_model_settings")
        .select("google_system_api_key")
        .maybeSingle();
      personalKey = sysSettings?.google_system_api_key || null;
    }
    if (!personalKey) {
      return new Response(JSON.stringify({ error: "Personal API key required — please set your Gemini API key in Settings" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Calling Gemini direct API...");
    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${personalKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContext },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "recommend_courses",
              description: "Return 3-5 personalized course recommendations based on user's learning history",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        courseTitle: { type: "string" },
                        reason: { type: "string" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                        expectedBenefit: { type: "string" },
                      },
                      required: ["courseTitle", "reason", "priority", "expectedBenefit"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "recommend_courses" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Failed to generate recommendations" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response");
      return new Response(JSON.stringify({ error: "Invalid AI response format" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recommendations = JSON.parse(toolCall.function.arguments);
    
    // Match recommendations with actual course data
    const enrichedRecommendations = recommendations.recommendations
      .map((rec: any) => {
        const course = availableCourses?.find(c => 
          c.title.toLowerCase() === rec.courseTitle.toLowerCase() ||
          c.title.toLowerCase().includes(rec.courseTitle.toLowerCase()) ||
          rec.courseTitle.toLowerCase().includes(c.title.toLowerCase())
        );
        
        if (!course) return null;
        
        return {
          ...rec,
          courseId: course.id,
          category: course.category,
          difficulty: course.difficulty,
          description: course.description,
          instructorName: course.instructor_name,
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    console.log("Returning", enrichedRecommendations.length, "recommendations");

    return new Response(JSON.stringify({ recommendations: enrichedRecommendations }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-course-recommendations:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
