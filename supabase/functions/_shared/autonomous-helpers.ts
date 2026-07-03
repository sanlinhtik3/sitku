// ═══ Autonomous Mode Helpers — Deduplicated from agent-chat/index.ts ═══

export interface ProvisionalStep {
  id: string;
  title: string;
  description: string;
  tool: string;
  status: string;
}

export function buildProvisionalPlan(isBurmese: boolean): ProvisionalStep[] {
  return [
    { id: "step_0", title: isBurmese ? "အစီအစဉ် ရေးဆွဲနေတယ်..." : "Planning strategy...", description: "Analyzing complexity", tool: "planning", status: "running" },
    { id: "step_1", title: isBurmese ? "သတင်းအချက်အလက် ရှာဖွေနေတယ်..." : "Researching...", description: "Gathering data", tool: "search_web", status: "pending" },
    { id: "step_2", title: isBurmese ? "ခွဲခြမ်းစိတ်ဖြာနေတယ်..." : "Analyzing...", description: "Analysis", tool: "analyze_data", status: "pending" },
    { id: "step_3", title: isBurmese ? "အစီရင်ခံစာ ပြုစုနေတယ်..." : "Compiling...", description: "Final report", tool: "compile_report", status: "pending" },
  ];
}

export interface TriggerAutonomousParams {
  supabase: any;
  userId: string;
  sessionId: string;
  sanitizedMessage: string;
  isBurmese: boolean;
  estimatedMinutes: number;
  api_source_preference: string;
  preferred_model: string | null;
}

export async function createAutonomousTask(params: TriggerAutonomousParams): Promise<{ taskId: string } | null> {
  const { supabase, userId, sessionId, sanitizedMessage, isBurmese, estimatedMinutes, api_source_preference, preferred_model } = params;
  const plan = buildProvisionalPlan(isBurmese);

  const { data: task, error } = await supabase
    .from("autonomous_tasks")
    .insert({
      user_id: userId, session_id: sessionId, original_prompt: sanitizedMessage,
      status: "planning", plan, current_step: 0, total_steps: plan.length, progress_pct: 2,
      metadata: { phase: "planning", currentStepTitle: plan[0].title, seeded: true },
    })
    .select("id")
    .single();

  if (error || !task?.id) return null;

  // Insert ack message
  await supabase.from("agent_chat_messages").insert({
    session_id: sessionId, user_id: userId, role: "assistant",
    content: isBurmese
      ? `🐝 ခဏလေးစောင့်နော်... ဒီအလုပ်ကို Autonomous Mode နဲ့ အစအဆုံး လုပ်ဆောင်ပေးပါမည်။\n\n⏱️ ခန့်မှန်းချိန်: ~${estimatedMinutes} မိနစ်\n📋 လုပ်ဆောင်မှုကို အောက်မှာ live ကြည့်နိုင်ပါတယ်။`
      : `🐝 Working on this in Autonomous Mode (~${estimatedMinutes} min). Track progress below.`,
  });

  // Fire orchestrator (fire and forget)
  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/beebot-orchestrator`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ prompt: sanitizedMessage, sessionId, userId, taskId: task.id, api_source_preference, preferred_model }),
  }).catch(err => console.error("[Autonomous] Fire-and-forget error:", err));

  return { taskId: task.id };
}
