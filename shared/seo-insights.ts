/**
 * @fileoverview SEO Insights — advisory, non-scoring checks for developers.
 * These surface useful SEO signals that don't affect the meta tag quality score.
 *
 * @module shared/seo-insights
 */

import type { MetaTags, SeoInsightCheck, SeoInsightsResult } from "./types";

/** Known valid Open Graph types per the OGP spec. */
const VALID_OG_TYPES = new Set([
  "website",
  "article",
  "book",
  "profile",
  "music.song",
  "music.album",
  "music.playlist",
  "music.radio_station",
  "video.movie",
  "video.episode",
  "video.tv_show",
  "video.other",
  "product",
  "place",
  "business.business",
  "restaurant.restaurant",
]);

interface SeoInsightsOptions {
  /** True when analyzing from URL fetch mode (H1 detection is limited to head snippet). */
  urlMode?: boolean;
}

// ---------------------------------------------------------------------------
// Individual check functions
// ---------------------------------------------------------------------------

function checkCharset(tags: MetaTags): SeoInsightCheck {
  const charset = tags.seoInsights.charset;
  if (charset) {
    const isUtf8 = charset.toLowerCase().replace("-", "") === "utf8";
    return {
      id: "charset",
      label: "Character Encoding",
      status: isUtf8 ? "pass" : "warn",
      message: isUtf8
        ? `UTF-8 charset declared.`
        : `Charset is "${charset}" — UTF-8 is strongly recommended for modern web pages.`,
      detail: `<meta charset="${charset}">`,
      suggestion: isUtf8
        ? undefined
        : 'Add <meta charset="UTF-8"> as the first element in <head> to prevent rendering issues in search results.',
    };
  }
  return {
    id: "charset",
    label: "Character Encoding",
    status: "warn",
    message: "No charset declaration found.",
    suggestion:
      'Add <meta charset="UTF-8"> as the first element in <head>. Missing charset can cause garbled text in search result snippets.',
  };
}

function checkFavicon(tags: MetaTags): SeoInsightCheck {
  if (tags.favicon) {
    return {
      id: "favicon",
      label: "Favicon",
      status: "pass",
      message: "Favicon is declared.",
      detail: `<link rel="icon" href="${tags.favicon}">`,
    };
  }
  return {
    id: "favicon",
    label: "Favicon",
    status: "warn",
    message: "No favicon link tag found.",
    suggestion:
      "Add a <link rel=\"icon\"> tag. Favicons appear in browser tabs, bookmarks, and Google search results — they improve trust and brand recognition.",
  };
}

function checkViewport(tags: MetaTags): SeoInsightCheck {
  if (tags.viewport) {
    return {
      id: "viewport",
      label: "Viewport Meta",
      status: "pass",
      message: "Viewport meta tag is configured.",
      detail: `<meta name="viewport" content="${tags.viewport}">`,
    };
  }
  return {
    id: "viewport",
    label: "Viewport Meta",
    status: "warn",
    message: "No viewport meta tag found.",
    suggestion:
      'Add <meta name="viewport" content="width=device-width, initial-scale=1">. Google uses mobile-first indexing — without viewport, your page may render poorly on mobile and rank lower.',
  };
}

function checkOgType(tags: MetaTags): SeoInsightCheck {
  const ogType = tags.og.type;
  if (ogType) {
    const isValid = VALID_OG_TYPES.has(ogType.toLowerCase());
    return {
      id: "og-type",
      label: "Open Graph Type",
      status: isValid ? "pass" : "warn",
      message: isValid
        ? `og:type is set to "${ogType}".`
        : `og:type "${ogType}" is not a standard OGP type. Platforms may not handle it correctly.`,
      detail: `<meta property="og:type" content="${ogType}">`,
      suggestion: isValid
        ? undefined
        : `Valid types: ${[...VALID_OG_TYPES].slice(0, 6).join(", ")}, etc. Use "article" for blog posts, "website" for home pages, "product" for product pages.`,
    };
  }
  return {
    id: "og-type",
    label: "Open Graph Type",
    status: "info",
    message: 'No og:type declared — platforms will default to "website".',
    suggestion:
      'Add <meta property="og:type" content="article"> (or "website", "product", etc.) for more precise social sharing behavior.',
  };
}

function checkOgImageAlt(tags: MetaTags): SeoInsightCheck {
  if (!tags.og.image) {
    return {
      id: "og-image-alt",
      label: "OG Image Alt Text",
      status: "na",
      message: "No og:image present — alt text check not applicable.",
    };
  }
  if (tags.og.imageAlt) {
    return {
      id: "og-image-alt",
      label: "OG Image Alt Text",
      status: "pass",
      message: "og:image:alt is set.",
      detail: `<meta property="og:image:alt" content="${tags.og.imageAlt}">`,
    };
  }
  return {
    id: "og-image-alt",
    label: "OG Image Alt Text",
    status: "info",
    message: "og:image exists but og:image:alt is missing.",
    suggestion:
      "Add <meta property=\"og:image:alt\" content=\"...\"> to describe your OG image. This improves accessibility for screen readers and helps AI systems understand the image context.",
  };
}

function checkTwitterImageAlt(tags: MetaTags): SeoInsightCheck {
  if (!tags.twitter.image) {
    return {
      id: "twitter-image-alt",
      label: "Twitter Image Alt Text",
      status: "na",
      message: "No twitter:image present — alt text check not applicable.",
    };
  }
  if (tags.twitter.imageAlt) {
    return {
      id: "twitter-image-alt",
      label: "Twitter Image Alt Text",
      status: "pass",
      message: "twitter:image:alt is set.",
      detail: `<meta name="twitter:image:alt" content="${tags.twitter.imageAlt}">`,
    };
  }
  return {
    id: "twitter-image-alt",
    label: "Twitter Image Alt Text",
    status: "info",
    message: "twitter:image exists but twitter:image:alt is missing.",
    suggestion:
      'Add <meta name="twitter:image:alt" content="..."> to describe your Twitter card image for accessibility and AI understanding.',
  };
}

function checkDuplicateMeta(tags: MetaTags): SeoInsightCheck {
  const { title, description, canonical } = tags.seoInsights.duplicates;
  const issues: string[] = [];

  if (title > 1) issues.push(`${title} <title> tags`);
  if (description > 1)
    issues.push(`${description} <meta name="description"> tags`);
  if (canonical > 1)
    issues.push(`${canonical} <link rel="canonical"> tags`);

  if (issues.length > 0) {
    return {
      id: "duplicate-meta",
      label: "Duplicate Meta Tags",
      status: "warn",
      message: `Found duplicates: ${issues.join(", ")}. Search engines may use an unpredictable value.`,
      detail: issues
        .map((i) => `Duplicate: ${i}`)
        .join("\n"),
      suggestion:
        "Remove duplicate tags so each critical meta element appears exactly once. Multiple title or description tags cause unpredictable SERP behavior.",
    };
  }
  return {
    id: "duplicate-meta",
    label: "Duplicate Meta Tags",
    status: "pass",
    message: "No duplicate title, description, or canonical tags found.",
  };
}

function checkHreflang(tags: MetaTags): SeoInsightCheck {
  const links = tags.seoInsights.hreflangLinks;
  if (links.length > 0) {
    const hasXDefault = links.some((l) => l.lang === "x-default");
    const detail = links
      .map((l) => `<link rel="alternate" hreflang="${l.lang}" href="${l.href}">`)
      .join("\n");
    return {
      id: "hreflang",
      label: "Hreflang (Internationalization)",
      status: "pass",
      message: `${links.length} hreflang link${links.length > 1 ? "s" : ""} found${hasXDefault ? " (includes x-default)" : ""}.`,
      detail,
      suggestion: hasXDefault
        ? undefined
        : 'Consider adding an x-default hreflang for users whose language doesn\'t match any declared variant.',
    };
  }
  return {
    id: "hreflang",
    label: "Hreflang (Internationalization)",
    status: "info",
    message: "No hreflang tags found.",
    suggestion:
      "If your site serves content in multiple languages or regions, add hreflang tags to help search engines serve the correct version to users.",
  };
}

function checkMultipleH1(
  tags: MetaTags,
  opts: SeoInsightsOptions,
): SeoInsightCheck {
  if (opts.urlMode) {
    return {
      id: "h1-tags",
      label: "H1 Heading Tags",
      status: "na",
      message:
        "H1 detection requires full page HTML — not available in URL fetch mode (only <head> is retrieved).",
    };
  }

  const h1s = tags.seoInsights.h1Tags;
  if (h1s.length === 1) {
    return {
      id: "h1-tags",
      label: "H1 Heading Tags",
      status: "pass",
      message: "Exactly one H1 tag found.",
      detail: `<h1>${h1s[0]}</h1>`,
    };
  }
  if (h1s.length === 0) {
    return {
      id: "h1-tags",
      label: "H1 Heading Tags",
      status: "info",
      message: "No H1 tag found in the provided HTML.",
      suggestion:
        "Every page should have exactly one H1 tag that describes the main topic. It helps search engines and screen readers understand your page structure.",
    };
  }
  return {
    id: "h1-tags",
    label: "H1 Heading Tags",
    status: "warn",
    message: `${h1s.length} H1 tags found — best practice is exactly one per page.`,
    detail: h1s.map((h) => `<h1>${h}</h1>`).join("\n"),
    suggestion:
      "Use a single H1 for the main page heading. Use H2–H6 for subheadings. Multiple H1s can confuse search engine topic analysis.",
  };
}

function checkResourceHints(tags: MetaTags): SeoInsightCheck {
  const preconnect = tags.seoInsights.preconnectHints;
  const dnsPrefetch = tags.seoInsights.dnsPrefetchHints;
  const total = preconnect.length + dnsPrefetch.length;

  if (total > 0) {
    const parts: string[] = [];
    preconnect.forEach((h) =>
      parts.push(`<link rel="preconnect" href="${h}">`),
    );
    dnsPrefetch.forEach((h) =>
      parts.push(`<link rel="dns-prefetch" href="${h}">`),
    );
    return {
      id: "resource-hints",
      label: "Resource Hints (Preconnect / DNS Prefetch)",
      status: "pass",
      message: `${total} resource hint${total > 1 ? "s" : ""} found (${preconnect.length} preconnect, ${dnsPrefetch.length} dns-prefetch).`,
      detail: parts.join("\n"),
    };
  }
  return {
    id: "resource-hints",
    label: "Resource Hints (Preconnect / DNS Prefetch)",
    status: "info",
    message: "No preconnect or dns-prefetch hints found.",
    suggestion:
      "If your page loads resources from third-party domains (fonts, CDNs, analytics), add <link rel=\"preconnect\"> or <link rel=\"dns-prefetch\"> to reduce connection latency and improve Core Web Vitals.",
  };
}

function checkDetectedTech(tags: MetaTags): SeoInsightCheck {
  const tech = tags.seoInsights.detectedTech;
  if (tech.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const t of tech) {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push(t.name);
    }
    const detail = tech
      .map((t) => `${t.name} (${t.category}) — ${t.evidence}`)
      .join("\n");
    const summary = Object.entries(grouped)
      .map(([cat, names]) => `${cat}: ${names.join(", ")}`)
      .join(" · ");
    return {
      id: "detected-tech",
      label: "Detected Technologies",
      status: "info",
      message: `${tech.length} technolog${tech.length === 1 ? "y" : "ies"} detected. ${summary}`,
      detail,
    };
  }
  return {
    id: "detected-tech",
    label: "Detected Technologies",
    status: "info",
    message: "No frameworks, libraries, or platforms detected from HTML signatures.",
  };
}

function checkDetectedAnalytics(tags: MetaTags): SeoInsightCheck {
  const analytics = tags.seoInsights.detectedAnalytics;
  if (analytics.length > 0) {
    const names = analytics.map((a) => a.name).join(", ");
    const detail = analytics
      .map((a) => `${a.name} — ${a.evidence}`)
      .join("\n");
    return {
      id: "detected-analytics",
      label: "Analytics & Tracking",
      status: "info",
      message: `${analytics.length} analytics/tracking tool${analytics.length === 1 ? "" : "s"} detected: ${names}`,
      detail,
    };
  }
  return {
    id: "detected-analytics",
    label: "Analytics & Tracking",
    status: "info",
    message: "No analytics or tracking scripts detected.",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs all SEO insight checks and returns an advisory (non-scoring) result.
 *
 * @param tags - Parsed meta tags
 * @param options - Assessment options (e.g. urlMode)
 * @returns SeoInsightsResult with checks and summary counts
 */
export function assessSeoInsights(
  tags: MetaTags,
  options: SeoInsightsOptions = {},
): SeoInsightsResult {
  const checks: SeoInsightCheck[] = [
    checkCharset(tags),
    checkFavicon(tags),
    checkViewport(tags),
    checkOgType(tags),
    checkOgImageAlt(tags),
    checkTwitterImageAlt(tags),
    checkDuplicateMeta(tags),
    checkHreflang(tags),
    checkMultipleH1(tags, options),
    checkResourceHints(tags),
    checkDetectedTech(tags),
    checkDetectedAnalytics(tags),
  ];

  const summary = { pass: 0, info: 0, warn: 0, na: 0 };
  for (const c of checks) {
    summary[c.status]++;
  }

  return { checks, summary };
}
