import type { GraphViewData, NoteAstIndex, SearchResult } from "@/repositories/contracts";

export interface SearchIndexSourceDoc {
  path: string;
  title: string;
  content: string;
}

export interface SearchIndexDoc extends SearchIndexSourceDoc {
  titleLower: string;
  contentLower: string;
  titleTokens: string[];
  contentTokens: string[];
  outboundLinks: string[];
  tags: string[];
  headings: { level: number; text: string }[];
  wordCount: number;
}

const WIKILINK = /\[\[([^[\]\r\n|]+)(?:\|[^[\]\r\n]*)?\]\]/g;
const TAG_REGEX = /(?:^|\s)#([a-zA-Z0-9_-]+)/g;
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;
const TOKEN_REGEX = /[\p{L}\p{M}\p{N}_-]+/gu;
const MAX_CONTENT_TOKENS = 1200;

export function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

export function tokenizeSearchText(value: string, limit = Number.MAX_SAFE_INTEGER) {
  const tokens = normalizeSearchText(value).match(TOKEN_REGEX) || [];
  return [...new Set(tokens)].slice(0, limit);
}

export function buildSearchIndex(notes: SearchIndexSourceDoc[]): SearchIndexDoc[] {
  return notes.map((note) => {
    const outboundLinks = new Set<string>();
    WIKILINK.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK.exec(note.content)) !== null) {
      const target = match[1].trim();
      if (target && target !== note.path) outboundLinks.add(target);
    }

    const tags = new Set<string>();
    TAG_REGEX.lastIndex = 0;
    while ((match = TAG_REGEX.exec(note.content)) !== null) {
      tags.add(match[1].toLowerCase());
    }

    const headings: { level: number; text: string }[] = [];
    HEADING_REGEX.lastIndex = 0;
    while ((match = HEADING_REGEX.exec(note.content)) !== null) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }

    const words = note.content.trim().split(/\s+/).filter(Boolean);
    return {
      ...note,
      titleLower: normalizeSearchText(note.title),
      contentLower: normalizeSearchText(note.content),
      titleTokens: tokenizeSearchText(note.title),
      contentTokens: tokenizeSearchText(note.content, MAX_CONTENT_TOKENS),
      outboundLinks: Array.from(outboundLinks),
      tags: Array.from(tags),
      headings,
      wordCount: words.length,
    };
  });
}

export function patchSearchIndex(
  index: SearchIndexDoc[],
  upserts: SearchIndexSourceDoc[],
  removedPaths: string[],
): SearchIndexDoc[] {
  const byPath = new Map(index.map((doc) => [doc.path, doc]));
  for (const path of removedPaths) byPath.delete(path);
  for (const doc of buildSearchIndex(upserts)) byPath.set(doc.path, doc);
  return [...byPath.values()];
}

type TokenMatch = "exact" | "prefix" | "fuzzy";

function boundedDamerauLevenshtein(left: string, right: string, maxDistance: number) {
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  const rows = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowBest = maxDistance + 1;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
      rowBest = Math.min(rowBest, rows[i][j]);
    }
    if (rowBest > maxDistance) return maxDistance + 1;
  }
  return rows[a.length][b.length];
}

function tokenMatch(queryToken: string, candidate: string): TokenMatch | null {
  if (candidate === queryToken) return "exact";
  if (candidate.startsWith(queryToken)) return "prefix";
  if (queryToken.length < 4 || candidate.length < 4) return null;
  const allowance = queryToken.length >= 8 ? 2 : 1;
  return boundedDamerauLevenshtein(queryToken, candidate, allowance) <= allowance ? "fuzzy" : null;
}

function matchTokens(queryTokens: string[], candidateTokens: string[]) {
  const matches: TokenMatch[] = [];
  for (const queryToken of queryTokens) {
    let best: TokenMatch | null = null;
    for (const candidate of candidateTokens) {
      const match = tokenMatch(queryToken, candidate);
      if (match === "exact") { best = match; break; }
      if (match === "prefix") best = match;
      else if (match === "fuzzy" && !best) best = match;
    }
    if (!best) return null;
    matches.push(best);
  }
  return matches;
}

function matchScore(matches: TokenMatch[] | null, scores: { exact: number; prefix: number; fuzzy: number }) {
  if (!matches) return 0;
  if (matches.every((match) => match === "exact")) return scores.exact;
  if (matches.every((match) => match !== "fuzzy")) return scores.prefix;
  return scores.fuzzy;
}

function firstSnippetIndex(doc: SearchIndexDoc, q: string, queryTokens: string[]) {
  const phraseIndex = doc.contentLower.indexOf(q);
  if (phraseIndex >= 0) return phraseIndex;
  for (const token of queryTokens) {
    const index = doc.contentLower.indexOf(token);
    if (index >= 0) return index;
  }
  return 0;
}

export function querySearchIndex(index: SearchIndexDoc[], query: string, limit: number): SearchResult[] {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const queryTokens = tokenizeSearchText(q).slice(0, 6);
  if (!queryTokens.length) return [];

  const results: SearchResult[] = [];
  for (const doc of index) {
    const titlePhrase = doc.titleLower === q ? 140 : doc.titleLower.startsWith(q) ? 125 : doc.titleLower.includes(q) ? 110 : 0;
    const titleTokenScore = matchScore(matchTokens(queryTokens, doc.titleTokens), { exact: 120, prefix: 105, fuzzy: 82 });
    const contentPhrase = doc.contentLower.includes(q) ? 72 : 0;
    const contentTokenScore = matchScore(matchTokens(queryTokens, doc.contentTokens), { exact: 64, prefix: 52, fuzzy: 34 });
    const noteScore = Math.max(titlePhrase, titleTokenScore, contentPhrase, contentTokenScore);
    if (noteScore > 0) {
      const start = Math.max(0, firstSnippetIndex(doc, q, queryTokens) - 40);
      results.push({
        id: `note:${doc.path}`,
        source: "note",
        title: doc.title,
        path: doc.path,
        snippet: doc.content.slice(start, start + 180),
        score: noteScore,
        metadata: { kind: "note", match: titlePhrase >= noteScore ? "title" : contentPhrase >= noteScore ? "phrase" : noteScore === titleTokenScore ? "title-token" : "content-token" },
      });
    }

    for (const [indexInDoc, heading] of doc.headings.entries()) {
      const headingLower = normalizeSearchText(heading.text);
      const phraseScore = headingLower === q ? 115 : headingLower.startsWith(q) ? 102 : headingLower.includes(q) ? 92 : 0;
      const tokenScore = matchScore(matchTokens(queryTokens, tokenizeSearchText(heading.text)), { exact: 98, prefix: 88, fuzzy: 70 });
      const score = Math.max(phraseScore, tokenScore);
      if (!score) continue;
      results.push({
        id: `heading:${doc.path}:${indexInDoc}`,
        source: "heading",
        title: heading.text,
        path: doc.path,
        snippet: `${doc.title} / H${heading.level}`,
        score,
        metadata: { kind: "heading", headingLevel: heading.level, noteTitle: doc.title, match: phraseScore >= tokenScore ? "phrase" : "token" },
      });
    }

    for (const tag of doc.tags) {
      const tagQuery = q.replace(/^#/, "");
      const phraseScore = tag === tagQuery ? 108 : tag.startsWith(tagQuery) ? 96 : tag.includes(tagQuery) ? 84 : 0;
      const tokenScore = matchScore(matchTokens(tokenizeSearchText(tagQuery), [tag]), { exact: 104, prefix: 92, fuzzy: 66 });
      const score = Math.max(phraseScore, tokenScore);
      if (!score) continue;
      results.push({
        id: `tag:${doc.path}:${tag}`,
        source: "tag",
        title: `#${tag}`,
        path: doc.path,
        snippet: doc.title,
        score,
        metadata: { kind: "tag", tag, noteTitle: doc.title, match: phraseScore >= tokenScore ? "phrase" : "token" },
      });
    }
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return results.slice(0, limit);
}

export function getNoteAstFromIndex(index: SearchIndexDoc[], path: string): NoteAstIndex | null {
  const doc = index.find((item) => item.path === path);
  if (!doc) return null;
  return {
    outboundLinks: doc.outboundLinks,
    backlinks: index.filter((item) => item.outboundLinks.includes(path)).map((item) => item.path),
    tags: doc.tags,
    headings: doc.headings.map(({ level, text }) => ({ level, text })),
    wordCount: doc.wordCount,
  };
}

export function getGraphDataFromIndex(index: SearchIndexDoc[]): GraphViewData {
  const nodes = index.map((doc) => ({ id: doc.path, title: doc.title || doc.path, degree: 0 }));
  const links: { source: string; target: string }[] = [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (const doc of index) {
    for (const target of doc.outboundLinks) {
      if (!nodeMap.has(target)) continue;
      links.push({ source: doc.path, target });
      const source = nodeMap.get(doc.path);
      const destination = nodeMap.get(target);
      if (source) source.degree += 1;
      if (destination) destination.degree += 1;
    }
  }
  return { nodes, links };
}

export function getAllTagsFromIndex(index: SearchIndexDoc[]): Record<string, number> {
  const tagCounts: Record<string, number> = {};
  for (const doc of index) {
    for (const tag of doc.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  return tagCounts;
}
