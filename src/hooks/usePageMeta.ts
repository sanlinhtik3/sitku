import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const BASE_URL = "https://zoecrypto.com";
const SUPABASE_URL = "https://ixtcytrohsuapazvockm.supabase.co";
const DEFAULT_TITLE = "ZOE CRYPTO – Free Crypto Education & AI Tools | Myanmar";
const DEFAULT_DESCRIPTION =
  "Myanmar's #1 free crypto education platform. Learn Bitcoin, Blockchain, Trading (မြန်မာ Crypto သင်တန်း). AI-powered content tools for modern creators.";

export function buildOgImageUrl(title: string, author?: string, type?: string): string {
  const params = new URLSearchParams({ title });
  if (author) params.set("author", author);
  if (type) params.set("type", type);
  return `${SUPABASE_URL}/functions/v1/og-image?${params.toString()}`;
}
const DEFAULT_OG_IMAGE =
  "https://storage.googleapis.com/gpt-engineer-file-uploads/56gIRtNnbycVbtO7mlSkwA164w73/social-images/social-1765193984612-zoecrypto.png";

interface PageMeta {
  title?: string;
  description?: string;
  ogImage?: string;
  ogType?: string;
  noIndex?: boolean;
}

function setMetaTag(property: string, content: string, isName = false) {
  const attr = isName ? "name" : "property";
  let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(url: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

export function usePageMeta(meta: PageMeta = {}) {
  const location = useLocation();

  useEffect(() => {
    const title = meta.title || DEFAULT_TITLE;
    const description = meta.description || DEFAULT_DESCRIPTION;
    const ogImage = meta.ogImage || DEFAULT_OG_IMAGE;
    const ogType = meta.ogType || "website";
    const canonicalUrl = `${BASE_URL}${location.pathname}`;

    // Title
    document.title = title;

    // Standard meta
    setMetaTag("description", description, true);

    // Canonical
    setCanonical(canonicalUrl);

    // Open Graph
    setMetaTag("og:title", title);
    setMetaTag("og:description", description);
    setMetaTag("og:url", canonicalUrl);
    setMetaTag("og:image", ogImage);
    setMetaTag("og:type", ogType);

    // Twitter
    setMetaTag("twitter:title", title);
    setMetaTag("twitter:description", description);
    setMetaTag("twitter:image", ogImage);

    // noindex
    if (meta.noIndex) {
      setMetaTag("robots", "noindex, nofollow", true);
    } else {
      const robotsTag = document.querySelector('meta[name="robots"]');
      if (robotsTag) robotsTag.remove();
    }
  }, [meta.title, meta.description, meta.ogImage, meta.ogType, meta.noIndex, location.pathname]);
}
