// ═══ Grounding Quality Guard (extracted from orchestrator) ═══
// Verifies compiled report references key entities from specialist outputs.

const ENTITY_SYNONYMS: Record<string, string> = {
  "burma": "myanmar", "republic of the union of myanmar": "myanmar",
  "united states": "us", "united states of america": "us", "america": "us", "usa": "us",
  "united kingdom": "uk", "great britain": "uk", "england": "uk",
  "btc": "bitcoin", "eth": "ethereum", "ether": "ethereum",
  "artificial intelligence": "ai", "machine learning": "ml",
  "iot": "internet of things",
};

function normalizeEntity(entity: string): string {
  const lower = entity.toLowerCase().trim();
  return ENTITY_SYNONYMS[lower] || lower;
}

const MYANMAR_STOPWORDS = new Set([
  'သည်','များ','ကို','တွင်','နှင့်','၏','မှ','က','ပါ','ဖြစ်',
  'လည်း','ခဲ့','နိုင်','တယ်','ပြီး','ရန်','အတွက်','ဖြင့်','၍','လျှင်',
]);

export function extractKeyEntities(text: string): string[] {
  const entities = new Set<string>();

  // Capitalized multi-word phrases
  const capPhrases = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
  capPhrases.slice(0, 10).forEach(p => entities.add(normalizeEntity(p)));

  // Myanmar Unicode tokens (≥3 chars, stopword-filtered)
  const myanmarTokens = text.match(/[\u1000-\u109F\uAA60-\uAA7F]{3,}/g) || [];
  myanmarTokens.filter(t => !MYANMAR_STOPWORDS.has(t)).slice(0, 12).forEach(p => entities.add(p));

  // Myanmar multi-word phrases
  const myanmarPhrases = text.match(/[\u1000-\u109F\uAA60-\uAA7F]{2,}(?:\s+[\u1000-\u109F\uAA60-\uAA7F]{2,})+/g) || [];
  myanmarPhrases.slice(0, 6).forEach(p => entities.add(p));

  // Numbers with context
  const numbers = text.match(/\$?[\d,]+\.?\d*[%BMK]?/g) || [];
  numbers.slice(0, 8).forEach(n => { if (n.length >= 2) entities.add(n); });

  // Quoted terms
  const quoted = text.match(/"([^"]{3,40})"/g) || [];
  quoted.slice(0, 5).forEach(q => entities.add(normalizeEntity(q.replace(/"/g, ''))));

  // Bold markdown terms
  const bold = text.match(/\*\*([^*]{3,40})\*\*/g) || [];
  bold.slice(0, 8).forEach(b => entities.add(normalizeEntity(b.replace(/\*\*/g, ''))));

  return [...entities].slice(0, 20);
}

export function checkGrounding(
  finalContent: string,
  completedSteps: Array<{ title: string; result: string; agent_role: string }>,
): { grounded: boolean; missingAgents: string[] } {
  const lower = finalContent.toLowerCase();
  const missingAgents: string[] = [];

  for (const step of completedSteps) {
    if (!step.result) continue;
    const keywords = extractKeyEntities(step.result);
    if (keywords.length === 0) continue;

    const found = keywords.filter(kw => {
      const normalized = normalizeEntity(kw);
      return lower.includes(kw.toLowerCase()) || lower.includes(normalized);
    });
    const coverage = found.length / keywords.length;
    if (coverage < 0.3) {
      missingAgents.push(`${step.agent_role} (${step.title})`);
    }
  }

  const grounded = missingAgents.length <= Math.floor(completedSteps.length * 0.5);
  return { grounded, missingAgents };
}
