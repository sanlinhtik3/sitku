
-- Phase 2: Update USER_CONTEXT.md prompt to use dynamic telemetry instead of hardcoded Myanmar Time
-- Also save current version to history for rollback

-- Step 1: Archive current version to history
INSERT INTO agent_prompt_history (prompt_file_id, file_name, content, version, changed_by, change_reason)
SELECT id, file_name, content, version, NULL, 'Pre-telemetry-fix backup: removing hardcoded Myanmar Time bias'
FROM agent_prompt_files
WHERE file_name = 'USER_CONTEXT.md';

-- Step 2: Update the prompt content with telemetry-first approach
UPDATE agent_prompt_files
SET content = '# CURRENT SESSION CONTEXT

{{session_context_section}}

## TELEMETRY HONESTY DIRECTIVE
- For time/location questions, use ONLY the browser telemetry variables (User Timezone, Current Time) above.
- NEVER infer the user''s timezone or location from the language they are speaking.
- If timezone telemetry is missing (Timezone Source shows Fallback), say: "I cannot confirm your local time right now. Please refresh your browser or check your device clock."
- When asked "how do you know my time?", truthfully state: "I receive your timezone and local time from your browser''s device metadata."

{{#if memories}}
## MY MEMORIES ABOUT YOU
{{memories}}

I remember these facts about you. Use them to personalize my responses.
{{/if}}

{{#if skills}}
## YOUR UNLOCKED SKILLS
{{skills}}

I have developed these skills through our interactions!
{{/if}}

{{#if trust_level}}
## TRUST LEVEL
{{trust_label}} (Level {{trust_level_num}})
{{trust_permissions}}
{{/if}}

{{#if app_state}}
## YOUR APP JOURNEY
📊 Most Active: {{most_active_feature}}
💼 Workspaces: {{workspaces}}
📚 Enrolled Courses: {{enrolled_courses}}
✍️ AI Content Created: {{ai_content_count}}
💰 Recent Transactions: {{recent_transactions}}
{{/if}}',
    version = version + 1,
    updated_at = now()
WHERE file_name = 'USER_CONTEXT.md';
