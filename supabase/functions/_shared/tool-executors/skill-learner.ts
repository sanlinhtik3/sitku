// ═══ Project Phoenix: _shared/tool-executors/skill-learner.ts ═══
// Autonomous Skill Importer — Scrape API docs → AI parse → Auto-create skill
// Part of the OpenClaw Self-Hackable Skills System

import { executeCreateSkill } from "./skills.ts";

const EXTRACTION_PROMPT = `You are an API documentation parser. Analyze the following web page content and extract the API specification.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "skill_name": "snake_case_identifier",
  "description": "What this API does in one sentence",
  "api_url": "Full endpoint URL",
  "method": "GET or POST",
  "headers": { "header_name": "header_value" },
  "parameters": [
    { "name": "param_name", "type": "string", "required": true, "default_value": null, "description": "What this param does" }
  ],
  "response_fields": ["field1", "field2"],
  "category": "finance|data|social|utility|other"
}

Rules:
- skill_name must be lowercase snake_case, max 40 chars
- api_url must be the FULL URL including protocol
- If headers include API keys, use placeholder like "{{input.api_key}}"
- For query params in GET requests, include them in parameters array, NOT in the URL
- If the page describes multiple endpoints, pick the PRIMARY one
- If you can't determine the API spec, return {"error": "Could not parse API specification from this page"}`;

export async function executeLearnSkillFromUrl(
  supabase: any,
  userId: string,
  args: any,
  toolExecutor: (toolName: string, toolArgs: any) => Promise<any>,
  aiCaller: (prompt: string, systemPrompt: string) => Promise<string>
): Promise<any> {
  const { url, custom_name } = args;

  if (!url) {
    return { error: "url is required. Provide the API documentation URL to learn from." };
  }

  // Validate URL format
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }

  console.log(`[SkillLearner] Starting skill import from: ${formattedUrl}`);

  // ═══ STEP 1: Scrape the documentation page ═══
  let pageContent: string;
  try {
    const scrapeResult = await toolExecutor("browser_scrape", {
      url: formattedUrl,
      formats: ["markdown"],
    });

    if (scrapeResult?.error) {
      return {
        error: `Failed to scrape URL: ${scrapeResult.error}`,
        suggestion: "Make sure the URL is accessible. Try a direct API documentation page.",
      };
    }

    pageContent = scrapeResult?.data?.markdown || "";
    if (!pageContent && scrapeResult?.data) {
      console.warn(`[SkillLearner] Unexpected scrape structure — keys: ${Object.keys(scrapeResult.data).join(", ")}`);
    }

    if (!pageContent || pageContent.length < 50) {
      return {
        error: "Page content is too short or empty. The URL may require authentication or be blocking scraping.",
        url: formattedUrl,
      };
    }

    // Truncate if too long (keep first 8000 chars for AI parsing)
    if (pageContent.length > 8000) {
      pageContent = pageContent.substring(0, 8000) + "\n\n[... content truncated for parsing ...]";
    }

    console.log(`[SkillLearner] Scraped ${pageContent.length} chars from ${formattedUrl}`);
  } catch (e: any) {
    return { error: `Scrape failed: ${e.message}` };
  }

  // ═══ STEP 2: AI Parse — Extract structured API spec ═══
  let apiSpec: any;
  try {
    const aiPrompt = `${EXTRACTION_PROMPT}\n\n--- PAGE CONTENT ---\n${pageContent}`;
    const aiResponse = await aiCaller(aiPrompt, "You are a precise JSON-only API documentation parser. Return ONLY valid JSON.");

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = aiResponse.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    // Also try to find raw JSON object
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }

    apiSpec = JSON.parse(jsonStr);

    if (apiSpec.error) {
      return {
        error: `AI could not parse API spec: ${apiSpec.error}`,
        suggestion: "Try providing a more specific API documentation URL with clear endpoint descriptions.",
        url: formattedUrl,
      };
    }

    if (!apiSpec.api_url || !apiSpec.skill_name) {
      return {
        error: "AI extraction incomplete — missing api_url or skill_name.",
        parsed: apiSpec,
        suggestion: "Try a different documentation page with clearer API endpoint descriptions.",
      };
    }

    console.log(`[SkillLearner] AI extracted spec: ${apiSpec.skill_name} → ${apiSpec.method} ${apiSpec.api_url}`);
  } catch (e: any) {
    return {
      error: `AI parsing failed: ${e.message}`,
      suggestion: "The page content may not contain clear API documentation.",
    };
  }

  // ═══ STEP 3: Build skill steps and create ═══
  const skillName = custom_name || apiSpec.skill_name;
  const method = (apiSpec.method || "GET").toUpperCase();
  const params = apiSpec.parameters || [];

  // Build the fetch_external_api step
  const fetchStep: any = {
    action: "fetch_external_api",
    params: {
      url: apiSpec.api_url,
      method: method,
    },
  };

  // Add headers if present
  if (apiSpec.headers && Object.keys(apiSpec.headers).length > 0) {
    fetchStep.params.headers = apiSpec.headers;
  }

  // Add parameters mapping
  if (method === "GET" && params.length > 0) {
    const queryParams: Record<string, string> = {};
    for (const p of params) {
      queryParams[p.name] = `{{input.${p.name}}}`;
    }
    fetchStep.params.query_params = queryParams;
  } else if (method === "POST" && params.length > 0) {
    // For POST, build body from input
    const body: Record<string, string> = {};
    for (const p of params) {
      body[p.name] = `{{input.${p.name}}}`;
    }
    fetchStep.params.body = body;
  }

  // Format response step
  const formatStep = {
    action: "format_response",
    params: {
      template: `✅ **${apiSpec.description || skillName}**\n\nAPI Response:\n\`\`\`json\n{{results.step_1}}\n\`\`\``,
    },
  };

  const steps = [fetchStep, formatStep];

  // Build input_schema from parsed parameters
  const inputProperties: Record<string, any> = {};
  const requiredInputs: string[] = [];
  for (const p of params) {
    inputProperties[p.name] = {
      type: p.type || "string",
      description: p.description || p.name,
    };
    if (p.default_value !== null && p.default_value !== undefined) {
      inputProperties[p.name].default = p.default_value;
    }
    if (p.required) {
      requiredInputs.push(p.name);
    }
  }

  const inputSchema = {
    type: "object",
    properties: inputProperties,
    required: requiredInputs,
  };

  // Build trigger keywords from skill name and description
  const triggerKeywords = [
    skillName.replace(/_/g, " "),
    ...(apiSpec.category ? [apiSpec.category] : []),
    ...(apiSpec.description || "").split(" ").filter((w: string) => w.length > 4).slice(0, 3),
  ];

  // Create the skill
  const createResult = await executeCreateSkill(supabase, userId, {
    skill_name: skillName,
    description: apiSpec.description || `Learned from ${formattedUrl}`,
    trigger_keywords: triggerKeywords,
    steps: steps,
    input_schema: inputSchema,
    source_url: formattedUrl,
  });

  if (createResult.error) {
    return {
      error: `Skill creation failed: ${createResult.error}`,
      parsed_spec: apiSpec,
      suggestion: "The API spec was parsed successfully but skill creation failed. Try a different skill name.",
    };
  }

  // ═══ STEP 4: Return success with test instructions ═══
  const testExample: Record<string, string> = {};
  for (const p of params) {
    testExample[p.name] = p.default_value || `<${p.name}>`;
  }

  return {
    success: true,
    skill_name: skillName,
    description: apiSpec.description,
    source_url: formattedUrl,
    api_endpoint: `${method} ${apiSpec.api_url}`,
    parameters: params.map((p: any) => `${p.name} (${p.required ? "required" : "optional"}): ${p.description || ""}`),
    steps_count: steps.length,
    input_schema: inputSchema,
    message: `🎓 Skill "${skillName}" ကို URL မှ အောင်မြင်စွာ လေ့လာပြီးပါပြီ!\n` +
      `📡 Endpoint: ${method} ${apiSpec.api_url}\n` +
      `📝 Parameters: ${params.map((p: any) => p.name).join(", ") || "none"}\n\n` +
      `🧪 Test command: execute_skill({ skill_name: "${skillName}", input: ${JSON.stringify(testExample)} })`,
    test_command: {
      tool: "execute_skill",
      args: { skill_name: skillName, input: testExample },
    },
  };
}
