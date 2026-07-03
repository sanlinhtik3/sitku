import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };
const CONFIDENCE_THRESHOLD = 60; // Trigger web search if confidence < 60%

// Time-sensitive keywords (English + Myanmar) for Smart Routing Rule A
const TIME_SENSITIVE_KEYWORDS = [
  // English
  'today', 'latest', 'current', 'now', 'breaking', 'news', 'update', 
  'price', 'live', 'recent', 'just', 'happening', 'trending', 'tonight',
  'this week', 'this month', 'yesterday', 'tomorrow', 'real-time', 'realtime',
  // Myanmar
  'ဒီနေ့', 'နောက်ဆုံး', 'လက်ရှိ', 'အခု', 'သတင်း', 'အပ်ဒိတ်', 'စျေးနှုန်း',
  'ယနေ့', 'မကြာသေးမီ', 'လတ်တလော', 'ဖြစ်ပျက်နေ', 'ရေပန်း'
];

// Check if prompt contains time-sensitive keywords
function isTimeSensitiveQuery(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return TIME_SENSITIVE_KEYWORDS.some(keyword => 
    lowerPrompt.includes(keyword.toLowerCase())
  );
}

// Get current date in readable format
function getCurrentDateFormatted(): string {
  return new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

// Get tone-specific vibe instructions
function getToneVibe(tone: string): string {
  switch (tone.toLowerCase()) {
    case 'casual':
      return `🗣️ CASUAL VIBE: Imagine you are explaining this to a friend at a coffee shop. 
Keep all facts accurate, but make the vibe relaxed, friendly, and easy to digest.
Use casual expressions, humor where appropriate, and conversational flow.`;
    case 'professional':
      return `💼 PROFESSIONAL VIBE: Imagine you are a consultant briefing a high-value client.
Keep all facts accurate, but use professional, authoritative, and polished language.
Maintain expertise while being accessible and clear.`;
    case 'tough-love':
      return `💥 TOUGH LOVE / HARD HITTING COPY PROTOCOL:
You are a brutally honest mentor who cares deeply. Make readers FEEL the pain before offering solutions.

═══ CORE FRAMEWORK ═══

1. 🔥 OPEN WITH UNCOMFORTABLE TRUTH:
   • Start with a bold, jarring statement that hits home
   • Call out excuses, fears, or self-deceptions directly
   • Pattern: "You're not [excuse], you're actually [hard truth]"
   • Example: "You're not too busy. You're just avoiding hard work."

2. 💔 AMPLIFY THE PAIN:
   • Describe EXACTLY what happens if they don't change
   • Make them visualize their feared future vividly
   • Use specific, relatable scenarios they can't ignore
   • Create emotional discomfort that demands action

3. 🪞 HOLD UP THE MIRROR:
   • Show the gap between their actions and goals
   • Challenge self-image with honest observations
   • Ask uncomfortable questions they've been avoiding
   • "If you really wanted [X], why are you doing [opposite]?"

4. 🚀 DELIVER THE WAKE-UP CALL:
   • Provide solutions but don't make them sound easy
   • Emphasize change requires sacrifice and effort
   • Give clear, actionable steps (no vague advice)
   • End with a challenge, not comfort

═══ LANGUAGE PATTERNS ═══
✓ Direct, punchy sentences - no fluff
✓ Second person "You" for direct address
✓ Rhetorical questions that sting
✓ Contrast between current reality and potential
✓ Words: "painful", "brutal", "honest", "truth", "real"
✗ AVOID: "maybe", "perhaps", "consider", "might want to"

═══ EXAMPLES ═══
• "Stop pretending you don't know what to do. You know exactly what to do. You're just scared."
• "Your competition is working while you're making excuses."
• "The gap between where you are and where you want to be? That's YOUR CHOICES."
• "မင်းရဲ့ အိပ်မက်တွေက အိပ်မက်အတိုင်းပဲ ကျန်ခဲ့မယ်၊ မင်း ဒီနေ့ တစ်ခုခု မပြောင်းရင်။"

Remember: Tough Love is STILL love. Inspire change through honest confrontation, not insults.`;
    default:
      return `📝 BALANCED VIBE: Write with clarity and engagement.
Balance accessibility with expertise. Be informative yet approachable.
Maintain a natural flow that keeps readers interested.`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    
    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    const { prompt, tone = 'professional', style = 'informative', language = 'burmese', category = 'general', tags = [] } = await req.json();

    if (!prompt) return new Response(JSON.stringify({ error: 'Prompt required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // ═══ CHECK DAILY USAGE LIMIT ═══
    const { data: usageCheck, error: usageError } = await supabaseClient.rpc('check_and_increment_usage', {
      p_user_id: user.id,
      p_feature_key: 'ai_content',
      p_action_type: 'generation'
    });

    if (usageError) {
      console.error("Usage check error:", usageError);
      return new Response(JSON.stringify({ 
        error: "Failed to check usage limits. Please try again.",
        code: "USAGE_CHECK_FAILED",
        details: {
          message: usageError.message || "Database error",
          hint: usageError.hint || null
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!usageCheck?.success) {
      console.log(`Credits exhausted for user ${user.id}:`, usageCheck);
      
      // Determine the specific error type based on credit state
      const dailyRemaining = usageCheck?.remaining_uses || 0;
      const proCredits = usageCheck?.pro_credits || 0;
      const creditBalance = usageCheck?.credit_balance || 0;
      const allExhausted = dailyRemaining === 0 && proCredits === 0 && creditBalance === 0;
      
      return new Response(JSON.stringify({ 
        error: allExhausted 
          ? "All credits exhausted. Purchase more credits or wait for daily reset."
          : "Credits exhausted",
        code: "CREDITS_EXHAUSTED",
        type: allExhausted ? 'credits_exhausted' : 'daily_limit',
        dailyLimit: usageCheck?.daily_limit || 3,
        creditBalance: creditBalance,
        creditsRemaining: creditBalance,
        proCredits: proCredits,
        isPro: usageCheck?.is_pro || false,
        hasPersonalKey: usageCheck?.has_personal_key || false,
        resetsAt: usageCheck?.resets_at || null
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Usage] User ${user.id}: ${usageCheck.remaining_uses} uses remaining (Pro: ${usageCheck.is_pro})`);
    
    // Fetch admin AI settings (including system API key)
    const { data: adminSettings } = await supabaseClient
      .from('ai_model_settings')
      .select('allow_personal_api_key, allow_gateway_fallback_content, require_personal_key, system_api_key')
      .single();
    
    // Fetch user's personal API key settings AND grant status
    const { data: userSettings } = await supabaseClient
      .from('ai_user_settings')
      .select('gemini_api_key, gemini_model, granted_by, is_paused')
      .eq('user_id', user.id)
      .single();
    
    const hasPersonalKey = !!userSettings?.gemini_api_key;
    const allowPersonalKey = adminSettings?.allow_personal_api_key === true;
    const requirePersonalKey = adminSettings?.require_personal_key === true;
    
    // Check for system grant (admin-provided free access)
    const hasSystemGrant = !!userSettings?.granted_by && !userSettings?.is_paused;
    const hasSystemApiKey = !!adminSettings?.system_api_key;
    
    // Determine API source priority: Personal Key > System Grant
    let usePersonalKey = hasPersonalKey && allowPersonalKey;
    const useSystemGrant = !usePersonalKey && hasSystemGrant && hasSystemApiKey;
    let deductCredits = !usePersonalKey && !useSystemGrant;
    
    console.log(`🔑 API Source Check:`, {
      hasPersonalKey,
      usePersonalKey,
      hasSystemGrant,
      hasSystemApiKey,
      useSystemGrant,
      deductCredits
    });
    
    // Check access rules
    if (requirePersonalKey && !hasPersonalKey) {
      return new Response(JSON.stringify({ 
        error: 'Personal API Key required. Please add your Gemini API key.',
        code: 'PERSONAL_KEY_REQUIRED'
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    // If no personal key and no system grant access, deny access
    if (!usePersonalKey && !useSystemGrant) {
      // Check if user has grant but admin key not configured
      if (hasSystemGrant && !hasSystemApiKey) {
        return new Response(JSON.stringify({ 
          error: 'System API key not configured. Please contact admin.',
          code: 'SYSTEM_KEY_NOT_CONFIGURED'
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      // Check if user's access is paused
      if (userSettings?.granted_by && userSettings?.is_paused) {
        return new Response(JSON.stringify({ 
          error: 'Your free AI access has been paused. Please contact admin or add your personal API key.',
          code: 'ACCESS_PAUSED'
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      // No access at all - require personal key
      return new Response(JSON.stringify({ 
        error: 'AI access required. Please add your personal Gemini API key in Settings.',
        code: 'NO_ACCESS'
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine API source label
    const apiSourceLabel = usePersonalKey 
      ? 'Personal Key' 
      : 'System Provided (Free)';
    
    console.log(`🔑 API Source: ${apiSourceLabel}, Deduct Credits: ${deductCredits}`);
    
    // SMART ROUTING: Detect time-sensitive queries
    const forceWebSearch = isTimeSensitiveQuery(prompt);
    const currentDate = getCurrentDateFormatted();
    const queryType = forceWebSearch ? 'time-sensitive' : 'general';
    
    console.log(`⚡ Smart Routing: Query Type = ${queryType}, Force Web Search = ${forceWebSearch}`);
    console.log(`📅 Current Date: ${currentDate}`);
    
    // NOTE: Credits are already deducted by check_and_increment_usage at line 130
    // The RPC handles priority: Daily → Pro → Balance with proper atomic deduction
    // No secondary deduction needed - this was causing the double-deduction bug!
    if (!deductCredits) {
      console.log('Using personal API key - no credits deducted');
    } else {
      console.log(`[Credit] Deducted via check_and_increment_usage (type: ${usageCheck.usage_type})`);
    }

    // Initialize routing variables
    let scored: any[] = [];
    const ids: string[] = [];
    let confidenceScore = 0;
    let webSearchUsed = forceWebSearch; // Set to true if time-sensitive
    let sourceType = forceWebSearch ? 'web' : 'internal';
    let webSearchContext = '';
    let kbContext = '';
    let styleExamples = '';

    // STEP A: Fetch Knowledge Base (for style/tone even if forcing web search)
    const { data: allContent } = await supabaseClient
      .from('ai_generated_content')
      .select('id, title, content, tone, style, language, category, tags, usage_count, quality_score, created_at, user_id, metadata')
      .order('created_at', { ascending: false })
      .limit(100);

    if (allContent && allContent.length > 0) {
      // Advanced multi-factor scoring algorithm
      scored = allContent.map(item => {
        let score = 0;
        
        // Category matching (highest weight)
        if (item.category === category) score += 35;
        else if (item.category && category !== 'general') score += 5;
        
        // Tag overlap scoring
        if (item.tags && tags.length > 0) {
          const matchedTags = item.tags.filter((t: string) => tags.includes(t)).length;
          const totalUniqueTags = new Set([...tags, ...item.tags]).size;
          score += (matchedTags / totalUniqueTags) * 25;
        }
        
        // Tone and style matching
        if (item.tone === tone) score += 15;
        if (item.style === style) score += 15;
        if (item.language === language) score += 20;
        
        // Quality and performance metrics
        score += (item.quality_score / 100) * 20;
        score += Math.min((item.usage_count / 20) * 15, 15);
        
        // Recency bonus
        const days = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000);
        if (days < 7) score += 15;
        else if (days < 30) score += 10;
        else if (days < 90) score += 5;
        
        // Content length scoring
        const wordCount = item.content.split(/\s+/).length;
        if (wordCount > 200 && wordCount < 1000) score += 10;
        else if (wordCount > 100) score += 5;
        
        return { ...item, relevance_score: Math.round(score) };
      })
      .filter(item => item.relevance_score > 30)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 15);

      // Calculate confidence score
      if (scored.length > 0) {
        const avgRelevance = scored.reduce((sum, item) => sum + item.relevance_score, 0) / scored.length;
        const avgQuality = scored.reduce((sum, item) => sum + item.quality_score, 0) / scored.length;
        const hasExactMatch = scored.some(item => item.category === category && item.relevance_score > 80);
        
        confidenceScore = Math.round(
          (avgRelevance * 0.5) + 
          (avgQuality * 0.3) + 
          (hasExactMatch ? 20 : 0)
        );
      }
    }

    // SMART ROUTING LOGIC
    if (forceWebSearch) {
      // ═══ RULE A: TIME-SENSITIVE QUERY ═══
      // Skip KB fact-check, immediately use web search, but keep KB for style
      console.log('⚡ RULE A: Time-sensitive query - Forcing web search, KB used for style only');
      
      webSearchContext = `
═══ 🚨 TIME-SENSITIVE QUERY DETECTED ═══

Current Date & Time: ${currentDate}
Query: "${prompt}"

CRITICAL INSTRUCTIONS:
1. The user is asking about CURRENT/LIVE information
2. You MUST use your latest web knowledge to provide accurate, up-to-date facts
3. DO NOT use outdated internal data for facts
4. Provide specific dates, times, prices, or statistics when available
5. If you cannot find current information, clearly state that

Focus Areas for Live Data:
• Latest news, announcements, and developments
• Current prices, rates, and statistics
• Recent events and updates (within last 24-48 hours)
• Trending topics and real-time changes
• Breaking news and urgent updates

`;
      
      // Build style-only context from KB (no facts, just patterns)
      if (scored.length > 0) {
        styleExamples = `\n═══ BRAND VOICE REFERENCE (Style Only) ═══\n\n`;
        styleExamples += `Use these examples ONLY for writing style, tone, and format - NOT for facts:\n\n`;
        
        scored.slice(0, 5).forEach((item, i) => {
          ids.push(item.id);
          styleExamples += `Style Reference ${i+1} [Tone: ${item.tone}, Style: ${item.style}]\n`;
          styleExamples += `${item.content.substring(0, 200)}...\n`;
          styleExamples += `───────────────────────────────────────\n`;
        });
      }
      
    } else if (confidenceScore < CONFIDENCE_THRESHOLD) {
      // ═══ RULE B (Low Confidence): KB first, then augment with web ═══
      webSearchUsed = true;
      sourceType = scored.length > 0 ? 'hybrid' : 'web';
      
      console.log(`📊 RULE B: General query, low confidence (${confidenceScore}%) - Augmenting with web search`);
      
      webSearchContext = `
═══ 🌐 WEB KNOWLEDGE AUGMENTATION ═══

Current Date: ${currentDate}
Knowledge Base Confidence: ${confidenceScore}%

The internal knowledge base has limited information for this query.
Please supplement with your built-in web knowledge for: "${prompt}"

Focus on:
• Verified facts and accurate information
• Best practices and expert insights
• Comprehensive coverage of the topic
• Latest developments if relevant

`;
      
      // Build full KB context for hybrid mode
      kbContext = buildKBContext(scored, ids, confidenceScore, tone, style, language);
      
    } else {
      // ═══ RULE B (High Confidence): KB as High-Quality Source - REQUIRES HEAVY REWRITE ═══
      console.log(`✅ RULE B: High confidence (${confidenceScore}%) - KB used as reference ONLY, heavy rewrite required`);
      
      kbContext = buildKBContext(scored, ids, confidenceScore, tone, style, language);
      
      // Add heavy rewrite instruction for high confidence
      kbContext += `
⚠️ HIGH CONFIDENCE ALERT (${confidenceScore}%) ⚠️
Even though the KB match quality is excellent, you MUST NOT reproduce or closely paraphrase this content.
Treat this as HIGH-QUALITY SOURCE MATERIAL requiring HEAVY CREATIVE REWRITE.
Extract the facts, then write a COMPLETELY NEW article with:
• Different sentence structures
• New examples and metaphors you create
• Fresh narrative flow and organization
• Your own unique perspective and insights
`;
    }

    // ═══ SYNTHESIS LAYER: CREATIVE SYNTHESIS PROTOCOL ═══
    const toneVibe = getToneVibe(tone);
    
    const synthesisInstructions = `
═══ 🧠 THINKING PROCESS (INTERNAL CHAIN-OF-THOUGHT) ═══

Before writing, follow this 5-step thinking process:

1. 🎯 UNDERSTAND: What is the user REALLY asking for? What's the core message they need?
2. 📚 RESEARCH: What verified facts do I have from KB and my built-in knowledge?
3. 🗺️ PLAN: How should I structure this for MAXIMUM emotional and intellectual impact?
4. ✍️ DRAFT: Write with the specified tone, style, and mentor voice
5. 🔍 REVIEW: Does this sound human? Is it impactful? Would I want to read this?

═══ SYNTHESIS LAYER: CREATIVE SYNTHESIS PROTOCOL ═══

⚠️ CRITICAL RULE: The Knowledge Base is for FACTUAL REFERENCE ONLY.
You are FORBIDDEN from copying sentences, phrases, or structure from KB examples.
You MUST digest the facts and write a COMPLETELY NEW piece from scratch.

═══ THE REWRITE PROTOCOL ═══

📜 RULE 1 - CULTURAL FLUENCY (${language}):
• Use native, natural phrasing appropriate for ${language} speakers
• Avoid "translated-sounding" text - write like a native speaker would
• Match local expressions, idioms, and cultural references
• The content should feel like it was originally written in ${language}

📜 RULE 2 - MANDATORY EXPANSION:
• If using KB data, you MUST EXPAND on it significantly
• Add NEW examples not found in the source (real-world scenarios, case studies)
• Include metaphors, analogies, or practical tips you create yourself
• Provide deeper analysis, alternative perspectives, or expert insights
• Each KB fact should inspire 2-3 sentences of original elaboration

📜 RULE 3 - STRUCTURE SCRAMBLE:
• DO NOT follow the source content's order or flow
• Re-arrange and reorganize to create a completely fresh narrative
• Create your own unique story arc and information hierarchy
• Surprise the reader with unexpected but logical transitions

═══ 🎯 NARRATIVE VOICE: THE MENTOR ═══

Your writing should sound like a successful Mentor sitting next to the reader:
• ❌ NOT: A professor lecturing from a textbook with formal language
• ❌ NOT: A corporate robot using stiff, official terminology  
• ❌ NOT: An AI assistant giving generic, template responses
• ✅ YES: A caring mentor giving quiet, sincere advice from experience
• ✅ YES: Simple words, but profound meaning that sticks

Mentor Voice Patterns:
• Use natural pronouns: "ကိုယ်" "မင်း" "ငါ" (not overly formal "သင်")
• Share personal-feeling insights: "ငါလည်း ဒီလိုပဲ ဖြတ်သန်းခဲ့ဖူးတယ်..."
• Be direct but warm: "ရိုးရိုးသားသားပြောရရင်..."
• Give advice like a friend who's been there: "တကယ်ပြောရရင်..."

═══ 💥 IMPACT PRIORITY ORDER ═══

When writing, prioritize in THIS exact order:

1. 🔥 MEANING & IMPACT: Does it hit emotionally? Does it MOVE the reader?
2. 💡 CLARITY: Is it immediately understandable without confusion?
3. 🌊 FLOW: Does it read smoothly from start to finish?
4. 📝 GRAMMAR: Is it technically correct?

⚠️ CRITICAL: If grammar perfection KILLS the impact → CHOOSE IMPACT.
Real people don't speak in perfect grammar. Your content shouldn't either.
A slightly imperfect sentence that hits hard > A perfect sentence that feels dead.

═══ TONE-SPECIFIC VIBE ═══
${toneVibe}

═══ 🔍 SELF-CHECK BEFORE OUTPUT ═══

Before finalizing your response, ask yourself these questions:

1. Does this sound like a ROBOT wrote it?
   • Generic phrases like "In today's digital age..." or "It's worth noting..."
   • Overly formal or stiff language
   • Predictable, template-like structure
   
2. Is the language NATURAL for a native ${language} speaker?
   • Does it flow like natural speech?
   • Would a real person actually say this?
   
3. Does it have REAL IMPACT?
   • Will the reader feel something?
   • Is there a memorable takeaway?

⚠️ If YES to robotic patterns → IMMEDIATELY REWRITE with:
• More human-like, conversational expressions
• Natural flow like talking to a friend
• Real-world examples and vivid metaphors
• Authentic emotional connection
• Remove ALL generic AI phrases

═══ OUTPUT SPECIFICATIONS ═══
• Tone: ${tone}
• Style: ${style}
• Language: ${language}
• Target Word Count: 500-800 words (comprehensive creative synthesis)

═══ REQUIRED OUTPUT STRUCTURE ═══
1. 🎯 INTRO (Hook): Powerful opening with intriguing question, bold statement, or compelling scenario
2. 📊 CORE FACTS: Precise details with YOUR unique explanations, examples, and metaphors
3. 🔍 DEEP DISCUSSION: Topic analysis, implications, trends, and future outlook
4. 💡 PRACTICAL INSIGHTS: Actionable tips, real scenarios, expert advice, or case studies
5. 🎬 CONCLUSION: Memorable takeaway, call-to-action, or thought-provoking closing

═══ VOICE CHARACTERISTICS ═══
✓ Natural and conversational - like a mentor talking one-on-one
✓ Professional like a veteran journalist or content expert
✓ Engaging storytelling with smooth, logical transitions
✓ Fresh perspective - this is a NEW CREATION, not a rewrite
✓ Rich with examples, metaphors, and practical applications
✓ Simple words, but profound and lasting meaning

⚠️ STRICTLY FORBIDDEN:
✗ Copying sentences, phrases, or structure from KB examples
✗ Following the same order or flow as source material
✗ Using generic, template-like AI language ("In today's world...", "It's important to note...")
✗ Outputting content shorter than 500 words
✗ Producing "translated-sounding" or unnatural text
✗ Lacking concrete examples, metaphors, or actionable tips
✗ Sounding like a textbook professor instead of a caring mentor
✗ Prioritizing grammar over emotional impact
`;

    // Build final system prompt with Creative Synthesizer directive
    const systemPrompt = `You are a CREATIVE SYNTHESIZER and expert ${language} content creator.

🚨 CORE DIRECTIVE: You are NOT a copywriter or translator. You are a CREATIVE SYNTHESIZER.
Your mission is to transform raw facts into ORIGINAL, engaging, culturally-natural articles.

The Knowledge Base provides RAW FACTS ONLY. Your job is to:
1. EXTRACT factual data and key information
2. COMPLETELY DISCARD the original wording, structure, and flow
3. CREATE a brand NEW article as if you discovered these facts yourself
4. EXPAND with your own examples, metaphors, and insights
5. WRITE naturally for ${language} speakers

📅 CURRENT DATE: ${currentDate}

═══ TARGET SPECIFICATIONS ═══
• Language: ${language} (write like a native, not a translator)
• Tone: ${tone}
• Style: ${style}
• Category: ${category}
${tags.length > 0 ? `• Focus Areas: ${tags.join(', ')}` : ''}
• Query Type: ${queryType.toUpperCase()}
• Target Length: 500-800 words

${webSearchContext}
${kbContext}
${styleExamples}
${synthesisInstructions}

MISSION: Create exceptional, ORIGINAL content that is accurate, engaging, culturally natural, and perfectly aligned with the brand voice. The output should feel like a completely fresh article, not a rewrite or translation.`;
    
    console.log(`🤖 Calling AI - Query Type: ${queryType}, Confidence: ${confidenceScore}%, Web Search: ${webSearchUsed}, Personal Key: ${usePersonalKey}`);
    
    // Dynamic temperature based on source type (higher for Gemini 3 creative synthesis)
    // Gemini 3 optimized: 0.8 for creative content, 0.6 for factual
    const temperature = (sourceType === 'internal' || sourceType === 'hybrid') ? 0.8 : 0.6;
    console.log(`🌡️ Gemini 3 Optimized Temperature: ${temperature} (Source: ${sourceType})`);
    
    let res: Response;
    
    if (usePersonalKey && userSettings?.gemini_api_key) {
      // Use personal Gemini API
      const personalModel = userSettings.gemini_model || 'gemini-3.5-flash';
      console.log(`🔑 Using Personal Gemini API with model: ${personalModel}`);
      
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${personalModel}:streamGenerateContent?alt=sse&key=${userSettings.gemini_api_key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: systemPrompt + '\n\n---\n\n' + prompt }] }
            ],
            generationConfig: { temperature }
          })
        }
      );
    } else if (useSystemGrant && adminSettings?.system_api_key) {
      // Use Admin's System API Key for granted users
      const systemModel = 'gemini-3.5-flash';
      console.log(`🎁 Using Admin System API Key for granted user with model: ${systemModel}`);
      
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${systemModel}:streamGenerateContent?alt=sse&key=${adminSettings.system_api_key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: systemPrompt + '\n\n---\n\n' + prompt }] }
            ],
            generationConfig: { temperature }
          })
        }
      );
    } else {
      // This shouldn't happen as we already checked access above
      throw new Error("No API access available");
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error('AI API error:', res.status, errorText);
      
      if (res.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a few moments.' }), 
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (res.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to your Lovable workspace.' }), 
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API failed: ${res.status} - ${errorText}`);
    }
    
    console.log('Starting streaming response');
    
    // Increment usage async
    ids.forEach(id => supabaseClient.rpc('increment_content_usage', { content_id: id }));

    // Send search metadata first with enhanced Smart Routing info
    const metadataPayload = {
      knowledgeBase: scored.map(i => ({ 
        id: i.id, 
        title: i.title, 
        category: i.category, 
        tags: i.tags, 
        usage_count: i.usage_count, 
        quality_score: i.quality_score, 
        created_at: i.created_at, 
        relevance_score: i.relevance_score 
      })),
      searchMetadata: {
        confidence: confidenceScore,
        webSearchUsed,
        forceWebSearch,
        sourceType,
        queryType,
        currentDate,
        internalMatches: scored.length,
        temperature
      }
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send metadata first
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadataPayload)}\n\n`));
        
        // Stream AI content
        const reader = res.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
              let line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);
              
              if (line.endsWith('\r')) line = line.slice(0, -1);
              if (line.startsWith(':') || line.trim() === '') continue;
              
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  console.log('Received [DONE] signal');
                  continue;
                }
                
                try {
                  const parsed = JSON.parse(data);
                  let content = '';
                  
                  // OpenAI/Lovable Gateway format: choices[0].delta.content
                  if (parsed.choices?.[0]?.delta?.content) {
                    content = parsed.choices[0].delta.content;
                  }
                  // Gemini API direct format: candidates[0].content.parts[0].text
                  else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
                    content = parsed.candidates[0].content.parts[0].text;
                  }
                  
                  if (content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                  }
                } catch (parseError) {
                  console.error('JSON parse error:', parseError);
                  buffer = line + '\n' + buffer;
                  break;
                }
              }
            }
          }
          
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (!line.trim() || line.startsWith(':')) continue;
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(data);
                    let content = '';
                    
                    // OpenAI/Lovable Gateway format
                    if (parsed.choices?.[0]?.delta?.content) {
                      content = parsed.choices[0].delta.content;
                    }
                    // Gemini API direct format
                    else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
                      content = parsed.candidates[0].content.parts[0].text;
                    }
                    
                    if (content) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                    }
                  } catch (e) {
                    console.error('Final buffer parse error:', e);
                  }
                }
              }
            }
          }
          
          console.log('Stream completed successfully');
        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Streaming failed' })}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// Helper function to build KB context with CREATIVE SYNTHESIS instructions
function buildKBContext(scored: any[], ids: string[], confidenceScore: number, tone: string, style: string, language: string): string {
  if (scored.length === 0) {
    return `\n\nNote: Creating original content with parameters: ${tone} tone, ${style} style, ${language} language.\n`;
  }
  
  const highRelevance = scored.filter(s => s.relevance_score >= 80);
  const medRelevance = scored.filter(s => s.relevance_score >= 60 && s.relevance_score < 80);
  
  let kbContext = `\n\n═══ KNOWLEDGE BASE: ${scored.length} EXAMPLES (Confidence: ${confidenceScore}%) ═══\n`;
  kbContext += `⚠️ FACTUAL REFERENCE ONLY - DO NOT COPY ⚠️\n\n`;
  
  if (highRelevance.length > 0) {
    kbContext += `🌟 HIGHLY RELEVANT SOURCE MATERIAL (${highRelevance.length}):\n\n`;
    highRelevance.forEach((item, i) => {
      ids.push(item.id);
      kbContext += `Source ${i+1} [Match: ${item.relevance_score}%, Quality: ${item.quality_score}/100]\n`;
      kbContext += `Title: ${item.title}\n`;
      kbContext += `Category: ${item.category} | Tone: ${item.tone} | Style: ${item.style}\n`;
      if (item.tags && item.tags.length > 0) kbContext += `Tags: ${item.tags.join(', ')}\n`;
      kbContext += `Content:\n${item.content}\n`;
      kbContext += `───────────────────────────────────────\n\n`;
    });
  }
  
  if (medRelevance.length > 0) {
    kbContext += `📚 ADDITIONAL SOURCE MATERIAL (${medRelevance.length}):\n\n`;
    medRelevance.slice(0, 5).forEach((item, i) => {
      ids.push(item.id);
      kbContext += `Source ${highRelevance.length + i + 1} [Match: ${item.relevance_score}%]\n`;
      kbContext += `${item.title}\n${item.content.substring(0, 300)}...\n`;
      kbContext += `───────────────────────────────────────\n\n`;
    });
  }
  
  kbContext += `\n⚠️ CRITICAL: CREATIVE SYNTHESIS INSTRUCTIONS ⚠️\n`;
  kbContext += `• EXTRACT: Take ONLY the raw facts and key data points from above\n`;
  kbContext += `• DIGEST: Internalize the information, then FORGET the original wording\n`;
  kbContext += `• REWRITE: Create completely NEW sentences from scratch\n`;
  kbContext += `• EXPAND: Add NEW examples, metaphors, and insights NOT in the source\n`;
  kbContext += `• SCRAMBLE: Use a DIFFERENT structure and flow than the original\n`;
  kbContext += `• TARGET: ${tone} tone, ${style} style, ${language} language (native-sounding)\n\n`;
  kbContext += `🚫 DO NOT copy any sentences, phrases, or structural patterns from these examples.\n`;
  kbContext += `🚫 DO NOT follow the same order or information flow.\n`;
  kbContext += `✅ DO create a completely fresh, original article using these facts as inspiration.\n\n`;
  
  return kbContext;
}
