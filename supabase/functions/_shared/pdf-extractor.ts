// ═══ PDF Text Extraction Module — Extracted from agentic-loop.ts ═══
// Handles PDF text extraction via Gemini native API and OpenAI-compat fallback.

import { emitThinking } from "./streaming-engine.ts";
import { GEMINI_NATIVE_PREFIX, GEMINI_OPENAI_ENDPOINT } from "./api-endpoints.ts";

/**
 * Extract text from PDF using Gemini native generateContent API.
 */
export async function extractPdfText(base64Data: string, apiKey: string, fileName: string): Promise<string> {
  try {
    const extractionModel = "gemini-2.5-flash";
    const response = await fetch(
      `${GEMINI_NATIVE_PREFIX}${extractionModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Extract ALL text content from this PDF document EXACTLY as written. 
Rules:
- Include every single word, number, date, name, and data point
- Preserve table structures using markdown table format
- Preserve list structures
- Preserve headings and sections
- Do NOT summarize, paraphrase, or interpret - extract verbatim
- Do NOT add any commentary or explanation
- If there are multiple pages, extract all pages in order
- Output ONLY the raw extracted text content`
              },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: base64Data,
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 16384,
          }
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PDF Extract] Gemini API error ${response.status}: ${errorText.slice(0, 200)}`);
      return `[PDF "${fileName}" could not be extracted - API error ${response.status}]`;
    }

    const result = await response.json();
    const extractedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!extractedText || extractedText.trim().length === 0) {
      console.warn(`[PDF Extract] No text extracted from "${fileName}"`);
      return `[PDF "${fileName}" appears to be empty or image-only]`;
    }

    console.log(`[PDF Extract] Successfully extracted ${extractedText.length} chars from "${fileName}"`);
    return extractedText;
  } catch (err) {
    console.error(`[PDF Extract] Failed for "${fileName}":`, err);
    return `[PDF "${fileName}" extraction failed: ${err instanceof Error ? err.message : 'unknown error'}]`;
  }
}

/**
 * Extract text from PDF using personal Gemini key via OpenAI-compat endpoint.
 */
export async function extractPdfTextViaPersonalKey(base64Data: string, fileName: string, personalKey: string): Promise<string> {
  try {
    if (!personalKey) {
      return `[PDF "${fileName}" could not be extracted - no personal API key available]`;
    }

    console.log(`[PDF PersonalKey] Extracting "${fileName}" via personal Gemini key...`);
    const response = await fetch(GEMINI_OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${personalKey}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract ALL text content from this PDF document EXACTLY as written. 
Rules:
- Include every single word, number, date, name, and data point
- Preserve table structures using markdown table format
- Preserve list structures and headings
- Do NOT summarize, paraphrase, or interpret - extract verbatim
- Output ONLY the raw extracted text content`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64Data}`,
              }
            }
          ]
        }],
        temperature: 0,
        max_tokens: 16384,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PDF PersonalKey] Error ${response.status}: ${errorText.slice(0, 200)}`);
      return `[PDF "${fileName}" could not be extracted - error ${response.status}]`;
    }

    const result = await response.json();
    const extractedText = result?.choices?.[0]?.message?.content;

    if (!extractedText || extractedText.trim().length === 0) {
      console.warn(`[PDF PersonalKey] No text extracted from "${fileName}"`);
      return `[PDF "${fileName}" appears to be empty or image-only]`;
    }

    console.log(`[PDF PersonalKey] Successfully extracted ${extractedText.length} chars from "${fileName}"`);
    return extractedText;
  } catch (err) {
    console.error(`[PDF PersonalKey] Failed for "${fileName}":`, err);
    return `[PDF "${fileName}" extraction failed: ${err instanceof Error ? err.message : 'unknown error'}]`;
  }
}

/**
 * Pre-process PDF attachments: extract text and inject into user messages.
 * Returns updated currentMessages array.
 */
export async function preprocessPdfAttachments(
  currentMessages: any[],
  validAttachments: any[],
  apiEndpoint: string,
  apiKey: string,
  userAISettings: any,
  systemKeyCheck: any,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  MAX_AGENT_STEPS: number,
): Promise<void> {
  const pdfAttachments = validAttachments.filter((a: any) => a.mime_type === 'application/pdf');
  if (pdfAttachments.length === 0) return;

  console.log(`[PDF] Extracting text from ${pdfAttachments.length} PDF(s) before LLM call...`);
  emitThinking(controller, encoder, "Reading document content... 📄", 0, MAX_AGENT_STEPS);
  
  // Determine the Google API key for extraction
  let extractionApiKey = '';
  
  if (apiEndpoint.includes('anthropic.com')) {
    const googleKey = userAISettings?.gemini_api_key || systemKeyCheck?.google_system_api_key;
    if (googleKey) extractionApiKey = googleKey;
  } else {
    if (apiKey && !apiEndpoint.includes('lovable.dev') && !apiEndpoint.includes('gateway')) {
      extractionApiKey = apiKey;
    } else {
      const googleKey = userAISettings?.gemini_api_key || systemKeyCheck?.google_system_api_key;
      if (googleKey) extractionApiKey = googleKey;
    }
  }
  
  if (!extractionApiKey) {
    const personalKey = userAISettings?.gemini_api_key;
    if (personalKey) {
      extractionApiKey = personalKey;
      console.log(`[PDF] Using personal Gemini key for PDF extraction`);
    } else {
      console.warn(`[PDF] No Google API key available — PDF extraction impossible`);
    }
  }
  
  if (extractionApiKey) {
    const extractionResults = await Promise.all(
      pdfAttachments.map((att: any) => 
        extractPdfText(att.base64, extractionApiKey, att.file_name || 'document.pdf')
      )
    );
    
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const msg = currentMessages[i];
      if (msg.role === 'user') {
        let filteredParts: any[];
        if (Array.isArray(msg.content)) {
          filteredParts = msg.content.filter((part: any) => {
            if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:application/pdf')) {
              return false;
            }
            return true;
          });
        } else {
          filteredParts = [{ type: "text", text: msg.content || "Please analyze this document." }];
        }
        
        const pdfTextParts = extractionResults.map((text: string, idx: number) => ({
          type: "text",
          text: `\n\n📄 **Document: ${pdfAttachments[idx].file_name || 'document.pdf'}** (Extracted Content):\n\`\`\`\n${text}\n\`\`\`\n`,
        }));
        
        currentMessages[i] = {
          ...msg,
          content: [...filteredParts, ...pdfTextParts],
        };
        
        console.log(`[PDF] Injected ${extractionResults.length} extracted PDF text(s) into user message`);
        break;
      }
    }
  } else {
    console.error(`[PDF] CRITICAL: Cannot extract PDF text — no API key available`);
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const msg = currentMessages[i];
      if (msg.role === 'user') {
        const errorText = `\n\n⚠️ **PDF Processing Error:** The document could not be read because no API key is available for text extraction. Please configure a Gemini API key in your settings to enable PDF analysis.`;
        if (Array.isArray(msg.content)) {
          const filteredParts = msg.content.filter((part: any) => {
            if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:application/pdf')) {
              return false;
            }
            return true;
          });
          currentMessages[i] = { ...msg, content: [...filteredParts, { type: "text", text: errorText }] };
        } else {
          currentMessages[i] = { ...msg, content: (msg.content || '') + errorText };
        }
        break;
      }
    }
  }
}
