/**
 * Resolve a favicon URL for a given site URL.
 *
 * Uses Google's public favicon service which is fast, cached worldwide, and
 * supports any domain without us needing to scrape `<link rel="icon">`.
 * Returns `null` for invalid or local URLs.
 */
export function getFaviconUrl(url: string, size = 32): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname || u.hostname === "localhost") return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=${size}`;
  } catch {
    return null;
  }
}

/** Extract a display hostname (without protocol or trailing slash) for citation chips. */
export function getDisplayHostname(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
