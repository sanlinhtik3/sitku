import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TranscriptionSegment {
  start: string;
  end: string;
  text: string;
}

interface TranscriptionResult {
  source_language: string;
  segments: TranscriptionSegment[];
  full_text: string;
}

// Burmese error messages for user-friendly display
const ERROR_MESSAGES: Record<string, string> = {
  "Video too large": "ဗီဒီယိုအရွယ်အစား ကြီးလွန်းပါသည် (အကန့်အသတ် ကျော်လွန်သည်)",
  "No speech detected": "ဗီဒီယိုတွင် စကားပြောသံ မတွေ့ရှိပါ",
  "Failed to download": "ဗီဒီယို ဒေါင်းလုဒ် မအောင်မြင်ပါ",
  "Transcription failed": "စာသားပြောင်းရာတွင် မအောင်မြင်ပါ",
  "Translation failed": "ဘာသာပြန်ရာတွင် မအောင်မြင်ပါ",
  "Failed to parse transcription": "စာသားခွဲခြမ်းစိတ်ဖြာရာတွင် အမှားရှိပါသည်",
  "Failed to parse translation": "ဘာသာပြန်ချက်ခွဲခြမ်းစိတ်ဖြာရာတွင် အမှားရှိပါသည်",
  "Translation not found": "ဘာသာပြန်မှတ်တမ်း မတွေ့ရှိပါ",
  "Video URL not found": "ဗီဒီယို URL မတွေ့ရှိပါ",
  "Invalid video URL format": "ဗီဒီယို URL ပုံစံမမှန်ပါ",
  "Failed to create signed URL": "ဗီဒီယို URL ဖန်တီးမအောင်မြင်ပါ",
  "timeout": "အချိန်ကုန်သွားပါသည်။ ဗီဒီယိုအရွယ်အစား သေးရန် သို့မဟုတ် နောက်တစ်ကြိမ် ထပ်ကြိုးစားပါ",
  "aborted": "လုပ်ဆောင်မှု ရပ်တန့်သွားပါသည်။ ထပ်ကြိုးစားပါ",
  "rate limit": "API ခေါ်ဆိုမှု များလွန်းသည်။ ခဏစောင့်ပြီး ထပ်ကြိုးစားပါ",
  "429": "ဆာဗာအလုပ်များနေသည်။ ခဏစောင့်ပြီး ထပ်ကြိုးစားပါ",
  "402": "Credit မလုံလောက်ပါ။ စီမံခန့်ခွဲသူကို ဆက်သွယ်ပါ",
  "500": "ဆာဗာအမှားရှိပါသည်။ ထပ်ကြိုးစားပါ",
  "network": "ကွန်ရက်အမှားရှိပါသည်။ ထပ်ကြိုးစားပါ",
};

// Helper to get Burmese error message
function getBurmeseError(error: string): string {
  const lowerError = error.toLowerCase();
  for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
    if (lowerError.includes(key.toLowerCase())) {
      return value;
    }
  }
  return `အမှားရှိပါသည်: ${error}`;
}

// Fetch with timeout utility
async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = 120000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`Fetch timeout after ${timeoutMs}ms for: ${url.substring(0, 100)}...`);
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(url, { 
      ...options, 
      signal: controller.signal 
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let translationId: string | undefined;
  let sourceLanguage = "en";
  const startTime = Date.now();
  
  // AI usage tracking
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const aiModelUsed = "gemini-2.5-flash";

  // Step messages in Burmese for UI
  const stepMessages: Record<string, string> = {
    "pending": "စောင့်ဆိုင်းနေသည်...",
    "processing": "လုပ်ဆောင်နေသည်...",
    "extracting": "အသံထုတ်ယူနေသည်...",
    "url_fetch": "ဗီဒီယို URL ရယူနေသည်...",
    "signed_url": "Signed URL ဖန်တီးနေသည်...",
    "downloading": "ဗီဒီယို ဒေါင်းလုဒ်လုပ်နေသည်...",
    "encoding": "ဗီဒီယို encoding လုပ်နေသည်...",
    "transcribing": "စာသားပြောင်းနေသည်...",
    "ai_transcribe": "AI စာသားပြောင်းနေသည်...",
    "parse_transcribe": "စာသားစစ်ဆေးနေသည်...",
    "translating": "ဘာသာပြန်နေသည်...",
    "ai_translate": "AI ဘာသာပြန်နေသည်...",
    "parse_translate": "ဘာသာပြန်ချက်စစ်ဆေးနေသည်...",
    "generating": "SRT ဖိုင်ဖန်တီးနေသည်...",
    "srt_format": "SRT format ပြောင်းနေသည်...",
    "saving": "ဖိုင်သိမ်းနေသည်...",
    "complete": "ပြီးဆုံးပါပြီ! ✓",
    "completed": "ပြီးဆုံးပါပြီ! ✓",
    "failed": "မအောင်မြင်ပါ",
    "error": "အမှားရှိပါသည်",
    // YouTube specific steps
    "youtube_fetch": "YouTube ဗီဒီယို ယူနေသည်...",
    "youtube_info": "YouTube အချက်အလက် ရယူနေသည်...",
    "youtube_download": "YouTube ဗီဒီယို ဒေါင်းလုဒ်လုပ်နေသည်...",
  };

  // Helper to update status with progress and step message - WITH ERROR HANDLING
  const updateProgress = async (status: string, progressPercent: number, currentStep?: string) => {
    try {
      const stepKey = currentStep || status;
      const stepMessage = stepMessages[stepKey] || stepMessages[status] || "လုပ်ဆောင်နေသည်...";
      
      console.log(`Progress: ${status} - ${progressPercent}% - ${stepKey} - ${stepMessage}`);
      
      const { error } = await supabase
        .from("srt_translations")
        .update({ 
          status, 
          progress_percent: progressPercent,
          current_step: stepKey,
          step_message: stepMessage,
          source_language: sourceLanguage 
        })
        .eq("id", translationId);
      
      if (error) {
        console.error("Failed to update progress:", error.message);
        // Don't throw - just log and continue processing
      }
    } catch (err) {
      console.error("updateProgress error:", err instanceof Error ? err.message : String(err));
      // Don't throw - progress update failure shouldn't stop processing
    }
  };

  try {
    const body = await req.json();
    translationId = body.translationId;
    sourceLanguage = body.sourceLanguage || "en";

    console.log(`Starting processing for translation: ${translationId}`);

    if (!translationId) {
      throw new Error("Translation ID is required");
    }

    // Resolve personal API key from user's settings
    const authHeader = req.headers.get("authorization");
    let personalGeminiKey: string | null = null;
    if (authHeader) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || supabaseServiceKey;
      const userSupabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userSupabase.auth.getUser();
      if (user) {
        const { data: settings } = await supabase
          .from("ai_user_settings")
          .select("gemini_api_key")
          .eq("user_id", user.id)
          .maybeSingle();
        personalGeminiKey = settings?.gemini_api_key || null;
      }
    }
    if (!personalGeminiKey) {
      // Fallback: try system key
      const { data: sysSettings } = await supabase
        .from("ai_model_settings")
        .select("google_system_api_key")
        .maybeSingle();
      personalGeminiKey = sysSettings?.google_system_api_key || null;
    }
    if (!personalGeminiKey) {
      throw new Error("Personal API key required — please set your Gemini API key in Settings");
    }

    // Get translation record
    const { data: translation, error: fetchError } = await supabase
      .from("srt_translations")
      .select("*")
      .eq("id", translationId)
      .single();

    if (fetchError || !translation) {
      throw new Error("Translation not found");
    }

    // ========== Step 1: Get Video URL (0-20%) ==========
    await updateProgress("extracting", 5, "url_fetch");
    console.log("Step 1: Getting video source...");

    const videoSource = translation.video_source || "upload";
    const isYouTube = videoSource === "youtube";
    
    let videoDownloadUrl: string;
    let mimeType = "video/mp4";
    let videoTitle = translation.video_name;

    if (isYouTube) {
      // ===== YouTube Flow =====
      await updateProgress("extracting", 8, "youtube_fetch");
      console.log("YouTube video detected, fetching download URL...");
      
      const youtubeVideoId = translation.youtube_video_id;
      if (!youtubeVideoId) {
        throw new Error("YouTube video ID not found");
      }
      
      await updateProgress("extracting", 10, "youtube_info");
      
      // Use RapidAPI YouTube downloader
      const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
      if (!rapidApiKey) {
        throw new Error("YouTube download service not configured");
      }
      
      // Get video download info from RapidAPI
      let ytInfoResponse: Response;
      try {
        ytInfoResponse = await fetchWithTimeout(
          `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${youtubeVideoId}`,
          {
            headers: {
              "x-rapidapi-key": rapidApiKey,
              "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com",
            },
          },
          30000
        );
      } catch (ytError) {
        console.error("YouTube API error:", ytError);
        throw new Error("Failed to fetch YouTube video info");
      }
      
      if (!ytInfoResponse.ok) {
        const errorText = await ytInfoResponse.text();
        console.error("YouTube API response error:", ytInfoResponse.status, errorText);
        
        // Provide specific error messages based on status
        if (ytInfoResponse.status === 403) {
          throw new Error("YouTube API subscription required - please subscribe to the RapidAPI ytstream service");
        } else if (ytInfoResponse.status === 429) {
          throw new Error("YouTube API rate limit - please try again later");
        } else if (ytInfoResponse.status === 401) {
          throw new Error("YouTube API key invalid - please check RAPIDAPI_KEY");
        }
        throw new Error(`YouTube API error: ${ytInfoResponse.status}`);
      }
      
      const ytInfo = await ytInfoResponse.json();
      console.log("YouTube info received:", ytInfo.title || "No title");
      
      // Get the best available format (prefer 720p mp4)
      const formats = ytInfo.formats || ytInfo.adaptiveFormats || [];
      const mp4Format = formats.find((f: any) => 
        f.mimeType?.includes("video/mp4") && 
        f.qualityLabel?.includes("720")
      ) || formats.find((f: any) => 
        f.mimeType?.includes("video/mp4") && 
        f.qualityLabel
      ) || formats.find((f: any) => f.mimeType?.includes("video/mp4"));
      
      if (!mp4Format?.url) {
        console.error("No suitable format found. Available formats:", JSON.stringify(formats).substring(0, 500));
        throw new Error("No downloadable format found for YouTube video");
      }
      
      videoDownloadUrl = mp4Format.url;
      mimeType = mp4Format.mimeType?.split(";")[0] || "video/mp4";
      
      // Update video name with actual title
      if (ytInfo.title) {
        videoTitle = ytInfo.title;
        await supabase
          .from("srt_translations")
          .update({ video_name: ytInfo.title })
          .eq("id", translationId);
      }
      
      await updateProgress("extracting", 15, "youtube_download");
      console.log(`YouTube video ready: ${videoTitle}`);
      
    } else {
      // ===== Upload Flow (existing) =====
      const videoUrl = translation.video_url;
      if (!videoUrl) {
        throw new Error("Video URL not found");
      }

      await updateProgress("extracting", 8, "url_fetch");

      // Extract the file path from the public URL
      const urlParts = videoUrl.split("/srt-videos/");
      if (urlParts.length < 2) {
        throw new Error("Invalid video URL format");
      }
      const filePath = decodeURIComponent(urlParts[1]);

      await updateProgress("extracting", 10, "signed_url");

      // Create a signed URL for the video (valid for 1 hour)
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("srt-videos")
        .createSignedUrl(filePath, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error("Signed URL error:", signedUrlError);
        throw new Error("Failed to create signed URL for video");
      }

      videoDownloadUrl = signedUrlData.signedUrl;
      
      // Determine mime type from file extension
      const fileExtension = filePath.split('.').pop()?.toLowerCase() || 'mp4';
      const mimeTypes: Record<string, string> = {
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        mkv: "video/x-matroska",
        avi: "video/x-msvideo",
      };
      mimeType = mimeTypes[fileExtension] || "video/mp4";
      
      await updateProgress("extracting", 15, "signed_url");
      console.log("Step 1 complete: Got signed URL");
    }

    // ========== Step 2: Download and Transcribe with Gemini (15-55%) ==========
    await updateProgress("transcribing", 18, "downloading");
    console.log("Step 2: Downloading video...");

    const languageNames: Record<string, string> = {
      en: "English",
      th: "Thai",
      ja: "Japanese",
      ko: "Korean",
      zh: "Chinese",
      auto: "auto-detect",
    };

    const sourceLanguageName = languageNames[sourceLanguage] || "English";

    // Download video with timeout (2 minutes)
    let videoResponse: Response;
    try {
      videoResponse = await fetchWithTimeout(videoDownloadUrl, {}, 120000);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: HTTP ${videoResponse.status}`);
      }
    } catch (downloadError) {
      console.error("Video download error:", downloadError);
      throw new Error("Failed to download video");
    }
    
    await updateProgress("transcribing", 22, "downloading");
    
    const videoBlob = await videoResponse.arrayBuffer();
    const videoBytes = new Uint8Array(videoBlob);
    const videoSizeMB = Math.round(videoBytes.length / 1024 / 1024 * 10) / 10;
    
    console.log(`Video downloaded: ${videoSizeMB}MB`);
    
    await updateProgress("transcribing", 26, "encoding");
    console.log("Encoding video to base64...");
    
    // Convert to base64 using chunked approach to avoid stack overflow
    const chunkSize = 32768; // 32KB chunks
    let videoBase64 = "";
    for (let i = 0; i < videoBytes.length; i += chunkSize) {
      const chunk = videoBytes.slice(i, Math.min(i + chunkSize, videoBytes.length));
      videoBase64 += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    videoBase64 = btoa(videoBase64);
    
    await updateProgress("transcribing", 30, "ai_transcribe");
    console.log("Sending to Gemini for transcription...");

    const transcriptionPrompt = `You are a professional transcription assistant. 
Transcribe this video's audio content with precise timestamps.

SOURCE LANGUAGE: ${sourceLanguageName === "auto-detect" ? "Detect the language automatically" : sourceLanguageName}

CRITICAL RULES:
1. Transcribe EXACTLY what is spoken in the video - do not make up content
2. Include timestamps for each segment (format: MM:SS)
3. Keep segments 3-5 seconds each for readable subtitles
4. If there is no audio or speech, return empty segments array
5. Listen carefully to every word

OUTPUT FORMAT (JSON only, no markdown):
{
  "source_language": "detected language name",
  "segments": [
    { "start": "00:00", "end": "00:04", "text": "exact words spoken" },
    { "start": "00:04", "end": "00:08", "text": "next sentence" }
  ],
  "full_text": "complete transcript as one paragraph"
}`;

    await updateProgress("transcribing", 35, "ai_transcribe");

    // Call Gemini for transcription with timeout (3 minutes)
    let transcribeResponse: Response;
    try {
      transcribeResponse = await fetchWithTimeout(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${personalGeminiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: aiModelUsed,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: transcriptionPrompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${mimeType};base64,${videoBase64}`
                    }
                  }
                ]
              }
            ],
            temperature: 0.1,
            max_tokens: 8000,
          }),
        },
        180000 // 3 minute timeout for AI
      );
    } catch (aiError) {
      console.error("Transcription API error:", aiError);
      throw new Error("Transcription failed: AI request timeout or network error");
    }

    await updateProgress("transcribing", 42, "ai_transcribe");

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error("Transcription API error:", transcribeResponse.status, errorText);
      
      if (transcribeResponse.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      } else if (transcribeResponse.status === 402) {
        throw new Error("Payment required. Credit not sufficient.");
      }
      
      throw new Error(`Transcription failed: ${transcribeResponse.status}`);
    }

    await updateProgress("transcribing", 46, "parse_transcribe");

    const transcribeData = await transcribeResponse.json();
    const transcriptionContent = transcribeData.choices?.[0]?.message?.content || "";
    
    // Track transcription tokens
    const transcribeUsage = transcribeData.usage || {};
    totalInputTokens += transcribeUsage.prompt_tokens || 0;
    totalOutputTokens += transcribeUsage.completion_tokens || 0;
    
    console.log(`Transcription tokens - Input: ${transcribeUsage.prompt_tokens || 0}, Output: ${transcribeUsage.completion_tokens || 0}`);

    await updateProgress("transcribing", 50, "parse_transcribe");

    // Parse transcription JSON
    let transcription: TranscriptionResult;
    try {
      // Clean up markdown code blocks if present
      let cleanedContent = transcriptionContent.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      transcription = JSON.parse(cleanedContent.trim());
    } catch (parseError) {
      console.error("Failed to parse transcription:", parseError);
      console.error("Raw content:", transcriptionContent.substring(0, 500));
      throw new Error("Failed to parse transcription result");
    }

    if (!transcription.segments || transcription.segments.length === 0) {
      throw new Error("No speech detected in video");
    }

    await updateProgress("transcribing", 55, "parse_transcribe");
    console.log(`Step 2 complete: Transcribed ${transcription.segments.length} segments`);

    // ========== Step 3: Translate to Burmese (55-88%) ==========
    await updateProgress("translating", 58, "ai_translate");
    console.log("Step 3: Translating to Burmese...");

    const translationPrompt = `You are an expert translator specializing in ${transcription.source_language} to Burmese (မြန်မာ) translation.

Translate the following subtitle segments to natural, engaging Burmese.

CRITICAL RULES:
1. Translate ACCURATELY - preserve the original meaning exactly
2. Use natural Burmese that sounds native, not robotic
3. Keep translations concise for subtitles (easy to read quickly)
4. Maintain the same number of segments
5. Do not add or remove content

ORIGINAL SEGMENTS:
${transcription.segments.map((s, i) => `${i + 1}. [${s.start} - ${s.end}] ${s.text}`).join("\n")}

OUTPUT FORMAT (JSON only, no markdown):
{
  "translated_segments": [
    { "start": "00:00", "end": "00:04", "original": "original text", "translated": "ဘာသာပြန်ချက်" },
    ...
  ],
  "full_translation": "complete translation as one paragraph"
}`;

    await updateProgress("translating", 62, "ai_translate");

    // Call Gemini for translation with timeout (2 minutes)
    let translateResponse: Response;
    try {
      translateResponse = await fetchWithTimeout(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${personalGeminiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: aiModelUsed,
            messages: [
              { 
                role: "system", 
                content: "You are an expert translator. Always output valid JSON only, no markdown." 
              },
              { role: "user", content: translationPrompt }
            ],
            temperature: 0.3,
            max_tokens: 8000,
          }),
        },
        120000 // 2 minute timeout for translation
      );
    } catch (aiError) {
      console.error("Translation API error:", aiError);
      throw new Error("Translation failed: AI request timeout or network error");
    }

    await updateProgress("translating", 72, "ai_translate");

    if (!translateResponse.ok) {
      const errorText = await translateResponse.text();
      console.error("Translation API error:", translateResponse.status, errorText);
      
      if (translateResponse.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      } else if (translateResponse.status === 402) {
        throw new Error("Payment required. Credit not sufficient.");
      }
      
      throw new Error(`Translation failed: ${translateResponse.status}`);
    }

    await updateProgress("translating", 78, "parse_translate");

    const translateData = await translateResponse.json();
    const translationContent = translateData.choices?.[0]?.message?.content || "";
    
    // Track translation tokens
    const translateUsage = translateData.usage || {};
    totalInputTokens += translateUsage.prompt_tokens || 0;
    totalOutputTokens += translateUsage.completion_tokens || 0;
    
    console.log(`Translation tokens - Input: ${translateUsage.prompt_tokens || 0}, Output: ${translateUsage.completion_tokens || 0}`);

    await updateProgress("translating", 82, "parse_translate");

    // Parse translation JSON
    let translatedResult: { 
      translated_segments: Array<{ start: string; end: string; original: string; translated: string }>; 
      full_translation: string 
    };
    try {
      let cleanedContent = translationContent.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      translatedResult = JSON.parse(cleanedContent.trim());
    } catch (parseError) {
      console.error("Failed to parse translation:", parseError);
      console.error("Raw content:", translationContent.substring(0, 500));
      throw new Error("Failed to parse translation result");
    }

    await updateProgress("translating", 86, "parse_translate");
    console.log("Step 3 complete: Translation done");

    // ========== Step 4: Generate SRT (88-100%) ==========
    await updateProgress("generating", 88, "srt_format");
    console.log("Step 4: Generating SRT files (original + translated)...");

    let srtContent = "";
    let originalSrtContent = "";
    
    translatedResult.translated_segments.forEach((segment, index) => {
      const startTimeSrt = parseTimeToSRT(segment.start);
      const endTimeSrt = parseTimeToSRT(segment.end);
      
      // Translated SRT (Burmese)
      srtContent += `${index + 1}\n`;
      srtContent += `${startTimeSrt} --> ${endTimeSrt}\n`;
      srtContent += `${segment.translated}\n\n`;
      
      // Original SRT (source language)
      originalSrtContent += `${index + 1}\n`;
      originalSrtContent += `${startTimeSrt} --> ${endTimeSrt}\n`;
      originalSrtContent += `${segment.original}\n\n`;
    });

    await updateProgress("generating", 92, "srt_format");

    // Calculate approximate duration
    const lastSegment = translatedResult.translated_segments[translatedResult.translated_segments.length - 1];
    const durationSeconds = parseTimeToSeconds(lastSegment?.end || "00:00");

    await updateProgress("generating", 95, "saving");
    console.log("Step 4 complete: SRT generated (both original and translated)");

    // ========== Step 5: Save results (100%) ==========
    await updateProgress("generating", 98, "saving");
    
    // Calculate processing time and cost estimate
    const processingTimeMs = Date.now() - startTime;
    const totalTokens = totalInputTokens + totalOutputTokens;
    
    // Gemini 2.5 Flash pricing: Input: $0.075/1M tokens, Output: $0.30/1M tokens
    const costEstimate = 
      (totalInputTokens / 1000000 * 0.075) + 
      (totalOutputTokens / 1000000 * 0.30);
    
    console.log(`AI Usage - Total Input: ${totalInputTokens}, Output: ${totalOutputTokens}, Cost: $${costEstimate.toFixed(6)}, Time: ${processingTimeMs}ms`);

    const { error: saveError } = await supabase
      .from("srt_translations")
      .update({
        status: "completed",
        progress_percent: 100,
        current_step: "complete",
        step_message: "ပြီးဆုံးပါပြီ! ✓",
        original_text: transcription.full_text,
        translated_text: translatedResult.full_translation,
        srt_content: srtContent,
        original_srt_content: originalSrtContent, // NEW: Store original SRT for dual-language
        duration_seconds: durationSeconds,
        source_language: transcription.source_language,
        ai_tokens_input: totalInputTokens,
        ai_tokens_output: totalOutputTokens,
        ai_tokens_total: totalTokens,
        ai_cost_estimate: costEstimate,
        ai_model_used: aiModelUsed,
        processing_time_ms: processingTimeMs,
      })
      .eq("id", translationId);

    if (saveError) {
      console.error("Failed to save results:", saveError);
      throw new Error("Failed to save translation results");
    }

    console.log("Processing complete!");

    return new Response(
      JSON.stringify({ 
        success: true, 
        translationId,
        segments: translatedResult.translated_segments.length,
        duration: durationSeconds,
        processingTimeMs,
        tokens: totalTokens,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Processing error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const burmeseError = getBurmeseError(errorMessage);

    // Update the translation status to failed with detailed error info
    if (translationId) {
      try {
        await supabase
          .from("srt_translations")
          .update({
            status: "failed",
            progress_percent: 0,
            current_step: "error",
            step_message: burmeseError,
            error_message: burmeseError,
          })
          .eq("id", translationId);
      } catch (updateError) {
        console.error("Failed to update error status:", updateError);
      }
    }

    return new Response(
      JSON.stringify({ error: burmeseError, details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: Parse MM:SS or HH:MM:SS to SRT format (HH:MM:SS,mmm)
function parseTimeToSRT(time: string): string {
  const parts = time.split(":").map(p => parseInt(p, 10));
  
  let hours = 0, minutes = 0, seconds = 0;
  
  if (parts.length === 2) {
    [minutes, seconds] = parts;
  } else if (parts.length === 3) {
    [hours, minutes, seconds] = parts;
  }
  
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},000`;
}

// Helper: Parse time string to seconds
function parseTimeToSeconds(time: string): number {
  const parts = time.split(":").map(p => parseInt(p, 10));
  
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return 0;
}
