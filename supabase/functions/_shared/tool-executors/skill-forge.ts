
// ═══ Project Phoenix: _shared/tool-executors/skill-forge.ts ═══
// Autonomous Skill Forge — AI researches, writes code, creates & tests skills
// Enables BeeBot to build custom skills from scratch with code authoring

import { executeCreateSkill, executeExecuteSkill, MAX_CODE_LENGTH } from "./skills.ts";

const MAX_RESEARCH_LENGTH = 8000;

// ═══ FORGE SKILL — AUTONOMOUS BUILDER ═══
export async function executeForgeSkill(
  supabase: any,
  userId: string,
  args: any,
  toolExecutor: (toolName: string, toolArgs: any) => Promise<any>,
  aiCaller: (prompt: string, systemPrompt: string) => Promise<string>
): Promise<any> {
  const { goal, source_url, api_key_name, test_input } = args;

  if (!goal) {
    return { error: "goal is required — describe what the skill should do." };
  }

  console.log(`[SkillForge] Starting autonomous skill creation: "${goal}"`);
  const startTime = Date.now();

  // Step 1: Research (if source_url provided, scrape it)
  let researchContext = "";
  if (source_url) {
    console.log(`[SkillForge] Researching: ${source_url}`);
    try {
      const scrapeResult = await toolExecutor("browser_scrape", {
        url: source_url,
        formats: ["markdown"],
      });
      if (scrapeResult?.data?.markdown) {
        researchContext = scrapeResult.data.markdown.slice(0, MAX_RESEARCH_LENGTH);
        console.log(`[SkillForge] Scraped ${researchContext.length} chars from URL`);
      } else if (scrapeResult?.error) {
        console.warn(`[SkillForge] Scrape failed: ${scrapeResult.error}`);
      }
    } catch (e: any) {
      console.warn(`[SkillForge] Research error: ${e.message}`);
    }
  }

  // Step 2: AI generates skill definition with code
  const systemPrompt = `You are an expert skill architect for BeeBot AI.
Your task is to create a functional skill definition with executable code.

AVAILABLE STEP ACTIONS:
- fetch_external_api: Call external APIs { method, url, headers, body, query_params }
- run_code: Execute JavaScript code in sandbox { code } - has access to 'input' and 'results' objects
- search_web: Search the web { query }
- search_knowledge_base: Search KB { query, category }
- format_response: Format final output { template }
- set_variable: Set a variable { name, value }
- conditional: Skip if condition false { condition }

TEMPLATE VARIABLES:
- {{input.fieldName}} — user-provided input
- {{results.step_N.fieldName}} — result from step N

RUN_CODE SANDBOX:
- Access: input, results (from previous steps), JSON, Math, Date, String, Array
- NO access to: fetch, Deno, eval, import, require
- Max 4000 chars, 500ms timeout
- Must return a value (object or primitive)

${api_key_name ? `API KEY: User has stored key "${api_key_name}" — include in headers as Bearer token or appropriate auth.` : ""}

RESPOND WITH VALID JSON ONLY (no markdown):
{
  "skill_name": "snake_case_name",
  "description": "What this skill does",
  "trigger_keywords": ["keyword1", "keyword2"],
  "input_schema": {
    "properties": {
      "param1": { "type": "string", "description": "..." }
    },
    "required": ["param1"]
  },
  "steps": [
    { "action": "fetch_external_api", "params": { "method": "GET", "url": "...", "headers": {...}, "query_params": {...} } },
    { "action": "run_code", "params": { "code": "const data = results.step_1; return { processed: data.value };" } },
    { "action": "format_response", "params": { "template": "Result: {{results.step_2.processed}}" } }
  ]
}`;

  const userPrompt = `Create a skill for: "${goal}"

${researchContext ? `RESEARCH CONTEXT (from ${source_url}):\n${researchContext}\n\n` : ""}
Design a robust skill with proper error handling in the run_code steps.
If the goal involves an external API, use fetch_external_api for the HTTP call, then run_code to process/transform the response.`;

  let skillDef: any;
  try {
    console.log(`[SkillForge] Calling AI for skill generation...`);
    const aiResponse = await aiCaller(userPrompt, systemPrompt);
    
    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = aiResponse.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    skillDef = JSON.parse(jsonStr);
    console.log(`[SkillForge] AI generated skill: ${skillDef.skill_name}`);
  } catch (e: any) {
    return {
      error: `AI skill generation failed: ${e.message}`,
      suggestion: "Try providing more specific goal or a source_url with documentation.",
    };
  }

  // Step 3: Validate code syntax in run_code steps
  const steps = skillDef.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.action === "run_code" && step.params?.code) {
      const code = step.params.code;
      if (code.length > MAX_CODE_LENGTH) {
        return {
          error: `Step ${i + 1} code exceeds max length (${MAX_CODE_LENGTH} chars)`,
          code_length: code.length,
        };
      }
      // Syntax validation
      try {
        new Function("input", "results", code);
      } catch (syntaxErr: any) {
        return {
          error: `Step ${i + 1} has invalid JavaScript: ${syntaxErr.message}`,
          code_preview: code.slice(0, 200),
        };
      }
    }
  }

  // Step 4: Create the skill
  const createResult = await executeCreateSkill(supabase, userId, {
    skill_name: skillDef.skill_name,
    description: skillDef.description,
    trigger_keywords: skillDef.trigger_keywords || [],
    steps: skillDef.steps,
    input_schema: skillDef.input_schema || {},
    source_url: source_url || null,
  });

  if (createResult.error) {
    return {
      error: `Skill creation failed: ${createResult.error}`,
      generated_skill: skillDef,
    };
  }

  // Step 5: Auto-test if test_input provided
  let testResult: any = null;
  if (test_input) {
    console.log(`[SkillForge] Auto-testing skill with input:`, test_input);
    try {
      testResult = await executeExecuteSkill(supabase, userId, {
        skill_name: skillDef.skill_name,
        input: test_input,
      }, toolExecutor);
    } catch (e: any) {
      testResult = { error: e.message, note: "Skill created but test failed" };
    }
  }

  const duration = Date.now() - startTime;

  return {
    success: true,
    skill_name: skillDef.skill_name,
    description: skillDef.description,
    steps_count: steps.length,
    input_schema: skillDef.input_schema,
    trigger_keywords: skillDef.trigger_keywords,
    research_used: !!researchContext,
    test_result: testResult,
    duration_ms: duration,
    message: `🔧 Skill "${skillDef.skill_name}" forged successfully with ${steps.length} steps! ${testResult ? (testResult.error ? "⚠️ Test had issues." : "✅ Test passed!") : "Use execute_skill to test it."}`,
    usage_example: `execute_skill({ skill_name: "${skillDef.skill_name}", input: ${JSON.stringify(Object.fromEntries((Object.keys(skillDef.input_schema?.properties || {})).map(k => [k, "<value>"])))} })`,
  };
}
