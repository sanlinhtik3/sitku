// ═══ Live in-DOM search highlighter ═══
// Walks text nodes inside `containerRef`, wraps every case-insensitive
// match of `query` in <mark data-search-match>. Re-runs when query or
// the rendered content changes (via dependencyKey).
//
// We hook the DOM directly instead of altering markdown rendering so
// any future change to the message renderer (code blocks, tables,
// thoughts, tool cards) keeps working — every text node gets searched.
import { useEffect } from "react";

const HIGHLIGHT_TAG = "MARK";
const MIN_QUERY_LEN = 2;

export function useSearchHighlight(
  containerRef: React.RefObject<HTMLElement>,
  query: string,
  dependencyKey: unknown,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Always tear down previous highlights first.
    unwrapHighlights(container);

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) return;

    const safe = escapeRegExp(trimmed);
    const re = new RegExp(safe, "gi");

    // TreeWalker visits every text node, skipping our own <mark> wrappers,
    // <script>/<style>, and form controls.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === HIGHLIGHT_TAG && parent.dataset.searchMatch === "true") return NodeFilter.FILTER_REJECT;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT") return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !re.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        // test() advances lastIndex on a global regex — reset per node
        re.lastIndex = 0;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const targets: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) targets.push(n as Text);

    for (const textNode of targets) {
      wrapMatchesInTextNode(textNode, re);
      re.lastIndex = 0;
    }

    return () => {
      // Cleanup on unmount or before next run
      unwrapHighlights(container);
    };
  }, [containerRef, query, dependencyKey]);
}

function wrapMatchesInTextNode(node: Text, re: RegExp): void {
  const text = node.nodeValue || "";
  const fragments: (string | { match: string })[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) fragments.push(text.slice(lastIdx, match.index));
    fragments.push({ match: match[0] });
    lastIdx = match.index + match[0].length;
    if (match[0].length === 0) re.lastIndex++; // safety against zero-width
  }
  if (lastIdx < text.length) fragments.push(text.slice(lastIdx));
  if (fragments.length <= 1) return;

  const frag = document.createDocumentFragment();
  for (const piece of fragments) {
    if (typeof piece === "string") {
      frag.appendChild(document.createTextNode(piece));
    } else {
      const mark = document.createElement("mark");
      mark.dataset.searchMatch = "true";
      mark.textContent = piece.match;
      frag.appendChild(mark);
    }
  }
  node.replaceWith(frag);
}

function unwrapHighlights(container: HTMLElement): void {
  const marks = container.querySelectorAll('mark[data-search-match="true"]');
  for (const mark of Array.from(marks)) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
