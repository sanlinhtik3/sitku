import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ImageAttachmentInput {
  type: 'image' | 'file';
  base64: string;
  mime_type: string;
  file_name: string;
}

export interface StorageAttachment {
  type: 'image' | 'file';
  mime_type: string;
  file_name: string;
  size_bytes: number;
  storage_url: string;
}

// ═══ Hard caps to prevent mobile-Safari OOM crashes on huge attachments. ═══
// 20MB / image, 100MB total per send. Base64 expands ~33%, so check decoded bytes.
const MAX_PER_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function decodedByteLength(base64: string): number {
  // base64 length * 3 / 4, minus padding
  const pad = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - pad;
}

export async function uploadImageAttachments(
  attachments: ImageAttachmentInput[],
  userId: string,
  sessionId: string,
): Promise<StorageAttachment[]> {
  // ═══ Pre-flight size validation (cheap; runs before any network/encode work) ═══
  let total = 0;
  for (const att of attachments) {
    const size = decodedByteLength(att.base64);
    if (size > MAX_PER_FILE_BYTES) {
      toast.error(
        `${att.file_name || 'File'} is too large (${(size / 1024 / 1024).toFixed(1)}MB). Max 20MB per file.`,
      );
      return [];
    }
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) {
    toast.error(
      `Attachments too large (${(total / 1024 / 1024).toFixed(1)}MB total). Max 100MB per send.`,
    );
    return [];
  }

  const uploadResults = await Promise.all(
    attachments.map(async (att) => {
      try {
        const byteChars = atob(att.base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: att.mime_type });
        const ext = att.mime_type === 'application/pdf' ? 'pdf' : (att.mime_type.split('/')[1]?.split('+')[0] || 'jpg');
        const storagePath = `${userId}/${sessionId}/${Date.now()}_${att.file_name || 'file'}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('agent-chat-images')
          .upload(storagePath, blob, { contentType: att.mime_type, upsert: false });

        if (uploadErr) {
          console.error('[Vision] Storage upload failed:', uploadErr);
          return null;
        }

        const { data: signedData } = await supabase.storage
          .from('agent-chat-images')
          .createSignedUrl(storagePath, 60 * 60 * 24 * 5);

        return {
          type: att.type,
          mime_type: att.mime_type,
          file_name: att.file_name,
          size_bytes: decodedByteLength(att.base64),
          storage_url: signedData?.signedUrl || '',
        };
      } catch (err) {
        console.error('[Vision] Upload error:', err);
        return null;
      }
    })
  );
  return uploadResults.filter(Boolean) as StorageAttachment[];
}
