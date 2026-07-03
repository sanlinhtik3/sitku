export interface TaskTemplate {
  id: string;
  name: string;
  prompt: string;
  schedule_type: "daily" | "weekly" | "hourly" | "monthly";
  hour: number;
  minute: number;
  day_of_week?: number;
  day_of_month?: number;
  priority: string;
  icon: string;
  category: string;
  description: string;
  delivery_target?: "in_app" | "telegram";
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "daily_finance_summary",
    name: "Daily Finance Summary",
    prompt: "Summarize today's income and expenses from FlowState. Include total balance, top spending categories, and any unusual transactions. Send a notification with the report.",
    schedule_type: "daily",
    hour: 20,
    minute: 0,
    priority: "normal",
    icon: "💰",
    category: "Finance",
    description: "Get an evening summary of your daily finances",
  },
  {
    id: "morning_briefing",
    name: "Morning Briefing",
    prompt: "Give me a morning briefing: check my notifications, summarize pending workspace tasks, show my credit balance, and list any upcoming deadlines this week.",
    schedule_type: "daily",
    hour: 7,
    minute: 30,
    priority: "normal",
    icon: "☀️",
    category: "Productivity",
    description: "Start your day with a personalized briefing",
  },
  {
    id: "weekly_task_report",
    name: "Weekly Task Report",
    prompt: "Generate a weekly report of my workspace tasks: completed vs pending tasks, team leaderboard standings, and productivity insights for the past 7 days.",
    schedule_type: "weekly",
    hour: 18,
    minute: 0,
    day_of_week: 5,
    priority: "normal",
    icon: "📊",
    category: "Productivity",
    description: "Friday evening productivity recap",
  },
  {
    id: "content_research",
    name: "Content Research Pipeline",
    prompt: "Search the web for trending topics in AI and technology. Find the top 3 stories, summarize them, and save as AI content for me to review and repurpose later.",
    schedule_type: "daily",
    hour: 10,
    minute: 0,
    priority: "normal",
    icon: "🔬",
    category: "Content",
    description: "Auto-research trending topics daily",
  },
  {
    id: "expense_tracker",
    name: "Monthly Expense Analysis",
    prompt: "Analyze my monthly spending patterns from FlowState. Break down expenses by category, compare with the previous month, identify areas where I can save, and provide actionable budgeting tips.",
    schedule_type: "monthly",
    hour: 9,
    minute: 0,
    day_of_month: 1,
    priority: "high",
    icon: "📈",
    category: "Finance",
    description: "First of month deep expense analysis",
  },
  {
    id: "custom_newsletter",
    name: "Custom Newsletter",
    prompt: "Create a personalized newsletter: search the web for the latest news in cryptocurrency and fintech, summarize the top 5 stories with key takeaways, and format as a readable digest.",
    schedule_type: "weekly",
    hour: 8,
    minute: 0,
    day_of_week: 1,
    priority: "normal",
    icon: "📰",
    category: "Content",
    description: "Monday morning curated news digest",
  },
  // ═══ Telegram Channel Templates ═══
  {
    id: "telegram_ai_news",
    name: "Daily AI News → Telegram",
    prompt: "Search the web for today's top 5 AI and technology news stories. Summarize each with key insights, format beautifully with emojis and headers, and post to my Telegram channel.",
    schedule_type: "daily",
    hour: 9,
    minute: 0,
    priority: "normal",
    icon: "🤖",
    category: "Telegram",
    description: "Post daily AI news digest to your Telegram channel",
    delivery_target: "telegram",
  },
  {
    id: "telegram_crypto_update",
    name: "Crypto Market Update → Telegram",
    prompt: "Check the latest cryptocurrency prices and market trends for BTC, ETH, and top movers. Create a concise market update with price changes, sentiment analysis, and notable events. Post to my Telegram channel.",
    schedule_type: "daily",
    hour: 8,
    minute: 0,
    priority: "normal",
    icon: "📉",
    category: "Telegram",
    description: "Daily crypto market briefing on Telegram",
    delivery_target: "telegram",
  },
  {
    id: "telegram_weekly_digest",
    name: "Weekly Tech Digest → Telegram",
    prompt: "Compile the week's most important technology and startup stories. Include funding rounds, product launches, and industry shifts. Format as a comprehensive weekly digest and post to my Telegram channel.",
    schedule_type: "weekly",
    hour: 10,
    minute: 0,
    day_of_week: 0,
    priority: "normal",
    icon: "📡",
    category: "Telegram",
    description: "Sunday morning weekly tech roundup on Telegram",
    delivery_target: "telegram",
  },
];
