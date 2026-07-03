// Web ↔ Telegram parity test.
//
// Both channels render the same canonical assistant message stored in
// `agent_chat_messages`. Web shows the sanitized DB text directly (markdown
// rendered client-side). Telegram passes the same sanitized text through
// `formatForMarkdownV2` before sending. The parity invariant: stripping the
// Telegram-applied formatting must yield the same plain text the web channel
// delivers — i.e. given an identical prompt → identical canonical row →
// identical user-visible text on both surfaces.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatForMarkdownV2,
  stripAllMarkdown,
} from "../_shared/telegram-markdown.ts";
import { sanitizeUserVisibleText } from "../_shared/sanitizer.ts";

// Normalize whitespace so trailing-newline / blank-line differences introduced
// by markdown serialization don't create false negatives. Semantic content
// (words, punctuation, ordering) must be byte-identical.
function normalize(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// What the web surface delivers, in plain-text form: the sanitized DB row
// with markdown stripped (the browser renders **bold** as visually bold; the
// user reads the words, not the asterisks). Comparing plain text on both
// sides is the only fair parity check because Telegram MarkdownV2 escapes
// punctuation and rewrites links into a different surface form.
function deliverWebPlain(canonical: string): string {
  return stripAllMarkdown(sanitizeUserVisibleText(canonical));
}

// What the Telegram surface delivers, in plain-text form: the same sanitized
// row run through Telegram's MarkdownV2 formatter, then stripped of all
// markdown so we compare semantic content (Telegram clients render the
// formatting; users read the same words).
function deliverTelegramPlain(canonical: string): string {
  const sanitized = sanitizeUserVisibleText(canonical);
  const formatted = formatForMarkdownV2(sanitized);
  return stripAllMarkdown(formatted);
}

const PROMPTS: Array<{ name: string; canonical: string }> = [
  {
    name: "plain text reply",
    canonical: "Hello! Your balance is 50 credits.",
  },
  {
    name: "bold + italic markdown",
    canonical: "Here is **bold** and _italic_ for emphasis.",
  },
  {
    name: "Myanmar text with bold",
    canonical: "မင်္ဂလာပါ။ **ယနေ့** အသုံးစရိတ် ၁၂,၀၀၀ ကျပ် ဖြစ်ပါတယ်။",
  },
  {
    name: "list with inline code",
    canonical:
      "Steps:\n- Run `npm test`\n- Check the `agent_chat_messages` table\n- Done.",
  },
  {
    name: "with thinking block (must be stripped on both)",
    canonical:
      "<thinking>internal plan</thinking>The answer is **42**.",
  },
  {
    name: "link rendering",
    canonical: "See the [docs](https://example.com) for more info.",
  },
];

for (const { name, canonical } of PROMPTS) {
  Deno.test(`parity: ${name}`, () => {
    const web = normalize(deliverWebPlain(canonical));
    const tg = normalize(deliverTelegramPlain(canonical));
    assertEquals(
      tg,
      web,
      `Telegram delivered text must match web delivered text exactly.\n` +
        `--- WEB ---\n${web}\n--- TELEGRAM ---\n${tg}\n`,
    );
  });
}

// Extra guard: identical prompt → identical canonical row assumption.
// If two callers (web + telegram) read the same row id, they MUST observe the
// same string; this asserts the read path applies no channel-specific mutation
// beyond the formatter handled above.
Deno.test("parity: identical canonical row yields identical sanitized text", () => {
  const canonical =
    "Daily summary:\n- Income: **1,000**\n- Expense: **400**\nNet: **600**";
  const web1 = deliverWebPlain(canonical);
  const web2 = deliverWebPlain(canonical);
  assertEquals(web1, web2, "sanitizer must be deterministic");

  const tg1 = normalize(deliverTelegramPlain(canonical));
  const tg2 = normalize(deliverTelegramPlain(canonical));
  assertEquals(tg1, tg2, "telegram formatter must be deterministic");
  assertEquals(tg1, normalize(web1), "channels must agree on the same row");
});
