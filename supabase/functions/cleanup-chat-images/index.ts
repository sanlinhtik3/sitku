import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXPIRY_DAYS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS);

    // List all files in the bucket (paginate with limit 1000)
    const filesToDelete: string[] = [];
    let offset = 0;
    const limit = 1000;

    while (true) {
      const { data: objects, error: listError } = await supabaseAdmin.storage
        .from("agent-chat-images")
        .list("", { limit, offset, sortBy: { column: "created_at", order: "asc" } });

      if (listError) {
        console.error("List error:", listError);
        break;
      }

      if (!objects || objects.length === 0) break;

      // The bucket has user-id folders, so top-level items are folders
      // We need to list inside each folder
      for (const folder of objects) {
        if (folder.id === null || folder.id === undefined) {
          // This is a folder — list its contents
          const { data: files, error: folderError } = await supabaseAdmin.storage
            .from("agent-chat-images")
            .list(folder.name, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });

          if (folderError) {
            console.error(`Error listing folder ${folder.name}:`, folderError);
            continue;
          }

          if (files) {
            for (const file of files) {
              if (file.created_at) {
                const fileDate = new Date(file.created_at);
                if (fileDate < cutoff) {
                  filesToDelete.push(`${folder.name}/${file.name}`);
                }
              }
            }
          }
        } else {
          // Root-level file
          if (folder.created_at) {
            const fileDate = new Date(folder.created_at);
            if (fileDate < cutoff) {
              filesToDelete.push(folder.name);
            }
          }
        }
      }

      if (objects.length < limit) break;
      offset += limit;
    }

    let deletedCount = 0;
    const errors: string[] = [];

    // Batch delete in chunks of 100
    for (let i = 0; i < filesToDelete.length; i += 100) {
      const batch = filesToDelete.slice(i, i + 100);
      const { error: deleteError } = await supabaseAdmin.storage
        .from("agent-chat-images")
        .remove(batch);

      if (deleteError) {
        errors.push(`Batch ${i / 100}: ${deleteError.message}`);
      } else {
        deletedCount += batch.length;
      }
    }

    console.log(
      `Cleanup complete: ${deletedCount} files deleted, ${errors.length} errors`
    );

    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: deletedCount,
        total_found: filesToDelete.length,
        errors,
        cutoff_date: cutoff.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Cleanup error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
