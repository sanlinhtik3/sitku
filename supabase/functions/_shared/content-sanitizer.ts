// ═══ Shared Content Sanitizer for Channel Posts ═══
// Single source of truth for ghost-writer, meta-narration, and markdown stripping.

export function sanitizeForChannel(content: string, _isBurmese = true): string {
  let c = content;

  // Strip meta-commentary intro paragraph (references to Agent/compilation process)
  c = c
    .replace(/^[^\n]{0,300}(?:Writer|Researcher|Analyst|QC|Specialist)\s*Agent[^\n]*\n+/gi, '')
    .replace(/^[^\n]{0,300}(?:အချက်အလက်တွေကိုပါ\s*ထည့်သွင်းပြီး|ပြန်လည်ပြင်ဆင်ထားတဲ့\s*Content|Content\s*ကို\s*အောက်မှာ\s*ကြည့်ပေးပါ|အောက်မှာ\s*ကြည့်ပေးပါ)[^\n]*\n+/gi, '')
    .replace(/^[^\n]{0,300}(?:Research\s*လုပ်ပြီး|စုစည်းတင်ပြ|ပြန်လည်ပြင်ဆင်)[^\n]*\n+/gi, '');

  // Strip agent/process references anywhere
  c = c
    .replace(/(Writer|Researcher|Analyst|QC|Specialist)\s*Agent\s*တွေ(ရဲ့)?/gi, '')
    .replace(/Agent\s*တွေ(ရဲ့)?\s*(?:အချက်အလက်|findings|research|data)/gi, '')
    .replace(/(?:Content|အကြောင်းအရာ)\s*ကို\s*အောက်မှာ\s*ကြည့်ပေးပါ[ဗျ။]*\s*/gi, '')
    .replace(/ပြန်လည်ပြင်ဆင်ထားတဲ့\s*Content/gi, '');

  // Ghost-writer + markdown sanitizer
  c = c
    .replace(/\bKo\s*Zoe\b/gi, 'မိတ်ဆွေတို့')
    .replace(/မင်္ဂလာပါ\s+[^\n]{0,40}ရေ[.!…၊]?/g, 'မိတ်ဆွေတို့ရေ')
    .replace(/(?:ဒီနေ့တော့\s*)?(?:ကျွန်တော်|ကျွန်မ|ငါ)\s+[^\n]{0,140}?(?:လုပ်ပေးလိုက်ပါတယ်|briefing\s*လေး\s*လုပ်ပေးလိုက်ပါတယ်|research\s*လုပ်ပေးထားပါတယ်)/gi, '')
    .replace(/^#{1,6}\s+(.+)$/gm, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/```[\s\S]*?```/g, (m) => m.slice(3, -3).trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n');

  // Delivery-awareness sanitizer
  c = c
    .replace(/\n+[^\n]{0,200}(?:Telegram\s*Channel\s*မှာ\s*(?:တင်|post|share)|တင်နိုင်အောင်\s*စီစဉ်|ပို့ပေးထားပါ|share\s*လုပ်ပေးထားပါ|စီစဉ်ပေးထားပါ)[^\n]*$/gi, '')
    .replace(/\n+[^\n]{0,200}(?:အထက်ပါ\s*Content|အထက်က\s*Content|ဒီ\s*Content)\s*ကို[^\n]*(?:တင်|ပို့|post|share|စီစဉ်)[^\n]*$/gi, '')
    .replace(/\n+[^\n]{0,200}(?:Content\s*ကို\s*(?:တင်|ပို့)ပေးထားပါ|Channel\s*မှာ\s*(?:post|share|တင်)\s*(?:လုပ်)?ပေး)[^\n]*$/gi, '')
    .trim();

  // Agent role emoji labels from heartbeat
  c = c
    .replace(/🔍\s*Research\s*Agent\s*[—–-]\s*/gi, '')
    .replace(/✍️\s*Writer?\s*Agent\s*[—–-]\s*/gi, '')
    .replace(/📝\s*Editor?\s*Agent\s*[—–-]\s*/gi, '')
    .replace(/🧠\s*Analyst?\s*Agent\s*[—–-]\s*/gi, '')
    .replace(/🎯\s*Strateg(?:ist|y)\s*Agent\s*[—–-]\s*/gi, '')
    .replace(/👥\s*Community\s*Agent\s*[—–-]\s*/gi, '')
    .replace(/\[?(Research|Compile|Analyze|Synthesize|Draft|Edit)\]?\s*[—–-]\s*/gi, '')
    .replace(/\*\*Agent\s+\w+\*\*:?\s*/gi, '')
    .replace(/^[\s\n]*---[\s\n]*/gm, '')
    .trim();

  return c;
}
