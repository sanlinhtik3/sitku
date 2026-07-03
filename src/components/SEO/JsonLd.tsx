import { useEffect } from "react";

interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(data);
    script.setAttribute("data-seo-jsonld", "true");
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [data]);

  return null;
}

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Sitku",
  url: "https://sitku.space",
  logo: "https://sitku.space/pwa-192x192.png",
  description:
    "Sitku is a focused AI agent workspace for chat, tools, memory, automations, and local-first note workflows.",
  sameAs: [],
  areaServed: {
    "@type": "Country",
    name: "Myanmar",
    alternateName: "Burma",
  },
  knowsLanguage: ["en", "my"],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Sitku",
  url: "https://sitku.space",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://sitku.space/learn?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export function buildCourseSchema(course: {
  title: string;
  description: string;
  slug: string;
  thumbnail_url?: string;
  instructor_name?: string;
  is_free?: boolean;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description,
    url: `https://sitku.space/course/${course.slug}`,
    image: course.thumbnail_url,
    provider: {
      "@type": "Organization",
      name: "Sitku",
      url: "https://sitku.space",
    },
    instructor: course.instructor_name
      ? { "@type": "Person", name: course.instructor_name }
      : undefined,
    inLanguage: "my",
    isAccessibleForFree: course.is_free ?? true,
    offers: {
      "@type": "Offer",
      price: course.is_free ? "0" : undefined,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };
}

export function buildArticleSchema(post: {
  title: string;
  slug: string;
  summary?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  created_at: string;
  author_name?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    url: `https://sitku.space/post/${post.slug}`,
    image: post.thumbnail_url || undefined,
    datePublished: post.published_at || post.created_at,
    description: post.summary || undefined,
    author: {
      "@type": post.author_name ? "Person" : "Organization",
      name: post.author_name || "Sitku",
    },
    publisher: {
      "@type": "Organization",
      name: "Sitku",
      logo: {
        "@type": "ImageObject",
        url: "https://sitku.space/pwa-192x192.png",
      },
    },
  };
}
