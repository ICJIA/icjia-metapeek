/**
 * @fileoverview Core AI readiness assessment logic. Evaluates 9 checks to
 * determine how well a page is prepared for AI crawlers and LLM consumption.
 * Isomorphic — no browser or framework dependencies.
 *
 * @module shared/ai-readiness
 */

import type { MetaTags, AiReadinessCheck, AiReadinessResult } from "./types";

/**
 * Known AI bot user-agent names used by major LLM providers.
 */
export const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "Google-Extended",
  "Anthropic-AI",
  "ClaudeBot",
  "CCBot",
  "PerplexityBot",
  "Bytespider",
] as const;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Parses a robots.txt string and determines whether a specific bot is blocked.
 *
 * Looks for a User-agent section matching `botName` (or `*`) that contains
 * `Disallow: /` — meaning the entire site is disallowed.
 *
 * @param robotsTxt - Raw robots.txt content
 * @param botName  - The bot user-agent name to check
 * @returns `true` if the bot is blocked
 */
function isBotBlocked(robotsTxt: string, botName: string): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  let currentGroupMatches = false;
  let inAgentLines = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const agentMatch = trimmed.match(/^user-agent:\s*(.+)$/i);
    if (agentMatch) {
      if (!inAgentLines) {
        // Starting a new group
        currentGroupMatches = false;
        inAgentLines = true;
      }
      const agent = agentMatch[1]!.trim().toLowerCase();
      if (agent === "*" || agent === botName.toLowerCase()) {
        currentGroupMatches = true;
      }
      continue;
    }

    inAgentLines = false;
    const disallowMatch = trimmed.match(/^disallow:\s*(.*)$/i);
    if (disallowMatch && currentGroupMatches) {
      const path = disallowMatch[1]!.trim();
      if (path === "/") return true;
    }
  }

  return false;
}

/**
 * Extracts a value from JSON-LD structured data objects.
 */
function getJsonLdValue(
  structuredData: Array<Record<string, unknown>>,
  key: string,
): unknown {
  for (const item of structuredData) {
    if (item[key] !== undefined) {
      return item[key];
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/*  Individual checks                                                          */
/* -------------------------------------------------------------------------- */

function checkJsonLd(tags: MetaTags): AiReadinessCheck {
  const id = "json-ld";
  const label = "JSON-LD Structured Data";

  if (tags.structuredData.length === 0) {
    return {
      id,
      label,
      status: "fail",
      message: "No JSON-LD structured data found.",
      suggestion:
        "Add a <script type=\"application/ld+json\"> block with Schema.org markup (e.g. Article, WebPage).",
    };
  }

  const hasType = tags.structuredData.some((item) => {
    if (item["@type"] !== undefined) return true;
    // Check @graph wrapper (common in WordPress/Yoast SEO)
    if (Array.isArray(item["@graph"])) {
      return (item["@graph"] as Array<Record<string, unknown>>).some(
        (g) => g["@type"] !== undefined,
      );
    }
    return false;
  });

  if (!hasType) {
    return {
      id,
      label,
      status: "warn",
      message: "JSON-LD present but missing @type.",
      suggestion:
        "Add an @type property (e.g. \"Article\", \"WebPage\") so AI systems can identify the content type.",
    };
  }

  return {
    id,
    label,
    status: "pass",
    message: "JSON-LD with @type found.",
  };
}

function checkAuthorship(tags: MetaTags): AiReadinessCheck {
  const id = "authorship";
  const label = "Authorship";

  // Check meta author tag
  if (tags.author) {
    return {
      id,
      label,
      status: "pass",
      message: "Author found in meta tags.",
    };
  }

  // Check article:author
  if (tags.article.author) {
    return {
      id,
      label,
      status: "pass",
      message: "Author found in article:author.",
    };
  }

  // Check JSON-LD for author
  const jsonLdAuthor = getJsonLdValue(tags.structuredData, "author");
  if (jsonLdAuthor) {
    return {
      id,
      label,
      status: "pass",
      message: "Author found in JSON-LD structured data.",
    };
  }

  return {
    id,
    label,
    status: "fail",
    message: "No authorship information found.",
    suggestion:
      "Add <meta name=\"author\" content=\"...\"> or include author in JSON-LD to help AI attribute content.",
  };
}

function checkFreshness(tags: MetaTags): AiReadinessCheck {
  const id = "freshness";
  const label = "Content Freshness";

  // Gather all available date signals
  const publishedDate =
    tags.article.publishedTime ||
    (getJsonLdValue(tags.structuredData, "datePublished") as
      | string
      | undefined);

  const modifiedDate =
    tags.article.modifiedTime ||
    tags.og.updatedTime ||
    (getJsonLdValue(tags.structuredData, "dateModified") as
      | string
      | undefined);

  const hasPublished = !!publishedDate;
  const hasModified = !!modifiedDate;

  if (hasPublished && hasModified) {
    return {
      id,
      label,
      status: "pass",
      message: "Both published and modified dates found.",
    };
  }

  if (hasPublished || hasModified) {
    return {
      id,
      label,
      status: "warn",
      message: hasPublished
        ? "Published date found but no modified date."
        : "Modified date found but no published date.",
      suggestion:
        "Add both datePublished and dateModified to help AI assess content freshness.",
    };
  }

  return {
    id,
    label,
    status: "fail",
    message: "No published or modified date found.",
    suggestion:
      "Add article:published_time / article:modified_time or datePublished / dateModified in JSON-LD.",
  };
}

function checkCanonical(tags: MetaTags): AiReadinessCheck {
  const id = "canonical";
  const label = "Canonical URL";

  if (tags.canonical) {
    return {
      id,
      label,
      status: "pass",
      message: "Canonical URL present.",
    };
  }

  return {
    id,
    label,
    status: "fail",
    message: "Canonical URL missing.",
    suggestion:
      "Add <link rel=\"canonical\" href=\"...\"> so AI systems reference the correct URL.",
  };
}

function checkLanguage(tags: MetaTags): AiReadinessCheck {
  const id = "language";
  const label = "Language Declaration";

  if (tags.htmlLang || tags.language) {
    return {
      id,
      label,
      status: "pass",
      message: tags.htmlLang
        ? `Language declared via html lang="${tags.htmlLang}".`
        : "Language declared via meta tag.",
    };
  }

  return {
    id,
    label,
    status: "fail",
    message: "No language declaration found.",
    suggestion:
      "Add lang attribute to the <html> tag (e.g. <html lang=\"en\">) so AI systems know the content language.",
  };
}

function checkDescriptionQuality(tags: MetaTags): AiReadinessCheck {
  const id = "description-quality";
  const label = "Description Quality";

  const description = tags.description || tags.og.description;

  if (!description) {
    return {
      id,
      label,
      status: "fail",
      message: "No meta description found.",
      suggestion:
        "Add a meta description of at least 80 characters to give AI systems a clear page summary.",
    };
  }

  if (description.length >= 80) {
    return {
      id,
      label,
      status: "pass",
      message: `Description is ${description.length} characters.`,
    };
  }

  if (description.length >= 50) {
    return {
      id,
      label,
      status: "warn",
      message: `Description is only ${description.length} characters.`,
      suggestion:
        "Aim for at least 80 characters to give AI systems enough context to summarize the page.",
    };
  }

  return {
    id,
    label,
    status: "fail",
    message: `Description is too short (${description.length} characters).`,
    suggestion:
      "Expand the description to at least 80 characters for meaningful AI summarization.",
  };
}

function checkAiCrawlDirectives(tags: MetaTags): AiReadinessCheck {
  const id = "ai-crawl-directives";
  const label = "AI Crawl Directives";

  const robots = (tags.robots ?? "").toLowerCase();

  if (robots.includes("noai") || robots.includes("noimageai")) {
    const directives: string[] = [];
    if (robots.includes("noai")) directives.push("noai");
    if (robots.includes("noimageai")) directives.push("noimageai");

    return {
      id,
      label,
      status: "fail",
      message: `Robots meta contains ${directives.join(", ")}.`,
      suggestion:
        "These directives block AI systems from using your content. Remove them if you want AI visibility.",
    };
  }

  return {
    id,
    label,
    status: "pass",
    message: "No AI-blocking directives found in robots meta.",
  };
}

function checkRobotsTxt(robotsTxt: string | null): AiReadinessCheck {
  const id = "robots-txt";
  const label = "robots.txt AI Bot Access";

  if (robotsTxt === null) {
    return {
      id,
      label,
      status: "na",
      message: "robots.txt not available.",
    };
  }

  const blocked = AI_BOTS.filter((bot) => isBotBlocked(robotsTxt, bot));

  if (blocked.length === 0) {
    return {
      id,
      label,
      status: "pass",
      message: "No AI bots blocked in robots.txt.",
    };
  }

  if (blocked.length === AI_BOTS.length) {
    return {
      id,
      label,
      status: "fail",
      message: `All ${AI_BOTS.length} AI bots are blocked in robots.txt.`,
      suggestion:
        "Remove Disallow rules for AI bots if you want your content to appear in AI-generated answers.",
    };
  }

  return {
    id,
    label,
    status: "warn",
    message: `${blocked.length} of ${AI_BOTS.length} AI bots blocked: ${blocked.join(", ")}.`,
    suggestion:
      "Some AI crawlers are blocked. Review your robots.txt if you want broader AI coverage.",
  };
}

function checkLlmsTxt(llmsTxt: string | null): AiReadinessCheck {
  const id = "llms-txt";
  const label = "llms.txt";

  if (llmsTxt === null || llmsTxt.trim() === "") {
    return {
      id,
      label,
      status: "fail",
      message: llmsTxt === null ? "No llms.txt found." : "llms.txt is empty.",
      suggestion:
        "Add a /llms.txt file describing your site for LLM consumption. See llmstxt.org for the specification.",
    };
  }

  return {
    id,
    label,
    status: "pass",
    message: "llms.txt found and non-empty.",
  };
}

/* -------------------------------------------------------------------------- */
/*  Verdict                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Computes the overall AI readiness verdict from check results.
 *
 * - **ready**: 0 fails and at most 1 warn
 * - **partial**: 1-2 fails or 2+ warns
 * - **not-ready**: 3+ fails
 *
 * Checks with status `na` are skipped.
 */
function computeVerdict(
  checks: AiReadinessCheck[],
): AiReadinessResult["verdict"] {
  const active = checks.filter((c) => c.status !== "na");
  const fails = active.filter((c) => c.status === "fail").length;
  const warns = active.filter((c) => c.status === "warn").length;

  if (fails >= 3) return "not-ready";
  if (fails >= 1 || warns >= 2) return "partial";
  return "ready";
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Options for `assessAiReadiness`.
 */
export interface AiReadinessOptions {
  /** When true, robots.txt and llms.txt checks return 'na' (paste mode). */
  pasteMode?: boolean;
  /** Raw robots.txt content (null if unavailable). */
  robotsTxt?: string | null;
  /** Raw llms.txt content (null if unavailable). */
  llmsTxt?: string | null;
}

/**
 * Runs all 9 AI readiness checks against the given meta tags and returns
 * a verdict with detailed per-check results.
 *
 * @param tags    - Parsed meta tags from parseMetaTags
 * @param options - Optional configuration for paste mode and external file contents
 * @returns AI readiness result with verdict and check details
 */
export function assessAiReadiness(
  tags: MetaTags,
  options?: AiReadinessOptions,
): AiReadinessResult {
  const pasteMode = options?.pasteMode ?? false;
  const robotsTxt = options?.robotsTxt ?? null;
  const llmsTxt = options?.llmsTxt ?? null;

  const checks: AiReadinessCheck[] = [
    checkJsonLd(tags),
    checkAuthorship(tags),
    checkFreshness(tags),
    checkCanonical(tags),
    checkLanguage(tags),
    checkDescriptionQuality(tags),
    checkAiCrawlDirectives(tags),
    pasteMode
      ? { id: "robots-txt", label: "robots.txt AI Bot Access", status: "na", message: "Not available in paste mode." }
      : checkRobotsTxt(robotsTxt),
    pasteMode
      ? { id: "llms-txt", label: "llms.txt", status: "na", message: "Not available in paste mode." }
      : checkLlmsTxt(llmsTxt),
  ];

  const verdict = computeVerdict(checks);

  return { verdict, checks };
}
