// ═══ LLM Stream Parser Module — Extracted from agentic-loop.ts ═══
// SSE line parsing, thinking/tool_code tag filtering, tool call accumulation, loop killer.

// sanitizeUserVisibleText removed from streaming phase — full sanitization deferred to post-loop-handler

export interface ToolCallWithMetadata {
  id: string;
  name: string;
  arguments: Record<string, any>;
  thought_signature?: string;
}

export interface StreamParseResult {
  stepContent: string;
  stepToolCalls: ToolCallWithMetadata[];
  stepFinishReason: string | null;
  streamEnded: boolean;
  hasVisibleContentStreamed: boolean;
  totalCachedTokens: number;
  cacheType: "explicit" | "implicit" | "none";
}

export interface StreamParserCallbacks {
  safeEnqueue: (data: Uint8Array) => boolean;
  onFirstToken?: () => void;
  onThinkingBlock?: (step: number, summary: string) => void;
  onToolCall?: (name: string, callId: string, index: number) => void;
  /** Called for each Anthropic native thinking_delta chunk (extended thinking) */
  onExtendedThinkingDelta?: (blockIndex: number, step: number, text: string) => void;
  /** Called when an Anthropic native thinking block completes */
  onExtendedThinkingStop?: (blockIndex: number, step: number, fullText: string) => void;
}

/**
 * Repair partial/concatenated tool argument JSON by finding the outermost
 * balanced {} object using a string-aware state machine (handles escaped
 * quotes and backslashes). Falls back to empty object on total failure.
 */
export function repairToolArgumentsJSON(raw: string): Record<string, any> {
  if (!raw) return {};
  // Fast path: already valid
  try { return JSON.parse(raw); } catch { /* fall through to repair */ }

  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;
  let end = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { if (inString) escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) { end = i; break; }
    }
  }

  if (start !== -1 && end !== -1) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* fall through */ }
    // Try closing unclosed object
    try { return JSON.parse(raw.slice(start, end + 1) + '}'); } catch { /* fall through */ }
  }

  // Last resort: try appending closing braces for unclosed nesting
  if (start !== -1 && depth > 0) {
    try { return JSON.parse(raw.slice(start) + '}'.repeat(depth)); } catch { /* fall through */ }
  }

  return {};
}

/**
 * Parse SSE stream from LLM API response.
 * Handles: thinking tag filtering, tool_code leak suppression, buffered content enqueue,
 * tool call argument accumulation, loop killer, finish_reason capture.
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  encoder: TextEncoder,
  step: number,
  sanitizedMessage: string,
  initialCacheType: "explicit" | "implicit" | "none",
  callbacks: StreamParserCallbacks,
): Promise<StreamParseResult> {
  const { safeEnqueue, onFirstToken, onThinkingBlock, onToolCall, onExtendedThinkingDelta, onExtendedThinkingStop } = callbacks;
  
  const decoder = new TextDecoder();
  let buffer = "";
  let stepContent = "";
  let stepToolCalls: ToolCallWithMetadata[] = [];
  let toolArgumentsBuffer: Record<number, string> = {};
  let toolMetadataBuffer: Record<number, { id?: string; thought_signature?: string }> = {};
  let thinkingBlockBuffer: Record<number, string> = {}; // native Anthropic extended thinking
  let thinkingBlockIndices = new Set<number>(); // tracks which block indices are native thinking blocks
  let streamEnded = false;
  let thinkingBuffer = "";
  let insideThinkingBlock = false;
  let insideBracketThinking = false;
  let insideToolCodeBlock = false;
  let insideMarkdownToolBlock = false;
  let stepFinishReason: string | null = null;
  let hasVisibleContentStreamed = false;
  let totalCachedTokens = 0;
  let cacheType = initialCacheType;
  let capturedThinkingContent = "";
  let firstTokenEmitted = false;

  // Chunk buffering
  let contentChunkBuffer = "";
  let chunkFlushTimer: ReturnType<typeof setTimeout> | null = null;
  const CHUNK_FLUSH_INTERVAL_MS = 50;
  const MIN_CHUNK_BUFFER_SIZE = 100;
  let lastTemplateParsed: Record<string, any> | null = null;

  function bufferedContentEnqueue(sanitizedParsed: Record<string, any>) {
    lastTemplateParsed = sanitizedParsed;
    const text = sanitizedParsed.choices?.[0]?.delta?.content || "";
    contentChunkBuffer += text;
    if (contentChunkBuffer.length >= MIN_CHUNK_BUFFER_SIZE) {
      flushContentBuffer(sanitizedParsed);
    } else if (!chunkFlushTimer) {
      const templateParsed = sanitizedParsed;
      chunkFlushTimer = setTimeout(() => flushContentBuffer(templateParsed), CHUNK_FLUSH_INTERVAL_MS);
    }
  }

  function flushContentBuffer(templateParsed?: Record<string, any>) {
    if (chunkFlushTimer) { clearTimeout(chunkFlushTimer); chunkFlushTimer = null; }
    if (contentChunkBuffer.length > 0 && templateParsed) {
      const batchedParsed = {
        ...templateParsed,
        choices: [{ ...templateParsed.choices?.[0], delta: { content: contentChunkBuffer } }]
      };
      safeEnqueue(encoder.encode(`data: ${JSON.stringify(batchedParsed)}\n\n`));
      hasVisibleContentStreamed = true;
      contentChunkBuffer = "";
    } else if (contentChunkBuffer.length > 0) {
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: contentChunkBuffer } }] })}\n\n`));
      hasVisibleContentStreamed = true;
      contentChunkBuffer = "";
    }
  }

  // ═══ SSE Stream Parser ═══
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamEnded = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);

        // ═══ OpenRouter mid-stream error detection ═══
        if (parsed.error) {
          const errMsg = parsed.error.message || parsed.error.code || 'Unknown mid-stream error';
          console.error(`[StreamParser] Mid-stream error from provider: ${errMsg}`);
          stepContent += `\n⚠️ ${errMsg}`;
          streamEnded = true;
          break;
        }

        // ═══ ANTHROPIC SSE FORMAT ADAPTER ═══
        // Convert Anthropic event types to OpenAI-compatible delta format inline
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          // Treat as delta.content
          const syntheticDelta = { content: parsed.delta.text };
          const syntheticParsed = { choices: [{ delta: syntheticDelta, finish_reason: null }] };
          // Fall through with transformed format
          Object.assign(parsed, syntheticParsed);
          delete parsed.type;
          delete parsed.delta;
        } else if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
          // Anthropic end-of-message
          stepFinishReason = parsed.delta.stop_reason === 'end_turn' ? 'stop' : parsed.delta.stop_reason;
          if (parsed.usage) {
            totalCachedTokens += parsed.usage.cache_read_input_tokens || 0;
          }
          continue;
        } else if (parsed.type === 'message_stop') {
          streamEnded = true;
          break;
        } else if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'thinking') {
          // Anthropic native extended thinking block start
          const blockIdx = typeof parsed.index === 'number' ? parsed.index : 0;
          thinkingBlockIndices.add(blockIdx);
          thinkingBlockBuffer[blockIdx] = '';
          safeEnqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'thinking_block', phase: 'start', index: blockIdx, step })}\n\n`
          ));
          continue;
        } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'thinking_delta') {
          // Anthropic native extended thinking delta
          const blockIdx = typeof parsed.index === 'number' ? parsed.index : 0;
          const text = parsed.delta?.thinking || '';
          thinkingBlockBuffer[blockIdx] = (thinkingBlockBuffer[blockIdx] || '') + text;
          if (text) {
            onExtendedThinkingDelta?.(blockIdx, step, text);
            safeEnqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'thinking_block', phase: 'delta', index: blockIdx, step, text })}\n\n`
            ));
          }
          continue;
        } else if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
          // Anthropic tool use start — accumulate
          const toolBlock = parsed.content_block;
          const toolIdx = parsed.index || Object.keys(toolArgumentsBuffer).length;
          toolMetadataBuffer[toolIdx] = { id: toolBlock.id };
          toolArgumentsBuffer[toolIdx] = '';
          // Create tool call entry
          const toolCall: ToolCallWithMetadata = {
            id: toolBlock.id,
            name: toolBlock.name,
            arguments: {},
          };
          stepToolCalls.push(toolCall);
          onToolCall?.(toolBlock.name, toolBlock.id, toolIdx);
          continue;
        } else if (parsed.type === 'input_json_delta' || (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta')) {
          // Anthropic tool argument streaming
          const toolIdx = parsed.index || 0;
          const partialJson = parsed.delta?.partial_json || '';
          toolArgumentsBuffer[toolIdx] = (toolArgumentsBuffer[toolIdx] || '') + partialJson;
          continue;
        } else if (parsed.type === 'content_block_stop') {
          const blockIdx = typeof parsed.index === 'number' ? parsed.index : 0;
          // Finalize native thinking block
          if (thinkingBlockIndices.has(blockIdx)) {
            const fullText = thinkingBlockBuffer[blockIdx] || '';
            onExtendedThinkingStop?.(blockIdx, step, fullText);
            const summary = fullText.slice(0, 200).replace(/\n/g, ' ').trim();
            if (summary.length > 5) onThinkingBlock?.(step, summary);
            safeEnqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'thinking_block', phase: 'stop', index: blockIdx, step, chars: fullText.length })}\n\n`
            ));
            thinkingBlockIndices.delete(blockIdx);
            delete thinkingBlockBuffer[blockIdx];
            continue;
          }
          // Finalize tool arguments if this was a tool_use block
          const toolIdx = blockIdx;
          if (toolArgumentsBuffer[toolIdx] !== undefined && toolMetadataBuffer[toolIdx]) {
            const lastToolCall = stepToolCalls.find(tc => tc.id === toolMetadataBuffer[toolIdx].id);
            if (lastToolCall) {
              lastToolCall.arguments = repairToolArgumentsJSON(toolArgumentsBuffer[toolIdx]);
            }
            delete toolArgumentsBuffer[toolIdx];
            delete toolMetadataBuffer[toolIdx];
          }
          continue;
        } else if (parsed.type && !parsed.choices) {
          // Other Anthropic event types (message_start, ping, etc.) — skip
          continue;
        }

        const delta = parsed.choices?.[0]?.delta;

        // Capture finish_reason for token-cap detection
        const fr = parsed.choices?.[0]?.finish_reason;
        if (fr) {
          stepFinishReason = fr;
          // OpenRouter finish_reason=error → mid-stream failure
          if (fr === 'error') {
            const errDetail = parsed.choices?.[0]?.error?.message || 'Stream terminated with error';
            console.error(`[StreamParser] finish_reason=error: ${errDetail}`);
            stepContent += `\n⚠️ ${errDetail}`;
            streamEnded = true;
            break;
          }
        }

        // Track native_finish_reason for debugging (OpenRouter provides both)
        const nfr = parsed.choices?.[0]?.native_finish_reason;
        if (nfr && fr && nfr !== fr) {
          console.log(`[StreamParser] native_finish_reason: ${nfr} (normalized: ${fr})`);
        }

        // Cache telemetry
        if (parsed.usage) {
          const cachedFromUsage = parsed.usage.prompt_tokens_details?.cached_tokens
            || parsed.usage.cached_tokens
            || 0;
          if (cachedFromUsage > 0) {
            totalCachedTokens += cachedFromUsage;
            if (cacheType === "none") cacheType = "implicit";
            console.log(`[CacheHit] Step ${step}: ${cachedFromUsage} cached tokens detected (type: ${cacheType})`);
          }
          // OpenRouter reasoning token usage tracking
          const reasoningTokens = parsed.usage.completion_tokens_details?.reasoning_tokens;
          if (reasoningTokens && reasoningTokens > 0) {
            console.log(`[ReasoningTokens] Step ${step}: ${reasoningTokens} reasoning tokens used`);
          }
        }

        // ═══ OpenRouter reasoning tokens (delta.reasoning) ═══
        if (delta?.reasoning) {
          capturedThinkingContent += delta.reasoning;
          const reasoningSummary = delta.reasoning.slice(0, 200).replace(/\n/g, ' ').trim();
          if (reasoningSummary.length > 10) {
            onThinkingBlock?.(step, reasoningSummary);
          }
        }

        if (delta?.content) {
          if (!firstTokenEmitted) {
            firstTokenEmitted = true;
            onFirstToken?.();
          }

          const rawContent = delta.content;
          stepContent += rawContent;

          // Loop killer
          if (stepContent.length > 80) {
            const tail = stepContent.slice(-80);
            const seg = tail.slice(-20);
            if (tail.includes(seg + seg + seg)) {
              console.warn("[LoopKiller] Repetitive output detected, aborting stream");
              stepContent = stepContent.slice(0, stepContent.length - 60);
              streamEnded = true;
              break;
            }
          }

          // Thinking tag filter
          let contentToStream = "";
          const combined = thinkingBuffer + rawContent;
          thinkingBuffer = "";

          if (insideThinkingBlock) {
            const closeIdx = combined.indexOf("</thinking>");
            const bracketEndIdx = insideBracketThinking ? combined.search(/\n(?=##|\*\*|🐝|[\u1000-\u109F])/) : -1;
            const effectiveCloseIdx = closeIdx !== -1 ? closeIdx : bracketEndIdx;
            const closeTagLen = closeIdx !== -1 ? "</thinking>".length : 0;
            
            if (effectiveCloseIdx !== -1) {
              const thinkingChunk = combined.slice(0, effectiveCloseIdx);
              capturedThinkingContent += thinkingChunk;
              insideThinkingBlock = false;
              insideBracketThinking = false;
              contentToStream = combined.slice(effectiveCloseIdx + closeTagLen);
              const thinkingSummary = thinkingChunk.slice(0, 200).replace(/\n/g, ' ').trim();
              if (thinkingSummary.length > 10) {
                onThinkingBlock?.(step, thinkingSummary);
              }
            } else {
              capturedThinkingContent += combined;
            }
          } else if (insideToolCodeBlock) {
            const closeToolIdx = combined.indexOf("</tool_code>");
            if (closeToolIdx !== -1) {
              insideToolCodeBlock = false;
              contentToStream = combined.slice(closeToolIdx + "</tool_code>".length);
            } else {
              contentToStream = "";
            }
          } else if (insideMarkdownToolBlock) {
            const closeFenceIdx = combined.indexOf("```");
            if (closeFenceIdx !== -1) {
              insideMarkdownToolBlock = false;
              contentToStream = combined.slice(closeFenceIdx + 3);
            } else {
              contentToStream = "";
            }
          } else {
            // Check for markdown code block tool-call leak
            const mdToolMatch = combined.match(/```(?:json)?\s*\n?\s*\{[^}]*"tool_(?:code|name)"/);
            if (mdToolMatch) {
              const mdStart = mdToolMatch.index!;
              contentToStream = combined.slice(0, mdStart);
              const afterOpen = combined.slice(mdStart);
              const closingFence = afterOpen.indexOf("```", 3);
              if (closingFence !== -1) {
                contentToStream += afterOpen.slice(closingFence + 3);
              } else {
                insideMarkdownToolBlock = true;
              }
            } else {
              // Check for <tool_code> tag
              const toolCodeIdx = combined.indexOf("<tool_code>");
              if (toolCodeIdx !== -1) {
                contentToStream = combined.slice(0, toolCodeIdx);
                const closeToolIdx = combined.indexOf("</tool_code>", toolCodeIdx);
                if (closeToolIdx !== -1) {
                  contentToStream += combined.slice(closeToolIdx + "</tool_code>".length);
                } else {
                  insideToolCodeBlock = true;
                }
              } else {
                // Check for <thinking> tag
                const openIdx = combined.indexOf("<thinking>");
                const bracketMatch = combined.match(/\[Thinking:?\]\s*\n?/i);
                const bracketIdx = bracketMatch ? combined.indexOf(bracketMatch[0]) : -1;
                
                if (openIdx !== -1 && (bracketIdx === -1 || openIdx < bracketIdx)) {
                  contentToStream = combined.slice(0, openIdx);
                  insideThinkingBlock = true;
                  insideBracketThinking = false;
                  const closeIdx = combined.indexOf("</thinking>", openIdx);
                  if (closeIdx !== -1) {
                    const thinkingChunk = combined.slice(openIdx + "<thinking>".length, closeIdx);
                    capturedThinkingContent += thinkingChunk;
                    insideThinkingBlock = false;
                    contentToStream += combined.slice(closeIdx + "</thinking>".length);
                    const thinkingSummary = thinkingChunk.slice(0, 200).replace(/\n/g, ' ').trim();
                    if (thinkingSummary.length > 10) {
                      onThinkingBlock?.(step, thinkingSummary);
                    }
                  }
                } else if (bracketIdx !== -1) {
                  contentToStream = combined.slice(0, bracketIdx);
                  insideThinkingBlock = true;
                  insideBracketThinking = true;
                  const afterBracket = combined.slice(bracketIdx + bracketMatch![0].length);
                  const endMatch = afterBracket.search(/\n(?=##|\*\*|🐝|[\u1000-\u109F])/);
                  if (endMatch !== -1) {
                    const thinkingChunk = afterBracket.slice(0, endMatch);
                    capturedThinkingContent += thinkingChunk;
                    insideThinkingBlock = false;
                    insideBracketThinking = false;
                    contentToStream += afterBracket.slice(endMatch);
                  } else {
                    capturedThinkingContent += afterBracket;
                  }
                } else {
                  const lastLt = combined.lastIndexOf("<");
                  const lastBracket = combined.lastIndexOf("[");
                  if (lastLt !== -1 && lastLt >= combined.length - 12 && "<tool_code>".startsWith(combined.slice(lastLt))) {
                    contentToStream = combined.slice(0, lastLt);
                    thinkingBuffer = combined.slice(lastLt);
                  } else if (lastLt !== -1 && lastLt >= combined.length - 10 && "<thinking>".startsWith(combined.slice(lastLt))) {
                    contentToStream = combined.slice(0, lastLt);
                    thinkingBuffer = combined.slice(lastLt);
                  } else if (lastBracket !== -1 && lastBracket >= combined.length - 12 && "[Thinking]".toLowerCase().startsWith(combined.slice(lastBracket).toLowerCase())) {
                    contentToStream = combined.slice(0, lastBracket);
                    thinkingBuffer = combined.slice(lastBracket);
                  } else {
                    contentToStream = combined;
                  }
                }
              }
            }
          }

          if (contentToStream) {
            // Only strip critical leaks during streaming (thinking/tool_code tags)
            // Full sanitization (fluff, echo detection) deferred to post-loop-handler before DB save
            const streamSafe = contentToStream
              .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
              .replace(/<thinking>[\s\S]*$/g, '')
              .replace(/<tool_code>[\s\S]*?<\/tool_code>/g, '')
              .replace(/<tool_code>[\s\S]*$/g, '');
            if (streamSafe.length > 0) {
              const sanitizedParsed = {
                ...parsed,
                choices: [{
                  ...parsed.choices[0],
                  delta: { ...delta, content: streamSafe }
                }]
              };
              bufferedContentEnqueue(sanitizedParsed);
            }
          }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? stepToolCalls.length;
            if (!toolMetadataBuffer[idx]) {
              toolMetadataBuffer[idx] = {};
            }
            if (tc.id) {
              toolMetadataBuffer[idx].id = tc.id;
            }
            if (tc.extra_content?.google?.thought_signature) {
              toolMetadataBuffer[idx].thought_signature = tc.extra_content.google.thought_signature;
              console.log(`[Agent] Captured thought_signature for tool ${idx}`);
            }
            if (tc.function?.name) {
              stepToolCalls[idx] = {
                id: toolMetadataBuffer[idx].id || `call_${step}_${idx}`,
                name: tc.function.name,
                arguments: {},
                thought_signature: toolMetadataBuffer[idx].thought_signature,
              };
              const callId = tc.id || `call_${step}_${idx}`;
              onToolCall?.(tc.function.name, callId, idx);
            }
            if (tc.function?.arguments) {
              toolArgumentsBuffer[idx] = (toolArgumentsBuffer[idx] || "") + tc.function.arguments;
            }
          }
        }
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }

    if (streamEnded) break;
  }

  // Clean up
  if (chunkFlushTimer) { clearTimeout(chunkFlushTimer); chunkFlushTimer = null; }
  flushContentBuffer(lastTemplateParsed || undefined);

  // Filter sparse/nameless tool calls
  stepToolCalls = stepToolCalls.filter(tc => tc && tc.name);

  // Parse accumulated tool arguments (with concatenated JSON recovery)
  stepToolCalls.forEach((tool, idx) => {
    if (toolArgumentsBuffer[idx]) {
      tool.arguments = repairToolArgumentsJSON(toolArgumentsBuffer[idx]);
      if (!Object.keys(tool.arguments).length) {
        console.warn(`[JSONRecovery] Could not parse args for ${tool.name}, using {}`);
      }
    }
  });

  return {
    stepContent,
    stepToolCalls,
    stepFinishReason,
    streamEnded,
    hasVisibleContentStreamed,
    totalCachedTokens,
    cacheType,
  };
}

/**
 * Detect partial stream termination (stream ended without [DONE] and has content).
 */
export function detectPartialStreamEnd(streamEnded: boolean, stepContent: string): boolean {
  if (!streamEnded && stepContent.length > 0) {
    return true;
  }
  return false;
}
