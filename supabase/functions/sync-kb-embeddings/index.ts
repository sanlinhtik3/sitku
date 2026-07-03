import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// gemini-embedding-001 returns up to 3072 dimensions, but we use outputDimensionality to get 768
// This is compatible with pgvector's 2000 dimension limit for indexes
const EXPECTED_EMBEDDING_DIMENSION = 768;
const MAX_RETRIES = 3;
const CHUNK_DELAY_MS = 300;  // Delay between chunks
const ITEM_DELAY_MS = 500;   // Delay between queue items
const RATE_LIMIT_DELAY_MS = 3000; // Delay after rate limit

// ═══ HELPER: Sleep ═══
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ═══ EMBEDDING GENERATION WITH RETRY ═══
interface EmbeddingResult {
  success: boolean;
  embedding?: number[];
  statusCode?: number;
  error?: string;
}

async function generateEmbeddingAttempt(text: string, apiKey: string): Promise<EmbeddingResult> {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
          outputDimensionality: 768,
        }),
      }
    );

    const statusCode = response.status;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Embedding] API error ${statusCode}:`, errorText.substring(0, 200));
      return { success: false, statusCode, error: errorText.substring(0, 100) };
    }

    const data = await response.json();
    const embedding = data.embedding?.values;

    // Validate embedding
    if (!embedding) {
      return { success: false, error: "No embedding in response" };
    }
    
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return { success: false, error: "Invalid embedding array" };
    }
    
    if (embedding.length !== EXPECTED_EMBEDDING_DIMENSION) {
      return { success: false, error: `Wrong dimension: ${embedding.length}` };
    }
    
    if (!embedding.every((v: any) => typeof v === "number" && !isNaN(v))) {
      return { success: false, error: "Invalid values in embedding" };
    }

    return { success: true, embedding };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function generateEmbeddingWithRetry(
  text: string, 
  apiKey: string
): Promise<number[] | null> {
  let lastError = "";
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await generateEmbeddingAttempt(text, apiKey);
    
    if (result.success && result.embedding) {
      if (attempt > 1) {
        console.log(`[Embedding] Success on attempt ${attempt}`);
      }
      return result.embedding;
    }
    
    // Rate limit (429) - wait with exponential backoff and retry
    if (result.statusCode === 429) {
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`[Embedding] Rate limited (attempt ${attempt}/${MAX_RETRIES}), waiting ${delay}ms...`);
      await sleep(delay);
      continue;
    }
    
    // Server error (5xx) - might be temporary, retry
    if (result.statusCode && result.statusCode >= 500) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Embedding] Server error ${result.statusCode} (attempt ${attempt}/${MAX_RETRIES}), waiting ${delay}ms...`);
      await sleep(delay);
      continue;
    }
    
    // Other error - don't retry
    lastError = result.error || "Unknown error";
    console.error(`[Embedding] Non-retryable error: ${lastError}`);
    break;
  }
  
  console.error(`[Embedding] Failed after ${MAX_RETRIES} attempts: ${lastError}`);
  return null;
}

// ═══ AUTO-TITLE GENERATION ═══
async function generateCleanTitle(content: string, apiKey: string): Promise<string | null> {
  try {
    const prompt = `Generate a short, human-readable title (max 60 characters) for this content.
Return ONLY the title, no quotes or explanation.

Content:
${content.substring(0, 800)}`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 100 },
        }),
      }
    );

    if (!response.ok) {
      console.error("[AutoTitle] API error:", response.status);
      return null;
    }
    
    const data = await response.json();
    const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (title && title.length > 0 && title.length <= 100) {
      return title.replace(/^["']|["']$/g, '');
    }
    
    return null;
  } catch (error) {
    console.error("[AutoTitle] Generation error:", error);
    return null;
  }
}

// ═══ TEXT CHUNKING ═══
function chunkContent(text: string, maxTokens: number = 500, overlap: number = 50): string[] {
  const chunks: string[] = [];
  
  const hasBurmese = /[\u1000-\u109F]/.test(text);
  const charsPerToken = hasBurmese ? 2 : 4;
  const maxChars = maxTokens * charsPerToken;
  const overlapChars = overlap * charsPerToken;
  
  if (text.length <= maxChars) {
    return [text];
  }
  
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = "";
  
  for (const para of paragraphs) {
    if ((currentChunk + para).length <= maxChars) {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        const overlapText = currentChunk.slice(-overlapChars);
        currentChunk = overlapText + "\n\n" + para;
      } else {
        const sentences = para.split(/(?<=[.!?။])\s+/);
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length <= maxChars) {
            currentChunk += (currentChunk ? " " : "") + sentence;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              const overlapText = currentChunk.slice(-overlapChars);
              currentChunk = overlapText + " " + sentence;
            } else {
              for (let i = 0; i < sentence.length; i += maxChars - overlapChars) {
                chunks.push(sentence.slice(i, i + maxChars).trim());
              }
              currentChunk = "";
            }
          }
        }
      }
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(c => c.length > 10);
}

// ═══ CLEANUP STUCK ITEMS ═══
async function cleanupStuckItems(supabase: any): Promise<number> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data: stuckQueueItems } = await supabase
    .from("kb_embedding_sync_queue")
    .update({ status: "pending", error_message: "Reset: stuck in processing" })
    .eq("status", "processing")
    .lt("created_at", fiveMinutesAgo)
    .select("content_id");
  
  if (stuckQueueItems?.length) {
    for (const item of stuckQueueItems) {
      await supabase
        .from("ai_generated_content")
        .update({ 
          embedding_status: "pending",
          embedding_error: "Reset: was stuck in processing"
        })
        .eq("id", item.content_id);
    }
    console.log(`[Cleanup] Reset ${stuckQueueItems.length} stuck items`);
    return stuckQueueItems.length;
  }
  
  return 0;
}

// ═══ PROCESS SYNC QUEUE ═══
async function processSyncQueue(supabase: any, apiKey: string): Promise<{ processed: number; errors: number; errorMessage?: string }> {
  let processed = 0;
  let errors = 0;
  let lastError = "";
  
  // First, clean up stuck items
  await cleanupStuckItems(supabase);
  
  // Get pending items (reduced batch size to avoid rate limits)
  const { data: queueItems, error: fetchError } = await supabase
    .from("kb_embedding_sync_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5); // Reduced from 10 to 5
  
  if (fetchError || !queueItems?.length) {
    console.log("[SyncQueue] No pending items or error:", fetchError?.message);
    return { processed: 0, errors: 0 };
  }
  
  console.log(`[SyncQueue] Processing ${queueItems.length} items`);
  
  for (let queueIndex = 0; queueIndex < queueItems.length; queueIndex++) {
    const item = queueItems[queueIndex];
    
    try {
      // Mark as processing
      await supabase
        .from("kb_embedding_sync_queue")
        .update({ status: "processing" })
        .eq("id", item.id);
      
      await supabase
        .from("ai_generated_content")
        .update({ embedding_status: "processing", embedding_error: null })
        .eq("id", item.content_id);
      
      if (item.action === "delete") {
        await supabase
          .from("knowledge_base_embeddings")
          .delete()
          .eq("content_id", item.content_id);
        
        console.log(`[SyncQueue] Deleted embeddings for content ${item.content_id}`);
      } else {
        // Fetch the content
        const { data: content, error: contentError } = await supabase
          .from("ai_generated_content")
          .select("id, title, content, category, language")
          .eq("id", item.content_id)
          .eq("is_global", true)
          .single();
        
        if (contentError || !content) {
          throw new Error(`Content not found: ${contentError?.message || "Not global"}`);
        }
        
        // Auto-title generation if needed
        const needsTitle = !content.title || 
                           content.title.includes("__") || 
                           content.title.startsWith("_") ||
                           content.title.length < 3;
                           
        if (needsTitle) {
          console.log(`[SyncQueue] Title needs generation for: "${content.title || 'empty'}"`);
          const cleanTitle = await generateCleanTitle(content.content, apiKey);
          if (cleanTitle) {
            await supabase
              .from("ai_generated_content")
              .update({ title: cleanTitle })
              .eq("id", content.id);
            content.title = cleanTitle;
            console.log(`[SyncQueue] Auto-titled: "${cleanTitle}"`);
          }
          // Small delay after title generation
          await sleep(200);
        }
        
        // Delete existing embeddings
        await supabase
          .from("knowledge_base_embeddings")
          .delete()
          .eq("content_id", item.content_id);
        
        // Chunk the content
        const fullText = `${content.title}\n\n${content.content}`;
        const chunks = chunkContent(fullText, 500, 50);
        
        console.log(`[SyncQueue] Content "${content.title}" split into ${chunks.length} chunks`);
        
        let successfulChunks = 0;
        
        // Generate embeddings for each chunk WITH DELAYS
        for (let i = 0; i < chunks.length; i++) {
          const embedding = await generateEmbeddingWithRetry(chunks[i], apiKey);
          
          if (!embedding) {
            throw new Error(`Failed to generate embedding for chunk ${i + 1}/${chunks.length} after ${MAX_RETRIES} retries`);
          }
          
          // Format embedding as PostgreSQL array string for pgvector
          const embeddingStr = `[${embedding.join(",")}]`;
          
          // Insert with verification
          const { data: insertResult, error: insertError } = await supabase
            .from("knowledge_base_embeddings")
            .insert({
              content_id: item.content_id,
              chunk_index: i,
              content_chunk: chunks[i],
              embedding: embeddingStr,
            })
            .select("id")
            .single();
          
          if (insertError) {
            console.error(`[SyncQueue] Insert error for chunk ${i}:`, insertError);
            throw new Error(`Failed to insert embedding chunk ${i + 1}: ${insertError.message}`);
          }
          
          if (!insertResult?.id) {
            throw new Error(`No ID returned for chunk ${i + 1} - insert may have failed silently`);
          }
          
          successfulChunks++;
          console.log(`[SyncQueue] Chunk ${i + 1}/${chunks.length} inserted (ID: ${insertResult.id.substring(0, 8)}...)`);
          
          // Delay between chunks to avoid rate limits
          if (i < chunks.length - 1) {
            await sleep(CHUNK_DELAY_MS);
          }
        }
        
        // Final verification
        const { count: embeddingCount, error: countError } = await supabase
          .from("knowledge_base_embeddings")
          .select("*", { count: "exact", head: true })
          .eq("content_id", item.content_id);
        
        if (countError) {
          throw new Error(`Failed to verify embeddings: ${countError.message}`);
        }
        
        if (!embeddingCount || embeddingCount === 0) {
          throw new Error(`Verification failed: No embeddings found after insert`);
        }
        
        console.log(`[SyncQueue] ✓ VERIFIED: Created ${embeddingCount} embeddings for "${content.title}"`);
      }
      
      // Mark as completed
      await supabase
        .from("kb_embedding_sync_queue")
        .update({ 
          status: "completed",
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", item.id);
      
      // Mark source as synced
      await supabase
        .from("ai_generated_content")
        .update({ 
          embedding_status: "synced",
          embedding_synced_at: new Date().toISOString(),
          embedding_error: null
        })
        .eq("id", item.content_id);
      
      processed++;
      
      // Delay between items to avoid rate limits
      if (queueIndex < queueItems.length - 1) {
        await sleep(ITEM_DELAY_MS);
      }
      
    } catch (error) {
      console.error(`[SyncQueue] Error processing item ${item.id}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      lastError = errorMessage;
      
      // Check if it's a rate limit error
      const isRateLimit = errorMessage.toLowerCase().includes("rate") || 
                          errorMessage.includes("429") ||
                          errorMessage.includes("quota");
      
      await supabase
        .from("kb_embedding_sync_queue")
        .update({ 
          status: "failed",
          error_message: errorMessage,
          processed_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      
      await supabase
        .from("ai_generated_content")
        .update({ 
          embedding_status: "failed",
          embedding_error: errorMessage
        })
        .eq("id", item.content_id);
      
      errors++;
      
      // If rate limited, add a longer delay before continuing
      if (isRateLimit) {
        console.log(`[SyncQueue] Rate limit detected, cooling down for ${RATE_LIMIT_DELAY_MS}ms...`);
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }
  }
  
  return { processed, errors, errorMessage: lastError || undefined };
}

// ═══ PROCESS SINGLE ITEM DIRECTLY (BYPASS QUEUE) ═══
async function processSingleItem(
  supabase: any, 
  apiKey: string, 
  contentId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[SingleSync] Starting direct sync for content: ${contentId}`);
  
  try {
    // 1. Mark as processing
    await supabase
      .from("ai_generated_content")
      .update({ embedding_status: "processing", embedding_error: null })
      .eq("id", contentId);

    // 2. Fetch the content
    const { data: content, error: contentError } = await supabase
      .from("ai_generated_content")
      .select("id, title, content, category, language")
      .eq("id", contentId)
      .eq("is_global", true)
      .single();

    if (contentError || !content) {
      throw new Error(`Content not found: ${contentError?.message || "Not global or doesn't exist"}`);
    }

    console.log(`[SingleSync] Processing: "${content.title}"`);

    // 3. Auto-title if needed
    const needsTitle = !content.title || 
                       content.title.includes("__") || 
                       content.title.startsWith("_") ||
                       content.title.length < 3;
                       
    if (needsTitle) {
      console.log(`[SingleSync] Generating title for: "${content.title || 'empty'}"`);
      const cleanTitle = await generateCleanTitle(content.content, apiKey);
      if (cleanTitle) {
        await supabase
          .from("ai_generated_content")
          .update({ title: cleanTitle })
          .eq("id", content.id);
        content.title = cleanTitle;
        console.log(`[SingleSync] Auto-titled: "${cleanTitle}"`);
      }
      await sleep(200);
    }

    // 4. Delete existing embeddings
    await supabase
      .from("knowledge_base_embeddings")
      .delete()
      .eq("content_id", contentId);

    // 5. Chunk the content
    const fullText = `${content.title}\n\n${content.content}`;
    const chunks = chunkContent(fullText, 500, 50);

    console.log(`[SingleSync] Content split into ${chunks.length} chunks`);

    // 6. Generate and insert embeddings
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbeddingWithRetry(chunks[i], apiKey);
      
      if (!embedding) {
        throw new Error(`Failed to generate embedding for chunk ${i + 1}/${chunks.length}`);
      }

      const embeddingStr = `[${embedding.join(",")}]`;
      
      const { data: insertResult, error: insertError } = await supabase
        .from("knowledge_base_embeddings")
        .insert({
          content_id: contentId,
          chunk_index: i,
          content_chunk: chunks[i],
          embedding: embeddingStr,
        })
        .select("id")
        .single();

      if (insertError) {
        throw new Error(`Insert error for chunk ${i + 1}: ${insertError.message}`);
      }

      console.log(`[SingleSync] Chunk ${i + 1}/${chunks.length} done (ID: ${insertResult.id.substring(0, 8)}...)`);

      if (i < chunks.length - 1) {
        await sleep(CHUNK_DELAY_MS);
      }
    }

    // 7. Verify embeddings
    const { count: embeddingCount, error: countError } = await supabase
      .from("knowledge_base_embeddings")
      .select("*", { count: "exact", head: true })
      .eq("content_id", contentId);

    if (countError || !embeddingCount || embeddingCount === 0) {
      throw new Error(`Verification failed: No embeddings found after insert`);
    }

    // 8. Mark as synced
    await supabase
      .from("ai_generated_content")
      .update({ 
        embedding_status: "synced",
        embedding_synced_at: new Date().toISOString(),
        embedding_error: null
      })
      .eq("id", contentId);

    console.log(`[SingleSync] ✓ SUCCESS: "${content.title}" (${embeddingCount} embeddings)`);
    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SingleSync] ERROR:`, errorMessage);

    await supabase
      .from("ai_generated_content")
      .update({ 
        embedding_status: "failed",
        embedding_error: errorMessage
      })
      .eq("id", contentId);

    return { success: false, error: errorMessage };
  }
}

// ═══ MAIN HANDLER ═══
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Gemini API key from admin settings
    const { data: adminSettings, error: settingsError } = await supabase
      .from("ai_model_settings")
      .select("system_api_key")
      .single();

    if (settingsError) {
      console.error("[sync-kb-embeddings] Failed to fetch settings:", settingsError);
    }

    const GEMINI_API_KEY = adminSettings?.system_api_key;
    if (!GEMINI_API_KEY) {
      throw new Error("System API Key not configured. Please set it in Admin Panel > AI Tools > NeuroDigitalBrain > Settings");
    }

    const body = await req.json().catch(() => ({}));
    const { action, content_id } = body;

    if (action === "sync_single" && content_id) {
      console.log(`[sync-kb-embeddings] Direct sync requested for: ${content_id}`);
      
      // DIRECT processing - bypass queue entirely
      const result = await processSingleItem(supabase, GEMINI_API_KEY, content_id);
      
      return new Response(
        JSON.stringify({ 
          success: result.success,
          message: result.success 
            ? `Successfully synced content ${content_id}` 
            : `Sync failed: ${result.error}`,
          processed: result.success ? 1 : 0,
          errors: result.success ? 0 : 1,
          errorMessage: result.error,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "process_queue" || !action) {
      const result = await processSyncQueue(supabase, GEMINI_API_KEY);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Processed ${result.processed} items, ${result.errors} errors`,
          ...result,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "sync_pending") {
      await cleanupStuckItems(supabase);
      
      const { data: pendingContent } = await supabase
        .from("ai_generated_content")
        .select("id")
        .eq("is_global", true)
        .or("embedding_status.eq.pending,embedding_status.eq.failed,embedding_status.is.null");
      
      if (pendingContent?.length) {
        for (const content of pendingContent) {
          await supabase.from("kb_embedding_sync_queue").upsert({
            content_id: content.id,
            action: "update",
            status: "pending",
            created_at: new Date().toISOString(),
            error_message: null,
          }, { onConflict: "content_id" });
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Queued ${pendingContent?.length || 0} pending items for sync`,
          queued: pendingContent?.length || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "sync_all") {
      await cleanupStuckItems(supabase);
      
      const { data: globalContent } = await supabase
        .from("ai_generated_content")
        .select("id")
        .eq("is_global", true);
      
      if (globalContent?.length) {
        for (const content of globalContent) {
          await supabase.from("kb_embedding_sync_queue").upsert({
            content_id: content.id,
            action: "update",
            status: "pending",
            created_at: new Date().toISOString(),
            error_message: null,
          }, { onConflict: "content_id" });
          
          await supabase
            .from("ai_generated_content")
            .update({ 
              embedding_status: "pending",
              embedding_error: null 
            })
            .eq("id", content.id);
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Queued ${globalContent?.length || 0} items for sync`,
          queued: globalContent?.length || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "reset_all") {
      await supabase.from("kb_embedding_sync_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      await supabase
        .from("ai_generated_content")
        .update({ 
          embedding_status: "pending",
          embedding_synced_at: null,
          embedding_error: null 
        })
        .eq("is_global", true);
      
      const { data: globalContent } = await supabase
        .from("ai_generated_content")
        .select("id")
        .eq("is_global", true);
      
      if (globalContent?.length) {
        for (const content of globalContent) {
          await supabase.from("kb_embedding_sync_queue").insert({
            content_id: content.id,
            action: "update",
            status: "pending",
            created_at: new Date().toISOString(),
          });
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Reset complete. Queued ${globalContent?.length || 0} items for fresh sync.`,
          queued: globalContent?.length || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[sync-kb-embeddings] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
