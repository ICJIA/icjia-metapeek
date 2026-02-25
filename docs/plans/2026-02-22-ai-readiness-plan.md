# AI Readiness Feature — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a non-scoring "AI Readiness" panel below the score card that evaluates how well a page is prepared for AI systems to understand and cite its content.

**Architecture:** 9 checks split across HTML-head analysis (7 checks using already-parsed MetaTags) and server-side fetches (2 checks: robots.txt and llms.txt). A new `/api/ai-check` endpoint fetches robots.txt + llms.txt in parallel. A shared `assessAiReadiness()` function produces the verdict. A Vue component renders results below the score.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Cheerio (parser), H3 (server), ofetch, @nuxt/ui, Tailwind CSS

---

### Task 1: Add types to `shared/types.ts`

**Files:**
- Modify: `shared/types.ts:159-160` (append after MetaScore interface)

**Step 1: Add AiReadinessCheck and AiReadinessResult types**

Add these types at the end of `shared/types.ts`:

```typescript
/**
 * Status of a single AI readiness check.
 */
export interface AiReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'na';
  message: string;
  suggestion?: string;
}

/**
 * Complete AI readiness assessment result.
 */
export interface AiReadinessResult {
  verdict: 'ready' | 'partial' | 'not-ready';
  checks: AiReadinessCheck[];
}

/**
 * Response from /api/ai-check endpoint.
 */
export interface AiCheckResponse {
  ok: boolean;
  robotsTxt: string | null;
  llmsTxt: string | null;
}
```

**Step 2: Commit**

```bash
git add shared/types.ts
git commit -m "feat(ai-readiness): add AiReadinessCheck, AiReadinessResult, AiCheckResponse types"
```

---

### Task 2: Add `lang` attribute extraction to parser

The parser currently extracts `<meta name="language">` but not the `<html lang="...">` attribute. The AI readiness check for language declaration needs this.

**Files:**
- Modify: `shared/parser.ts` (add htmlLang extraction)
- Modify: `shared/types.ts` (add htmlLang to MetaTags)

**Step 1: Add htmlLang to MetaTags interface**

In `shared/types.ts`, add to the MetaTags interface after the `generator` field:

```typescript
  htmlLang?: string;
```

**Step 2: Extract html lang attribute in parser**

In `shared/parser.ts`, after the `const title = ...` line (~line 35), add:

```typescript
  // Extract html lang attribute
  const htmlLang = $("html").attr("lang") || undefined;
```

Add `htmlLang` to the return object:

```typescript
  return {
    title,
    description,
    viewport,
    robots,
    canonical,
    favicon,
    themeColor,
    author,
    keywords,
    language,
    generator,
    htmlLang,
    og,
    // ... rest unchanged
  };
```

**Step 3: Commit**

```bash
git add shared/parser.ts shared/types.ts
git commit -m "feat(parser): extract html lang attribute for AI readiness checks"
```

---

### Task 3: Create `shared/ai-readiness.ts` — core assessment logic

**Files:**
- Create: `shared/ai-readiness.ts`

**Step 1: Write the AI readiness assessment function**

```typescript
/**
 * @fileoverview AI readiness assessment. Evaluates how well a page is prepared
 * for AI systems (LLMs, AI search, AI agents) to understand and cite content.
 * Isomorphic — no browser or framework dependencies.
 *
 * @module shared/ai-readiness
 */

import type { MetaTags, AiReadinessCheck, AiReadinessResult } from "./types";

/**
 * AI bots to check for in robots.txt.
 */
const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "Google-Extended",
  "anthropic-ai",
  "ClaudeBot",
  "CCBot",
  "PerplexityBot",
  "Bytespider",
] as const;

/**
 * Checks if robots.txt blocks a specific user agent.
 * Simple heuristic: looks for "User-agent: <bot>" followed by "Disallow: /".
 */
function isBotBlocked(robotsTxt: string, botName: string): boolean {
  // Normalize line endings and make case-insensitive
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.trim());
  let currentAgent = "";

  for (const line of lines) {
    // Skip comments
    if (line.startsWith("#") || line === "") continue;

    const agentMatch = line.match(/^user-agent:\s*(.+)$/i);
    if (agentMatch) {
      currentAgent = agentMatch[1]!.trim().toLowerCase();
      continue;
    }

    const disallowMatch = line.match(/^disallow:\s*(.*)$/i);
    if (disallowMatch) {
      const path = disallowMatch[1]!.trim();
      // Check if this agent matches our bot (or wildcard) and blocks root
      if (
        (currentAgent === botName.toLowerCase() || currentAgent === "*") &&
        path === "/"
      ) {
        return true;
      }
    }
  }

  return false;
}

function checkJsonLd(tags: MetaTags): AiReadinessCheck {
  if (tags.structuredData.length === 0) {
    return {
      id: "json-ld",
      label: "JSON-LD Structured Data",
      status: "fail",
      message: "No JSON-LD structured data found",
      suggestion:
        'Add <script type="application/ld+json"> with schema.org markup. This helps AI systems understand your content type, authorship, and relationships.',
    };
  }

  const hasType = tags.structuredData.some(
    (d) => d["@type"] || (d["@graph"] && Array.isArray(d["@graph"])),
  );
  if (!hasType) {
    return {
      id: "json-ld",
      label: "JSON-LD Structured Data",
      status: "warn",
      message: "JSON-LD found but missing @type",
      suggestion:
        'Add a @type field (e.g., "Article", "WebPage", "Organization") to help AI systems categorize your content.',
    };
  }

  return {
    id: "json-ld",
    label: "JSON-LD Structured Data",
    status: "pass",
    message: `${tags.structuredData.length} JSON-LD block${tags.structuredData.length > 1 ? "s" : ""} with valid @type`,
  };
}

function checkAuthorship(tags: MetaTags): AiReadinessCheck {
  // Check meta author
  if (tags.author) {
    return {
      id: "authorship",
      label: "Authorship",
      status: "pass",
      message: `Author: ${tags.author}`,
    };
  }

  // Check article:author
  if (tags.article.author) {
    return {
      id: "authorship",
      label: "Authorship",
      status: "pass",
      message: `Author: ${tags.article.author}`,
    };
  }

  // Check JSON-LD for author
  for (const data of tags.structuredData) {
    if (data.author) {
      const authorName =
        typeof data.author === "string"
          ? data.author
          : typeof data.author === "object" &&
              data.author !== null &&
              "name" in data.author
            ? String((data.author as { name: unknown }).name)
            : "found in JSON-LD";
      return {
        id: "authorship",
        label: "Authorship",
        status: "pass",
        message: `Author: ${authorName}`,
      };
    }
  }

  return {
    id: "authorship",
    label: "Authorship",
    status: "fail",
    message: "No authorship information found",
    suggestion:
      'Add <meta name="author" content="..."> or article:author meta tag. AI systems use authorship to assess content credibility and provide proper attribution.',
  };
}

function checkFreshness(tags: MetaTags): AiReadinessCheck {
  const hasPublished =
    !!tags.article.publishedTime ||
    tags.structuredData.some((d) => d.datePublished);
  const hasModified =
    !!tags.article.modifiedTime ||
    !!tags.og.updatedTime ||
    tags.structuredData.some((d) => d.dateModified);

  if (hasPublished && hasModified) {
    return {
      id: "freshness",
      label: "Content Freshness",
      status: "pass",
      message: "Published and modified dates found",
    };
  }

  if (hasPublished || hasModified) {
    return {
      id: "freshness",
      label: "Content Freshness",
      status: "warn",
      message: hasPublished
        ? "Published date found but no modified date"
        : "Modified date found but no published date",
      suggestion:
        "Add both article:published_time and article:modified_time (or datePublished/dateModified in JSON-LD) so AI systems can assess content freshness.",
    };
  }

  return {
    id: "freshness",
    label: "Content Freshness",
    status: "fail",
    message: "No date signals found",
    suggestion:
      "Add article:published_time and article:modified_time meta tags, or datePublished/dateModified in JSON-LD. AI systems use dates to determine content relevance and freshness.",
  };
}

function checkCanonical(tags: MetaTags): AiReadinessCheck {
  if (tags.canonical) {
    return {
      id: "canonical",
      label: "Canonical URL",
      status: "pass",
      message: "Canonical URL present",
    };
  }

  return {
    id: "canonical",
    label: "Canonical URL",
    status: "fail",
    message: "No canonical URL found",
    suggestion:
      'Add <link rel="canonical" href="...">. AI systems need this to identify the authoritative source URL when citing your content.',
  };
}

function checkLanguage(tags: MetaTags): AiReadinessCheck {
  if (tags.htmlLang) {
    return {
      id: "language",
      label: "Language Declaration",
      status: "pass",
      message: `Language: ${tags.htmlLang}`,
    };
  }

  if (tags.language) {
    return {
      id: "language",
      label: "Language Declaration",
      status: "pass",
      message: `Language: ${tags.language}`,
    };
  }

  return {
    id: "language",
    label: "Language Declaration",
    status: "fail",
    message: "No language declaration found",
    suggestion:
      'Add lang="en" (or appropriate language) to your <html> tag. AI systems use this to correctly interpret and translate your content.',
  };
}

function checkDescriptionQuality(tags: MetaTags): AiReadinessCheck {
  const desc = tags.description || tags.og.description;

  if (!desc) {
    return {
      id: "description-quality",
      label: "Description Quality",
      status: "fail",
      message: "No description found",
      suggestion:
        "Add a substantive meta description (80+ characters). AI systems use descriptions as primary content summaries for generating answers.",
    };
  }

  if (desc.length < 50) {
    return {
      id: "description-quality",
      label: "Description Quality",
      status: "fail",
      message: `Description too short for AI summarization (${desc.length} chars)`,
      suggestion:
        "Expand your description to 80+ characters. Short descriptions don't give AI systems enough context to accurately summarize or cite your content.",
    };
  }

  if (desc.length < 80) {
    return {
      id: "description-quality",
      label: "Description Quality",
      status: "warn",
      message: `Description is adequate but could be more substantive (${desc.length} chars)`,
      suggestion:
        "Consider expanding to 80+ characters for better AI summarization. Longer, more specific descriptions help AI systems generate more accurate answers from your content.",
    };
  }

  return {
    id: "description-quality",
    label: "Description Quality",
    status: "pass",
    message: `Description is substantive (${desc.length} chars)`,
  };
}

function checkAiCrawlDirectives(tags: MetaTags): AiReadinessCheck {
  const robots = tags.robots?.toLowerCase() || "";

  if (robots.includes("noai") || robots.includes("noimageai")) {
    const directives: string[] = [];
    if (robots.includes("noai")) directives.push("noai");
    if (robots.includes("noimageai")) directives.push("noimageai");

    return {
      id: "ai-crawl",
      label: "AI Crawl Directives",
      status: "fail",
      message: `AI crawling blocked: ${directives.join(", ")}`,
      suggestion:
        "Your robots meta tag includes AI-blocking directives. This prevents AI systems from using your content. Remove these if you want AI visibility.",
    };
  }

  return {
    id: "ai-crawl",
    label: "AI Crawl Directives",
    status: "pass",
    message: "No AI-blocking directives found",
  };
}

function checkRobotsTxt(robotsTxt: string | null): AiReadinessCheck {
  if (robotsTxt === null) {
    return {
      id: "robots-txt",
      label: "robots.txt AI Bots",
      status: "na",
      message: "Could not fetch robots.txt",
    };
  }

  const blocked = AI_BOTS.filter((bot) => isBotBlocked(robotsTxt, bot));
  const wildcardBlocked = isBotBlocked(robotsTxt, "*");

  if (blocked.length === 0 && !wildcardBlocked) {
    return {
      id: "robots-txt",
      label: "robots.txt AI Bots",
      status: "pass",
      message: "No AI bot blocks in robots.txt",
    };
  }

  if (blocked.length === AI_BOTS.length || wildcardBlocked) {
    return {
      id: "robots-txt",
      label: "robots.txt AI Bots",
      status: "fail",
      message: wildcardBlocked
        ? "robots.txt blocks all bots (including AI)"
        : `All ${AI_BOTS.length} major AI bots blocked`,
      suggestion:
        "Your robots.txt blocks AI crawlers from accessing your content. Remove or modify these rules if you want AI systems to index and cite your pages.",
    };
  }

  return {
    id: "robots-txt",
    label: "robots.txt AI Bots",
    status: "warn",
    message: `${blocked.length} of ${AI_BOTS.length} AI bots blocked: ${blocked.join(", ")}`,
    suggestion:
      "Some AI crawlers are blocked in your robots.txt. This limits your content's visibility in AI-powered search and chat products from those providers.",
  };
}

function checkLlmsTxt(llmsTxt: string | null): AiReadinessCheck {
  if (llmsTxt === null) {
    return {
      id: "llms-txt",
      label: "llms.txt",
      status: "fail",
      message: "No /llms.txt found",
      suggestion:
        "Add a /llms.txt file to your site root. This emerging convention (llmstxt.org) provides AI systems with a concise, machine-readable description of your site, its purpose, and key pages.",
    };
  }

  if (llmsTxt.trim().length === 0) {
    return {
      id: "llms-txt",
      label: "llms.txt",
      status: "fail",
      message: "/llms.txt exists but is empty",
      suggestion:
        "Your llms.txt file is empty. Add a description of your site, its purpose, and links to key pages. See llmstxt.org for the format.",
    };
  }

  return {
    id: "llms-txt",
    label: "llms.txt",
    status: "pass",
    message: `/llms.txt found (${llmsTxt.trim().split("\n").length} lines)`,
  };
}

/**
 * Determines the overall AI readiness verdict from individual checks.
 *
 * - **ready**: 0 fails, <=1 warn
 * - **partial**: 1-2 fails or 2+ warns
 * - **not-ready**: 3+ fails
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

/**
 * Assesses AI readiness of a page from its parsed meta tags and optional
 * robots.txt/llms.txt content.
 *
 * @param tags - Parsed meta tags from parseMetaTags
 * @param options - Optional robots.txt and llms.txt content from /api/ai-check
 * @returns AiReadinessResult with verdict and individual checks
 */
export function assessAiReadiness(
  tags: MetaTags,
  options?: {
    robotsTxt?: string | null;
    llmsTxt?: string | null;
    pasteMode?: boolean;
  },
): AiReadinessResult {
  const checks: AiReadinessCheck[] = [
    checkJsonLd(tags),
    checkAuthorship(tags),
    checkFreshness(tags),
    checkCanonical(tags),
    checkLanguage(tags),
    checkDescriptionQuality(tags),
    checkAiCrawlDirectives(tags),
  ];

  // Server-side checks (only in URL fetch mode)
  if (options?.pasteMode) {
    checks.push({
      id: "robots-txt",
      label: "robots.txt AI Bots",
      status: "na",
      message: "Not available in paste mode",
    });
    checks.push({
      id: "llms-txt",
      label: "llms.txt",
      status: "na",
      message: "Not available in paste mode",
    });
  } else {
    checks.push(checkRobotsTxt(options?.robotsTxt ?? null));
    checks.push(checkLlmsTxt(options?.llmsTxt ?? null));
  }

  return {
    verdict: computeVerdict(checks),
    checks,
  };
}
```

**Step 2: Commit**

```bash
git add shared/ai-readiness.ts
git commit -m "feat(ai-readiness): add assessAiReadiness with 9 checks"
```

---

### Task 4: Create `server/api/ai-check.get.ts` — server endpoint

**Files:**
- Create: `server/api/ai-check.get.ts`

**Step 1: Write the endpoint**

```typescript
/**
 * @fileoverview Endpoint to fetch robots.txt and llms.txt for AI readiness checks.
 *
 * GET /api/ai-check?url=https://example.com/page
 *
 * Derives origin from the URL, fetches {origin}/robots.txt and {origin}/llms.txt
 * in parallel. Returns null for either if they 404 or fail.
 *
 * @module server/api/ai-check.get
 */

import { defineEventHandler, getQuery, createError } from "h3";
import { ofetch } from "ofetch";
import { validateUrl } from "../utils/proxy";
import metapeekConfig from "../../metapeek.config";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const url = query.url;

  if (typeof url !== "string" || !url.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Missing or invalid "url" query parameter.',
    });
  }

  if (url.length > metapeekConfig.proxy.maxUrlLength) {
    throw createError({
      statusCode: 400,
      message: `URL exceeds maximum length of ${metapeekConfig.proxy.maxUrlLength} characters`,
    });
  }

  // Validate URL and SSRF protection
  const validation = await validateUrl(url);
  if (!validation.ok) {
    throw createError({
      statusCode: 400,
      message: validation.reason || "Invalid URL",
    });
  }

  // Derive origin
  let origin: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
  } catch {
    throw createError({
      statusCode: 400,
      message: "Invalid URL format",
    });
  }

  // Fetch robots.txt and llms.txt in parallel, soft-fail on errors
  const fetchText = async (targetUrl: string): Promise<string | null> => {
    try {
      const response = await ofetch(targetUrl, {
        headers: {
          "User-Agent": metapeekConfig.proxy.userAgent,
        },
        timeout: 5000,
        responseType: "text",
      });
      return typeof response === "string" ? response : null;
    } catch {
      return null;
    }
  };

  const [robotsTxt, llmsTxt] = await Promise.all([
    fetchText(`${origin}/robots.txt`),
    fetchText(`${origin}/llms.txt`),
  ]);

  return {
    ok: true,
    robotsTxt,
    llmsTxt,
  };
});
```

**Step 2: Commit**

```bash
git add server/api/ai-check.get.ts
git commit -m "feat(ai-readiness): add GET /api/ai-check endpoint for robots.txt and llms.txt"
```

---

### Task 5: Create `app/composables/useAiReadiness.ts` — client composable

**Files:**
- Create: `app/composables/useAiReadiness.ts`

**Step 1: Write the composable**

```typescript
/**
 * @fileoverview Vue composable for AI readiness assessment.
 * Combines parsed meta tags with server-fetched robots.txt/llms.txt data.
 *
 * @module composables/useAiReadiness
 */

import { assessAiReadiness } from "#shared/ai-readiness";
import type { MetaTags, AiReadinessResult, AiCheckResponse } from "#shared/types";

export type { AiReadinessResult, AiReadinessCheck } from "#shared/types";

/**
 * Composable for AI readiness assessment.
 *
 * @returns Object with assess function and reactive state
 */
export function useAiReadiness() {
  const aiResult = ref<AiReadinessResult | null>(null);
  const aiLoading = ref(false);

  /**
   * Runs AI readiness assessment for paste HTML mode (no server fetch needed).
   */
  const assessFromHtml = (tags: MetaTags) => {
    aiResult.value = assessAiReadiness(tags, { pasteMode: true });
  };

  /**
   * Runs AI readiness assessment for URL fetch mode.
   * Fetches robots.txt and llms.txt via /api/ai-check, then combines with meta tags.
   */
  const assessFromUrl = async (tags: MetaTags, url: string) => {
    aiLoading.value = true;

    try {
      const response = await $fetch<AiCheckResponse>("/api/ai-check", {
        params: { url },
      });

      aiResult.value = assessAiReadiness(tags, {
        robotsTxt: response.robotsTxt,
        llmsTxt: response.llmsTxt,
      });
    } catch {
      // If the ai-check endpoint fails, still run HTML-only checks
      aiResult.value = assessAiReadiness(tags, {
        robotsTxt: null,
        llmsTxt: null,
      });
    } finally {
      aiLoading.value = false;
    }
  };

  const reset = () => {
    aiResult.value = null;
    aiLoading.value = false;
  };

  return {
    aiResult: readonly(aiResult),
    aiLoading: readonly(aiLoading),
    assessFromHtml,
    assessFromUrl,
    reset,
  };
}
```

**Step 2: Commit**

```bash
git add app/composables/useAiReadiness.ts
git commit -m "feat(ai-readiness): add useAiReadiness composable"
```

---

### Task 6: Create `app/components/AiReadinessPanel.vue` — UI component

**Files:**
- Create: `app/components/AiReadinessPanel.vue`

**Step 1: Write the component**

```vue
<script setup lang="ts">
/**
 * @fileoverview AI Readiness panel. Displays the AI readiness verdict
 * and individual check results. Shown below the score card.
 */

import type { AiReadinessResult } from "#shared/types";

const props = defineProps<{
  result: AiReadinessResult;
  loading?: boolean;
}>();

const verdictConfig = computed(() => {
  switch (props.result.verdict) {
    case "ready":
      return {
        label: "AI Ready",
        icon: "i-heroicons-check-circle-solid",
        bg: "bg-emerald-100 dark:bg-emerald-900/50",
        text: "text-emerald-700 dark:text-emerald-300",
        border: "border-emerald-200 dark:border-emerald-800",
      };
    case "partial":
      return {
        label: "Partially AI Ready",
        icon: "i-heroicons-exclamation-circle-solid",
        bg: "bg-amber-100 dark:bg-amber-900/50",
        text: "text-amber-700 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-800",
      };
    case "not-ready":
      return {
        label: "Not AI Ready",
        icon: "i-heroicons-x-circle-solid",
        bg: "bg-red-100 dark:bg-red-900/50",
        text: "text-red-700 dark:text-red-300",
        border: "border-red-200 dark:border-red-800",
      };
  }
});

const statusIcon = (status: string) => {
  switch (status) {
    case "pass":
      return "i-heroicons-check-circle-solid";
    case "warn":
      return "i-heroicons-exclamation-circle-solid";
    case "fail":
      return "i-heroicons-x-circle-solid";
    default:
      return "i-heroicons-minus-circle-solid";
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "pass":
      return "text-emerald-500";
    case "warn":
      return "text-amber-500";
    case "fail":
      return "text-red-500";
    default:
      return "text-gray-400";
  }
};
</script>

<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-xl border border-violet-200 dark:border-violet-800 p-6"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">
          AI Readiness
        </h3>
        <span
          :class="[
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold',
            verdictConfig.bg,
            verdictConfig.text,
          ]"
        >
          <UIcon :name="verdictConfig.icon" class="w-4 h-4" />
          {{ verdictConfig.label }}
        </span>
      </div>
      <span class="text-xs text-gray-500 dark:text-gray-400 italic">
        Does not affect score
      </span>
    </div>

    <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
      How well your page is prepared for AI systems (LLMs, AI search engines, AI agents) to understand and cite your content.
    </p>

    <!-- Loading state for server checks -->
    <div
      v-if="loading"
      class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4"
    >
      <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
      Checking robots.txt and llms.txt...
    </div>

    <!-- Check list -->
    <div class="space-y-3">
      <div
        v-for="check in result.checks"
        :key="check.id"
        class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
      >
        <UIcon
          :name="statusIcon(check.status)"
          :class="['w-5 h-5 flex-shrink-0 mt-0.5', statusColor(check.status)]"
        />
        <div class="flex-1 min-w-0">
          <p class="font-medium text-gray-900 dark:text-white text-sm">
            {{ check.label }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            {{ check.message }}
          </p>
          <p
            v-if="check.suggestion"
            class="text-xs text-gray-500 dark:text-gray-500 mt-1"
          >
            {{ check.suggestion }}
          </p>
        </div>
      </div>
    </div>

    <!-- Info note -->
    <div
      class="mt-4 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800"
    >
      <p class="text-xs text-violet-700 dark:text-violet-300">
        <UIcon name="i-heroicons-information-circle" class="inline-block w-3.5 h-3.5 mr-1 align-middle" />
        AI readiness checks evaluate whether AI systems like ChatGPT, Perplexity, Bing Copilot, and Claude can effectively understand, cite, and link to your content. These checks are informational and do not affect your meta tag quality score.
      </p>
    </div>
  </div>
</template>
```

**Step 2: Commit**

```bash
git add app/components/AiReadinessPanel.vue
git commit -m "feat(ai-readiness): add AiReadinessPanel component"
```

---

### Task 7: Wire up AI readiness in `app/pages/index.vue`

**Files:**
- Modify: `app/pages/index.vue`

**Step 1: Add composable import and state**

Near the top of `<script setup>`, after the existing composable calls (~line 28), add:

```typescript
const { aiResult, aiLoading, assessFromHtml, assessFromUrl, reset: resetAi } = useAiReadiness();
```

**Step 2: Trigger assessment in paste HTML mode**

In the `analyze()` function (~line 65), after `hasAnalyzed.value = true;` add:

```typescript
  assessFromHtml(parsedTags.value);
```

**Step 3: Trigger assessment in URL fetch mode**

In `handleFetchUrl()` (~line 182), after `rawHeadHtml.value = response.head;` and before `fetchStatus.setComplete(response.timing);`, add:

```typescript
    // Trigger AI readiness check (non-blocking)
    assessFromUrl(tags, inputUrl.value);
```

**Step 4: Reset AI readiness state on mode switch and clear**

In the `watch(inputMode, ...)` handler (~line 115), add `resetAi();` alongside the other resets.

In `resetAll()` (~line 164), add `resetAi();` alongside the other resets.

In the `watch(inputHtml, ...)` handler's else branch (~line 106), where results are cleared when HTML is empty, add `resetAi();`.

**Step 5: Add the AI readiness panel to the template**

After the closing `</div>` of the Step 5 section (the score section, ~line 2255), and before the Step 6 export section, add:

```vue
      <!-- Step 5b: AI Readiness -->
      <div
        v-if="parsedTags && diagnostics && aiResult"
        class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-violet-50 dark:bg-violet-950/40 border-y border-violet-200 dark:border-violet-800"
      >
        <div class="flex items-center gap-4 mb-6">
          <div
            class="flex items-center justify-center w-16 h-16 rounded-full bg-violet-600 text-white font-extrabold text-2xl shadow-xl ring-4 ring-violet-200 dark:ring-violet-800"
          >
            <UIcon name="i-heroicons-cpu-chip" class="w-8 h-8" />
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              AI Readiness
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Is your page ready for AI systems to understand and cite?
            </p>
          </div>
        </div>

        <AiReadinessPanel :result="aiResult" :loading="aiLoading" />
      </div>
```

**Step 6: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat(ai-readiness): wire up AI readiness panel in main page"
```

---

### Task 8: Manual testing and verification

**Step 1: Start dev server**

Run: `yarn dev`

**Step 2: Test paste HTML mode**

Paste the sample HTML (click "Load sample"). Verify:
- AI Readiness panel appears below score
- 7 HTML-head checks show results
- robots.txt and llms.txt checks show "N/A — paste mode"
- Verdict badge renders correctly

**Step 3: Test URL fetch mode**

Switch to URL mode, enter `https://github.com`, click Fetch. Verify:
- AI Readiness panel appears after fetch completes
- All 9 checks show results
- robots.txt check reflects GitHub's actual robots.txt
- llms.txt check likely shows "No /llms.txt found" (most sites don't have it yet)

**Step 4: Test reset**

Click "Clear" and verify the AI readiness panel disappears.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: add AI Readiness assessment panel (9 checks, non-scoring)"
```
