import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ImageAttachment } from "../ImagePreview";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB for PDFs (Gemini supports up to 20MB)
const MAX_IMAGES = 3;
const MAX_PDFS = 1;
// Hard ceiling on combined attachment payload — base64 inflates ~33%, so
// keeping the raw cap at 25 MB keeps the in-memory string under ~33 MB and
// prevents OOM crashes on mobile Safari with the slowest devices.
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'];

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf';
}

export function useImageAttachments() {
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up image previews on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, [images]);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setImages((prev) => {
      const newImages = [...prev];
      let totalBytes = newImages.reduce((sum, img) => sum + img.file.size, 0);
      for (const file of files) {
        if (!ALLOWED_FILE_TYPES.includes(file.type)) {
          toast.error(`${file.name}: Only JPEG, PNG, WebP, GIF, and PDF allowed`);
          continue;
        }

        const isPdf = isPdfFile(file);
        const currentPdfCount = newImages.filter(img => isPdfFile(img.file)).length;
        const currentImageCount = newImages.filter(img => !isPdfFile(img.file)).length;

        if (isPdf) {
          if (currentPdfCount >= MAX_PDFS) {
            toast.error(`Maximum ${MAX_PDFS} PDF per message`);
            continue;
          }
          if (file.size > MAX_PDF_SIZE) {
            toast.error(`${file.name}: Maximum 10MB per PDF`);
            continue;
          }
        } else {
          if (currentImageCount >= MAX_IMAGES) {
            toast.error(`Maximum ${MAX_IMAGES} images allowed`);
            continue;
          }
          if (file.size > MAX_IMAGE_SIZE) {
            toast.error(`${file.name}: Maximum 5MB per image`);
            continue;
          }
        }

        if (totalBytes + file.size > MAX_TOTAL_BYTES) {
          toast.error(`Combined attachments exceed ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB`);
          continue;
        }
        totalBytes += file.size;

        const preview = isPdf ? '' : URL.createObjectURL(file);
        const id = crypto.randomUUID();
        newImages.push({ id, file, preview });
      }
      return newImages;
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleRemoveImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const imageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const clearImages = useCallback(() => {
    setImages((prev) => {
      prev.forEach((img) => { if (img.preview) URL.revokeObjectURL(img.preview); });
      return [];
    });
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    images,
    setImages,
    fileInputRef,
    handleImageSelect,
    handleRemoveImage,
    imageToBase64,
    clearImages,
    openFilePicker,
    maxImages: MAX_IMAGES,
  };
}
