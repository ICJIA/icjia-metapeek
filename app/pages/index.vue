<script setup lang="ts">
/**
 * @fileoverview MetaPeek main page. Handles input (paste HTML or fetch URL),
 * analysis, previews, diagnostics, scoring, and export (JSON/MD/HTML).
 *
 * Two input modes: Paste HTML (client-side parse) or Fetch URL (server proxy).
 */

import type { MetaTags, Diagnostics } from "~/types/meta";

import type { ImageAnalysisResult } from "~/composables/useDiagnostics";

/** OG Image for social sharing (Nuxt SEO) — static image in public/ */
defineOgImage({
  url: "/og-image-v2.png",
  alt: "MetaPeek - Open Graph & Social Sharing Meta Tag Analyzer by ICJIA",
  width: 1200,
  height: 630,
});

const colorMode = useColorMode();
const route = useRoute();
const toast = useToast();
const { parseMetaTags } = useMetaParser();
const { generateDiagnostics } = useDiagnostics();
const { computeScore } = useMetaScore();
const { fetchUrl } = useFetchProxy();
const fetchStatus = useFetchStatus();
const { aiResult, aiLoading, assessFromHtml, assessFromUrl, reset: resetAi } = useAiReadiness();

// Fix orphaned ARIA live regions by moving them into a landmark
onMounted(() => {
  const mainContent = document.getElementById("main-content");
  if (mainContent) {
    // Find orphaned alert/live region elements outside landmarks
    const orphanedAlerts = document.querySelectorAll(
      'body > [role="alert"], body > [aria-live]',
    );
    orphanedAlerts.forEach((el) => {
      // Move to end of main content
      mainContent.appendChild(el);
    });
  }
});

// Input mode: 'html' for paste HTML, 'url' for fetch URL
const inputMode = ref<"html" | "url">("html");
const inputHtml = ref("");
const inputUrl = ref("");
const parsedTags = ref<MetaTags | null>(null);
const diagnostics = ref<Diagnostics | null>(null);
const hasAnalyzed = ref(false);
const activeTab = ref("diagnostics");
const imageAnalysisResult = ref<ImageAnalysisResult | undefined>(undefined);
/** Raw HTML that was parsed (from proxy head or pasted HTML) — for debug view */
const rawHeadHtml = ref<string>("");

// Compute meta tag score when diagnostics are available
const metaScore = computed(() =>
  diagnostics.value ? computeScore(diagnostics.value) : null,
);

/**
 * Parses input HTML and generates diagnostics. Called on paste (debounced) or programmatically.
 */
const analyze = () => {
  if (!inputHtml.value.trim()) {
    parsedTags.value = null;
    diagnostics.value = null;
    hasAnalyzed.value = false;
    imageAnalysisResult.value = undefined;
    return;
  }

  parsedTags.value = parseMetaTags(inputHtml.value);
  diagnostics.value = generateDiagnostics(
    parsedTags.value,
    imageAnalysisResult.value,
  );
  hasAnalyzed.value = true;
  assessFromHtml(parsedTags.value);
  rawHeadHtml.value = extractHeadSection();
};

/**
 * Called when ImageAnalysis completes. Updates diagnostics with dimension data.
 * @param result - Width, height, and overall status from image fetch
 */
const handleImageAnalysisComplete = (result: ImageAnalysisResult) => {
  imageAnalysisResult.value = result;

  // Regenerate diagnostics with image dimension data
  if (parsedTags.value) {
    diagnostics.value = generateDiagnostics(parsedTags.value, result);
  }
};

// Auto-analyze with fast debounce for snappy feel (HTML paste mode only)
const debouncedAnalyze = useDebounceFn(analyze, 300);
watch(inputHtml, () => {
  if (inputMode.value === "html") {
    if (inputHtml.value.trim()) {
      // Clear old image analysis when HTML changes
      imageAnalysisResult.value = undefined;
      debouncedAnalyze();
    } else {
      parsedTags.value = null;
      diagnostics.value = null;
      hasAnalyzed.value = false;
      imageAnalysisResult.value = undefined;
      rawHeadHtml.value = "";
      resetAi();
    }
  }
});

// Reset results when switching modes
watch(inputMode, () => {
  parsedTags.value = null;
  diagnostics.value = null;
  hasAnalyzed.value = false;
  imageAnalysisResult.value = undefined;
  fetchStatus.reset();
  resetAi();
});

// Sample HTML
const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitHub · Build and ship software on a single, collaborative platform</title>
  <meta name="description" content="Join the world's most widely adopted AI-powered developer platform where millions of developers, businesses, and the largest open source community build software that advances humanity.">
  
  <!-- Open Graph -->
  <meta property="og:site_name" content="GitHub">
  <meta property="og:type" content="website">
  <meta property="og:title" content="GitHub · Build and ship software on a single, collaborative platform">
  <meta property="og:url" content="https://github.com/">
  <meta property="og:description" content="Join the world's most widely adopted AI-powered developer platform where millions of developers, businesses, and the largest open source community build software.">
  <meta property="og:image" content="https://github.githubassets.com/assets/github-logo-55c5b9a1fe52.png">
  
  <!-- X (Twitter) -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@github">
  <meta name="twitter:title" content="GitHub">
  <meta name="twitter:description" content="Build and ship software on a single, collaborative platform.">
  <meta name="twitter:image" content="https://github.githubassets.com/assets/github-logo-55c5b9a1fe52.png">
  
  <link rel="canonical" href="https://github.com/">
  <link rel="icon" href="https://github.githubassets.com/favicons/favicon.svg">
</head>
<body>
  <h1>Welcome to GitHub</h1>
</body>
</html>`;

/** Loads sample HTML (GitHub) or sample URL based on current input mode. */
const loadSample = () => {
  if (inputMode.value === "html") {
    inputHtml.value = sampleHtml;
  } else {
    inputUrl.value = "https://github.com";
  }
};

/** Clears all input, results, and state; scrolls to top. */
const resetAll = () => {
  inputHtml.value = "";
  inputUrl.value = "";
  parsedTags.value = null;
  diagnostics.value = null;
  hasAnalyzed.value = false;
  imageAnalysisResult.value = undefined;
  rawHeadHtml.value = "";
  fetchStatus.reset();
  resetAi();
  activeTab.value = "diagnostics";
  window.scrollTo({ top: 0, behavior: "smooth" });
};

/**
 * Fetches URL via proxy, parses meta tags, and updates diagnostics.
 * Handles errors via fetchStatus.setError for user-friendly display.
 */
const handleFetchUrl = async () => {
  if (!inputUrl.value.trim()) return;

  try {
    // Set fetching state
    fetchStatus.setValidating();
    await nextTick();
    fetchStatus.setFetching(inputUrl.value);

    // Fetch URL via proxy
    const { tags, response } = await fetchUrl(inputUrl.value);

    // Parse complete
    fetchStatus.setParsing();

    // Store results
    parsedTags.value = tags;
    diagnostics.value = generateDiagnostics(tags, imageAnalysisResult.value);
    hasAnalyzed.value = true;
    rawHeadHtml.value = response.head;

    // Trigger AI readiness check (non-blocking)
    assessFromUrl(tags, inputUrl.value);

    // Complete
    fetchStatus.setComplete(response.timing);
  } catch (error: unknown) {
    // Handle error
    const err = error as { statusCode?: number; message?: string };
    fetchStatus.setError(
      err.statusCode || 0,
      err.message || "An error occurred",
    );

    // Clear results
    parsedTags.value = null;
    diagnostics.value = null;
    hasAnalyzed.value = false;
    imageAnalysisResult.value = undefined;
    rawHeadHtml.value = "";
  }
};

// Support shareable URLs via query parameter
onMounted(() => {
  const urlParam = route.query.url;
  if (urlParam && typeof urlParam === "string") {
    inputMode.value = "url";
    inputUrl.value = urlParam;
    // DO NOT auto-fetch - user must click button
  }
});

/**
 * Resolves relative URLs to absolute using a base URL (og:url or canonical).
 * @param relativeUrl - Path or relative URL to resolve
 * @param baseUrl - Base URL for resolution
 * @returns Absolute URL or undefined if invalid
 */
const resolveUrl = (
  relativeUrl: string | undefined,
  baseUrl: string | undefined,
): string | undefined => {
  if (!relativeUrl) return undefined;
  // Already absolute
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    return relativeUrl;
  }
  // No base URL available
  if (!baseUrl) return undefined;
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return undefined;
  }
};

// Computed resolved favicon URL
const resolvedFavicon = computed(() => {
  if (!parsedTags.value) return undefined;
  const baseUrl = parsedTags.value.og.url || parsedTags.value.canonical;
  return resolveUrl(parsedTags.value.favicon, baseUrl);
});

// Tab items for results
const tabs = [
  { label: "Previews", value: "previews", icon: "i-heroicons-eye" },
  {
    label: "Diagnostics",
    value: "diagnostics",
    icon: "i-heroicons-clipboard-document-check",
  },
  { label: "Code", value: "code", icon: "i-heroicons-code-bracket" },
];

/**
 * Triggers browser download of content as file.
 * @param content - File content (string)
 * @param filename - Suggested filename
 * @param mimeType - MIME type for the Blob
 */
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Tracks which content was last copied (for "Copied!" feedback). */
const copiedState = ref<string | null>(null);

/**
 * Copies content to clipboard. Shows toast on failure (e.g. non-HTTPS).
 * @param content - Text to copy
 * @param type - Key for copiedState (e.g. "llm-issues", "json")
 */
const copyToClipboard = async (content: string, type: string) => {
  try {
    await navigator.clipboard.writeText(content);
    copiedState.value = type;
    setTimeout(() => {
      copiedState.value = null;
    }, 2000);
  } catch {
    toast.add({
      title: "Failed to copy",
      description:
        "Clipboard access was denied. Try selecting the text and copying manually.",
      icon: "i-heroicons-x-circle",
      color: "error",
      duration: 4000,
    });
  }
};

/**
 * Extracts &lt;head&gt; section from input HTML for export reference.
 * Falls back to full input if no head tag (e.g. meta-only paste).
 */
const extractHeadSection = () => {
  const html = inputHtml.value;
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    return headMatch[0];
  }
  // If no head tags, return the whole input (might be just meta tags)
  return html.trim();
};

/**
 * Builds export payload for JSON/Markdown/HTML exports.
 * @returns Export data object or null if no analysis
 */
const generateExportData = () => {
  if (!parsedTags.value || !diagnostics.value) return null;

  const timestamp = new Date().toISOString();
  const tags = parsedTags.value;
  const diag = diagnostics.value;
  const originalHtml = extractHeadSection();
  const score = metaScore.value;

  return {
    exportInfo: {
      tool: "MetaPeek by ICJIA",
      version: "1.0.0",
      exportedAt: timestamp,
      toolUrl: "https://metapeek.icjia.app",
      sourceType: "html_paste", // Will be 'url_fetch' in Phase 2
      sourceUrl: null, // Will contain URL in Phase 2
    },
    originalHtml: originalHtml,
    score: score
      ? {
          overall: score.overall,
          grade: score.grade,
          totalIssues: score.totalIssues,
          categories: Object.entries(score.categories).map(([_key, cat]) => ({
            name: cat.name,
            score: cat.score,
            maxScore: cat.maxScore,
            status: cat.status,
            weight: cat.weight,
            issues: cat.issues,
          })),
        }
      : null,
    summary: {
      overallStatus: diag.overall.status,
      overallMessage: diag.overall.message,
      suggestion: diag.overall.suggestion,
      issueCount: [
        diag.title,
        diag.description,
        diag.ogTags,
        diag.ogImage,
        diag.twitterCard,
        diag.canonical,
        diag.robots,
      ].filter((d) => d.status !== "green").length,
      passCount: [
        diag.title,
        diag.description,
        diag.ogTags,
        diag.ogImage,
        diag.twitterCard,
        diag.canonical,
        diag.robots,
      ].filter((d) => d.status === "green").length,
    },
    diagnostics: {
      title: {
        status: diag.title.status,
        message: diag.title.message,
        value: tags.title,
        charCount: tags.title?.length,
        limit: 60,
      },
      description: {
        status: diag.description.status,
        message: diag.description.message,
        value: tags.description,
        charCount: tags.description?.length,
        limit: 160,
      },
      canonical: {
        status: diag.canonical.status,
        message: diag.canonical.message,
        value: tags.canonical,
      },
      robots: {
        status: diag.robots.status,
        message: diag.robots.message,
        value: tags.robots,
      },
      ogTags: { status: diag.ogTags.status, message: diag.ogTags.message },
      ogImage: {
        status: diag.ogImage.status,
        message: diag.ogImage.message,
        value: tags.og?.image,
      },
      twitterCard: {
        status: diag.twitterCard.status,
        message: diag.twitterCard.message,
      },
    },
    metaTags: {
      basic: {
        title: tags.title,
        description: tags.description,
        canonical: tags.canonical,
        robots: tags.robots,
        viewport: tags.viewport,
        themeColor: tags.themeColor,
        favicon: tags.favicon,
        author: tags.author,
        keywords: tags.keywords,
        language: tags.language,
        generator: tags.generator,
      },
      openGraph: {
        title: tags.og?.title,
        description: tags.og?.description,
        type: tags.og?.type,
        url: tags.og?.url,
        image: tags.og?.image,
        imageAlt: tags.og?.imageAlt,
        imageWidth: tags.og?.imageWidth,
        imageHeight: tags.og?.imageHeight,
        imageType: tags.og?.imageType,
        siteName: tags.og?.siteName,
        locale: tags.og?.locale,
        updatedTime: tags.og?.updatedTime,
        video: tags.og?.video,
        audio: tags.og?.audio,
      },
      twitter: {
        card: tags.twitter?.card,
        site: tags.twitter?.site,
        creator: tags.twitter?.creator,
        title: tags.twitter?.title,
        description: tags.twitter?.description,
        image: tags.twitter?.image,
        imageAlt: tags.twitter?.imageAlt,
        label1: tags.twitter?.label1,
        data1: tags.twitter?.data1,
        label2: tags.twitter?.label2,
        data2: tags.twitter?.data2,
      },
      facebook: {
        appId: tags.facebook?.appId,
        admins: tags.facebook?.admins,
      },
      article: {
        author: tags.article?.author,
        publishedTime: tags.article?.publishedTime,
        modifiedTime: tags.article?.modifiedTime,
        section: tags.article?.section,
        tags: tags.article?.tags,
      },
      pinterest: {
        description: tags.pinterest?.description,
      },
      apple: {
        mobileWebAppCapable: tags.apple?.mobileWebAppCapable,
        mobileWebAppTitle: tags.apple?.mobileWebAppTitle,
        mobileWebAppStatusBarStyle: tags.apple?.mobileWebAppStatusBarStyle,
        touchIcon: tags.apple?.touchIcon,
      },
      microsoft: {
        tileImage: tags.microsoft?.tileImage,
        tileColor: tags.microsoft?.tileColor,
      },
      structuredData: tags.structuredData,
    },
    aiReadiness: aiResult.value
      ? {
          verdict: aiResult.value.verdict,
          checks: aiResult.value.checks.map((c) => ({
            id: c.id,
            label: c.label,
            status: c.status,
            message: c.message,
            suggestion: c.suggestion || null,
          })),
        }
      : null,
  };
};

const exportAsJson = () => {
  const data = generateExportData();
  if (!data) return;

  const json = JSON.stringify(data, null, 2);
  const filename = `metapeek-results-${
    new Date().toISOString().split("T")[0]
  }.json`;
  downloadFile(json, filename, "application/json");
};

const generateMarkdownContent = () => {
  const data = generateExportData();
  if (!data) return null;

  const tags = parsedTags.value!;
  const diag = diagnostics.value!;
  const originalHtml = extractHeadSection();

  const statusEmoji = (status: string) =>
    status === "green" ? "✅" : status === "yellow" ? "⚠️" : "❌";

  let md = `# MetaPeek Analysis Results

**Exported:** ${new Date().toLocaleString()}
**Tool:** MetaPeek by ICJIA (https://metapeek.icjia.app)
**Source:** HTML paste (URL fetch coming in Phase 2)

---

## Overall Score

**Score:** ${data.score?.overall || "N/A"}/100
**Grade:** ${data.score?.grade || "N/A"}
**Issues:** ${data.score?.totalIssues || 0}

${data.score?.overall === 100 ? "🎉 **Perfect score!** Your meta tags are fully optimized." : data.score && data.score.overall >= 90 ? "✅ **Excellent!** Just a few minor improvements possible." : data.score && data.score.overall >= 80 ? "👍 **Good work!** Some areas could use improvement." : data.score && data.score.overall >= 70 ? "⚠️ **Decent**, but several issues need attention." : data.score && data.score.overall >= 60 ? "⚠️ **Needs work.** Multiple critical issues found." : "❌ **Significant improvements needed** for proper social sharing."}

---

## Summary

**Overall Status:** ${statusEmoji(diag.overall.status)} ${diag.overall.message}
**Checks Passed:** ${data.summary.passCount}/7
**Issues Found:** ${data.summary.issueCount}
${diag.overall.suggestion ? `\n**Suggestion:** ${diag.overall.suggestion}` : ""}

---

## Score Breakdown

${
  data.score
    ? `
| Category | Score | Weight | Status |
|----------|-------|--------|--------|
${data.score.categories
  .map(
    (cat) =>
      `| ${cat.name} | ${cat.score}/${cat.maxScore} | ${cat.weight}% | ${statusEmoji(cat.status === "pass" ? "green" : cat.status === "warning" ? "yellow" : "red")} |`,
  )
  .join("\n")}

### How the Score is Calculated

Your overall score (${data.score.overall}/100) is a weighted average of seven category scores:

- **Scoring:** Green status = 100 points, Yellow = 60 points, Red = 0 points
- **Weights:** Open Graph (25%), OG Image (20%), Title (15%), Description (15%), Canonical (10%), Twitter (10%), Robots (5%)
- **Grades:** A (90-100), B (80-89), C (70-79), D (60-69), F (0-59)

Open Graph tags and images are weighted most heavily because they directly control how your links appear on social media platforms.
`
    : "Score calculation not available."
}

---

## Diagnostic Results

| Check | Status | Details |
|-------|--------|---------|
| Title | ${statusEmoji(diag.title.status)} | ${diag.title.message} |
| Description | ${statusEmoji(diag.description.status)} | ${
    diag.description.message
  } |
| Open Graph | ${statusEmoji(diag.ogTags.status)} | ${diag.ogTags.message} |
| OG Image | ${statusEmoji(diag.ogImage.status)} | ${diag.ogImage.message} |
| X/Twitter Card | ${statusEmoji(diag.twitterCard.status)} | ${
    diag.twitterCard.message
  } |
| Canonical URL | ${statusEmoji(diag.canonical.status)} | ${
    diag.canonical.message
  } |
| Robots | ${statusEmoji(diag.robots.status)} | ${diag.robots.message} |

---

## Basic Meta Tags

| Tag | Value |
|-----|-------|
| Title | ${tags.title || "(not set)"} |
| Title Length | ${tags.title?.length || 0}/60 characters |
| Description | ${tags.description || "(not set)"} |
| Description Length | ${tags.description?.length || 0}/160 characters |
| Canonical URL | ${tags.canonical || "(not set)"} |
| Robots | ${tags.robots || "(not set)"} |
${tags.author ? `| Author | ${tags.author} |` : ""}
${tags.keywords ? `| Keywords | ${tags.keywords} |` : ""}
${tags.language ? `| Language | ${tags.language} |` : ""}
${tags.viewport ? `| Viewport | ${tags.viewport} |` : ""}
${tags.themeColor ? `| Theme Color | ${tags.themeColor} |` : ""}
${tags.favicon ? `| Favicon | ${tags.favicon} |` : ""}

---

## Open Graph Tags

| Property | Value |
|----------|-------|
| og:title | ${tags.og?.title || "(not set)"} |
| og:description | ${tags.og?.description || "(not set)"} |
| og:type | ${tags.og?.type || "(not set)"} |
| og:url | ${tags.og?.url || "(not set)"} |
| og:image | ${tags.og?.image || "(not set)"} |
${tags.og?.imageAlt ? `| og:image:alt | ${tags.og.imageAlt} |` : ""}
${tags.og?.imageWidth ? `| og:image:width | ${tags.og.imageWidth} |` : ""}
${tags.og?.imageHeight ? `| og:image:height | ${tags.og.imageHeight} |` : ""}
${tags.og?.siteName ? `| og:site_name | ${tags.og.siteName} |` : ""}
${tags.og?.locale ? `| og:locale | ${tags.og.locale} |` : ""}
${tags.og?.updatedTime ? `| og:updated_time | ${tags.og.updatedTime} |` : ""}

---

## X/Twitter Card Tags

| Property | Value |
|----------|-------|
| twitter:card | ${tags.twitter?.card || "(not set)"} |
| twitter:site | ${tags.twitter?.site || "(not set)"} |
${tags.twitter?.creator ? `| twitter:creator | ${tags.twitter.creator} |` : ""}
${tags.twitter?.title ? `| twitter:title | ${tags.twitter.title} |` : ""}
${
  tags.twitter?.description
    ? `| twitter:description | ${tags.twitter.description} |`
    : ""
}
${tags.twitter?.image ? `| twitter:image | ${tags.twitter.image} |` : ""}
${
  tags.twitter?.imageAlt
    ? `| twitter:image:alt | ${tags.twitter.imageAlt} |`
    : ""
}
${tags.twitter?.label1 ? `| twitter:label1 | ${tags.twitter.label1} |` : ""}
${tags.twitter?.data1 ? `| twitter:data1 | ${tags.twitter.data1} |` : ""}
`;

  // Add Facebook section if present
  if (tags.facebook?.appId || tags.facebook?.admins) {
    md += `
---

## Facebook Tags

| Property | Value |
|----------|-------|
${tags.facebook?.appId ? `| fb:app_id | ${tags.facebook.appId} |` : ""}
${tags.facebook?.admins ? `| fb:admins | ${tags.facebook.admins} |` : ""}
`;
  }

  // Add Article section if present
  if (
    tags.article?.author ||
    tags.article?.publishedTime ||
    tags.article?.section
  ) {
    md += `
---

## Article Metadata

| Property | Value |
|----------|-------|
${tags.article?.author ? `| article:author | ${tags.article.author} |` : ""}
${
  tags.article?.publishedTime
    ? `| article:published_time | ${tags.article.publishedTime} |`
    : ""
}
${
  tags.article?.modifiedTime
    ? `| article:modified_time | ${tags.article.modifiedTime} |`
    : ""
}
${tags.article?.section ? `| article:section | ${tags.article.section} |` : ""}
${
  tags.article?.tags?.length
    ? `| article:tag | ${tags.article.tags.join(", ")} |`
    : ""
}
`;
  }

  // Add Structured Data if present
  if (tags.structuredData?.length) {
    md += `
---

## Structured Data (JSON-LD)

Found ${tags.structuredData.length} schema(s):

`;
    tags.structuredData.forEach((schema, i) => {
      md += `### Schema ${i + 1}: ${schema["@type"] || "Unknown"}

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

`;
    });
  }

  md += `
---

## Issues to Fix

`;

  // List issues
  const issues: string[] = [];
  if (diag.title.status === "red")
    issues.push(`- ❌ **Title:** ${diag.title.message}`);
  if (diag.title.status === "yellow")
    issues.push(`- ⚠️ **Title:** ${diag.title.message}`);
  if (diag.description.status === "red")
    issues.push(`- ❌ **Description:** ${diag.description.message}`);
  if (diag.description.status === "yellow")
    issues.push(`- ⚠️ **Description:** ${diag.description.message}`);
  if (diag.ogTags.status === "red")
    issues.push(`- ❌ **Open Graph:** ${diag.ogTags.message}`);
  if (diag.ogTags.status === "yellow")
    issues.push(`- ⚠️ **Open Graph:** ${diag.ogTags.message}`);
  if (diag.ogImage.status === "red")
    issues.push(`- ❌ **OG Image:** ${diag.ogImage.message}`);
  if (diag.ogImage.status === "yellow")
    issues.push(`- ⚠️ **OG Image:** ${diag.ogImage.message}`);
  if (diag.twitterCard.status === "red")
    issues.push(`- ❌ **X/Twitter:** ${diag.twitterCard.message}`);
  if (diag.twitterCard.status === "yellow")
    issues.push(`- ⚠️ **X/Twitter:** ${diag.twitterCard.message}`);
  if (diag.canonical.status === "red")
    issues.push(`- ❌ **Canonical:** ${diag.canonical.message}`);
  if (diag.canonical.status === "yellow")
    issues.push(`- ⚠️ **Canonical:** ${diag.canonical.message}`);

  if (issues.length === 0) {
    md += `✅ No issues found! All meta tags are properly configured.\n`;
  } else {
    md += issues.join("\n") + "\n";
  }

  // Add AI Readiness section if available
  if (aiResult.value) {
    const ai = aiResult.value;
    const verdictLabel =
      ai.verdict === "ready"
        ? "AI Ready"
        : ai.verdict === "partial"
          ? "Partially AI Ready"
          : "Not AI Ready";
    const verdictEmoji =
      ai.verdict === "ready" ? "✅" : ai.verdict === "partial" ? "⚠️" : "❌";
    const aiStatusEmoji = (s: string) =>
      s === "pass" ? "✅" : s === "warn" ? "⚠️" : s === "fail" ? "❌" : "➖";

    md += `
---

## AI Readiness Assessment

${verdictEmoji} **Verdict: ${verdictLabel}**

*This assessment does not affect the meta tag quality score above.*

| Check | Status | Details |
|-------|--------|---------|
${ai.checks.map((c) => `| ${c.label} | ${aiStatusEmoji(c.status)} | ${c.message} |`).join("\n")}

`;

    const aiIssues = ai.checks.filter(
      (c) => c.status === "fail" || c.status === "warn",
    );
    if (aiIssues.length > 0) {
      md += `### AI Readiness Suggestions\n\n`;
      for (const check of aiIssues) {
        if (check.suggestion) {
          md += `- **${check.label}:** ${check.suggestion}\n`;
        }
      }
      md += "\n";
    }
  }

  md += `
---

## Original HTML Source

The following HTML was analyzed:

\`\`\`html
${originalHtml}
\`\`\`

---

*Generated by [MetaPeek](https://metapeek.icjia.app) - Open Graph & Social Sharing Meta Tag Analyzer*
`;

  return md;
};

const exportAsMarkdown = () => {
  const md = generateMarkdownContent();
  if (!md) return;
  const filename = `metapeek-results-${
    new Date().toISOString().split("T")[0]
  }.md`;
  downloadFile(md, filename, "text/markdown");
};

const copyMarkdownToClipboard = () => {
  const md = generateMarkdownContent();
  if (!md) return;
  copyToClipboard(md, "markdown");
};

const copyJsonToClipboard = () => {
  const data = generateExportData();
  if (!data) return;
  const json = JSON.stringify(data, null, 2);
  copyToClipboard(json, "json");
};

/**
 * Generates markdown content for AI assistants (ChatGPT, Claude, etc.).
 * Includes score summary and per-category issue list.
 * @returns Markdown string or empty if no analysis
 */
const generateLlmIssuesContent = (): string => {
  if (!metaScore.value || !diagnostics.value) return "";

  const score = metaScore.value;

  // AI assessment (preface)
  let assessment = "";
  if (score.totalIssues === 0) {
    assessment = `## AI Assessment

Your meta tag configuration received a score of ${score.overall}/100 (Grade: ${score.grade}). All meta tags are properly configured. Your links will display correctly when shared on social media platforms. No changes are required.

## Specific Issues to Fix

None. All checks passed.`;
  } else {
    const severity =
      score.overall >= 90
        ? "mostly minor"
        : score.overall >= 70
          ? "moderate"
          : score.overall >= 50
            ? "significant"
            : "critical";
    assessment = `## AI Assessment

Based on the MetaPeek analysis, your meta tag configuration received a score of ${score.overall}/100 (Grade: ${score.grade}). There are ${score.totalIssues} ${score.totalIssues === 1 ? "issue" : "issues"} that ${severity === "critical" ? "require" : "would benefit from"} attention. These affect how your links appear when shared on Facebook, LinkedIn, X (Twitter), WhatsApp, Slack, iMessage, and in Google search results.

Address each item below to improve your social sharing previews and SEO. The issues are ordered by impact (Open Graph and image tags have the highest weight).

## Specific Issues to Fix

`;
  }

  // Specific issues (from categories with issues)
  const issuesList: string[] = [];
  for (const [_key, category] of Object.entries(score.categories)) {
    for (const issue of category.issues) {
      issuesList.push(`- **${category.name}:** ${issue}`);
    }
  }

  return (
    assessment +
    (issuesList.length > 0 ? issuesList.join("\n") + "\n" : "")
  );
};

const copyLlmIssuesToClipboard = () => {
  const content = generateLlmIssuesContent();
  if (!content) return;
  copyToClipboard(content, "llm-issues");
};

/**
 * Downloads LLM issues content as file.
 * @param format - "md" for markdown, "txt" for plain text
 */
const downloadLlmIssuesAs = (format: "md" | "txt") => {
  const content = generateLlmIssuesContent();
  if (!content) return;
  const ext = format === "md" ? ".md" : ".txt";
  const mime = format === "md" ? "text/markdown" : "text/plain";
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `metapeek-ai-assist${ext}`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Generates LLM-ready text summarizing the AI readiness assessment.
 * Includes verdict, all check results, and actionable suggestions.
 */
const generateAiReadinessLlmContent = (): string => {
  if (!aiResult.value) return "";

  const result = aiResult.value;
  const verdictLabel =
    result.verdict === "ready"
      ? "AI Ready"
      : result.verdict === "partial"
        ? "Partially AI Ready"
        : "Not AI Ready";

  const statusEmoji = (s: string) =>
    s === "pass" ? "PASS" : s === "warn" ? "WARN" : s === "fail" ? "FAIL" : "N/A";

  let content = `# AI Readiness Assessment

**Verdict:** ${verdictLabel}

This assessment evaluates how well the page is prepared for AI systems (ChatGPT, Claude, Perplexity, Bing Copilot, etc.) to understand, cite, and link to the content. It does NOT affect the meta tag quality score.

## Check Results

`;

  for (const check of result.checks) {
    content += `### ${statusEmoji(check.status)} — ${check.label}\n`;
    content += `${check.message}\n`;
    if (check.suggestion) {
      content += `**Suggestion:** ${check.suggestion}\n`;
    }
    content += "\n";
  }

  const fails = result.checks.filter((c) => c.status === "fail");
  const warns = result.checks.filter((c) => c.status === "warn");

  if (fails.length > 0 || warns.length > 0) {
    content += `## Action Items\n\n`;
    content += `Please help me improve my page's AI readiness by addressing these issues:\n\n`;
    for (const check of [...fails, ...warns]) {
      content += `- **${check.label}:** ${check.suggestion || check.message}\n`;
    }
    content += "\n";
  } else {
    content += `## Summary\n\nAll AI readiness checks passed. The page is well-prepared for AI systems to understand and cite its content.\n`;
  }

  return content;
};

const copyAiReadinessToClipboard = () => {
  const content = generateAiReadinessLlmContent();
  if (!content) return;
  copyToClipboard(content, "ai-readiness");
};

const downloadAiReadinessAs = (format: "md" | "txt") => {
  const content = generateAiReadinessLlmContent();
  if (!content) return;
  const ext = format === "md" ? ".md" : ".txt";
  const mime = format === "md" ? "text/markdown" : "text/plain";
  downloadFile(content, `metapeek-ai-readiness${ext}`, mime);
};

const exportAsHtml = () => {
  const data = generateExportData();
  if (!data) return;

  const tags = parsedTags.value!;
  const diag = diagnostics.value!;
  const originalHtml = extractHeadSection();

  const _statusColor = (status: string) =>
    status === "green"
      ? "#10b981"
      : status === "yellow"
        ? "#f59e0b"
        : "#ef4444";
  const _statusBg = (status: string) =>
    status === "green"
      ? "#d1fae5"
      : status === "yellow"
        ? "#fef3c7"
        : "#fee2e2";
  const statusEmoji = (status: string) =>
    status === "green" ? "✅" : status === "yellow" ? "⚠️" : "❌";

  const escapeHtml = (str: string | undefined) => {
    if (!str) return "(not set)";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  const sanitizeCssColor = (color: string | undefined): string => {
    if (!color) return "transparent";
    if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
    if (/^[a-zA-Z]{1,20}$/.test(color)) return color;
    if (/^rgba?\(\s*[\d\s,./%]+\)$/.test(color)) return color;
    if (/^hsla?\(\s*[\d\s,./%deg]+\)$/.test(color)) return color;
    return "transparent";
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MetaPeek Analysis Report - ${new Date().toLocaleDateString()}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; background: #f9fafb; padding: 2rem; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 2rem; }
    .header h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    .header p { opacity: 0.9; font-size: 0.875rem; }
    .content { padding: 2rem; }
    .summary { padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; border: 2px solid; }
    .summary.green { background: #d1fae5; border-color: #10b981; }
    .summary.yellow { background: #fef3c7; border-color: #f59e0b; }
    .summary.red { background: #fee2e2; border-color: #ef4444; }
    .summary h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .stats { display: flex; gap: 2rem; margin-top: 1rem; }
    .stat { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; }
    .section { margin-bottom: 2rem; }
    .section h3 { font-size: 1.125rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e5e7eb; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; }
    td:first-child { font-weight: 500; color: #6b7280; width: 30%; }
    .status { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .status.green { background: #d1fae5; color: #065f46; }
    .status.yellow { background: #fef3c7; color: #92400e; }
    .status.red { background: #fee2e2; color: #991b1b; }
    .code-block { background: #1f2937; color: #e5e7eb; padding: 1rem; border-radius: 8px; overflow-x: auto; font-family: 'Monaco', 'Menlo', monospace; font-size: 0.75rem; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; }
    .footer { text-align: center; padding: 1.5rem; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #6b7280; }
    .value { font-family: 'Monaco', 'Menlo', monospace; font-size: 0.8rem; word-break: break-all; }
    .char-count { font-size: 0.7rem; color: #9ca3af; }
    .over-limit { color: #ef4444; font-weight: 600; }
    @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 MetaPeek Analysis Report</h1>
      <p>Generated: ${new Date().toLocaleString()} | Tool: metapeek.icjia.app</p>
    </div>
    
    <div class="content">
      ${
        data.score
          ? `
      <div class="section" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border-radius: 12px; padding: 2rem; margin-bottom: 2rem;">
        <h3 style="color: white; border: none; padding: 0; margin-bottom: 1.5rem;">📊 Overall Meta Tag Score</h3>
        <div style="display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap; gap: 2rem;">
          <div style="text-align: center;">
            <div style="font-size: 4rem; font-weight: bold; line-height: 1;">${data.score.overall}</div>
            <div style="font-size: 1.25rem; opacity: 0.9;">out of 100</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 3rem; font-weight: bold; background: rgba(255,255,255,0.2); padding: 0.5rem 1.5rem; border-radius: 12px;">
              Grade: ${data.score.grade}
            </div>
            <div style="margin-top: 1rem; font-size: 0.875rem; opacity: 0.9;">
              ${data.score.overall === 100 ? "🎉 Perfect score!" : data.score.overall >= 90 ? "✅ Excellent!" : data.score.overall >= 80 ? "👍 Good work!" : data.score.overall >= 70 ? "⚠️ Decent" : data.score.overall >= 60 ? "⚠️ Needs work" : "❌ Needs improvement"}
            </div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 2.5rem; font-weight: bold;">${data.score.totalIssues}</div>
            <div style="font-size: 0.875rem; opacity: 0.9;">${data.score.totalIssues === 1 ? "Issue" : "Issues"} Found</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>📈 Category Scores</h3>
        <table>
          <tr><th>Category</th><th>Score</th><th>Weight</th><th>Status</th></tr>
          ${data.score.categories
            .map(
              (cat) => `
            <tr>
              <td>${cat.name}</td>
              <td>${cat.score}/${cat.maxScore}</td>
              <td>${cat.weight}%</td>
              <td><span class="status ${cat.status === "pass" ? "green" : cat.status === "warning" ? "yellow" : "red"}">
                ${statusEmoji(cat.status === "pass" ? "green" : cat.status === "warning" ? "yellow" : "red")}
                ${cat.status === "pass" ? "Pass" : cat.status === "warning" ? "Warning" : "Fail"}
              </span></td>
            </tr>
          `,
            )
            .join("")}
        </table>
        <div style="margin-top: 1.5rem; padding: 1rem; background: #f9fafb; border-radius: 8px; font-size: 0.8rem; color: #6b7280;">
          <strong>How is this calculated?</strong><br>
          Your overall score (${data.score.overall}/100) is a weighted average. Green status = 100 points, Yellow = 60 points, Red = 0 points.
          Weights: Open Graph (25%), OG Image (20%), Title (15%), Description (15%), Canonical (10%), Twitter (10%), Robots (5%).
          Grades: A (90-100), B (80-89), C (70-79), D (60-69), F (0-59).
        </div>
      </div>
      `
          : ""
      }

      <div class="summary ${diag.overall.status}">
        <h2>${statusEmoji(diag.overall.status)} ${escapeHtml(diag.overall.message)}</h2>
        ${
          diag.overall.suggestion
            ? `<p style="margin-top: 0.5rem; opacity: 0.8;">${escapeHtml(diag.overall.suggestion)}</p>`
            : ""
        }
        <div class="stats">
          <div class="stat">
            <div class="stat-value" style="color: #10b981;">${
              data.summary.passCount
            }</div>
            <div class="stat-label">Passed</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: #ef4444;">${
              data.summary.issueCount
            }</div>
            <div class="stat-label">Issues</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>📋 Diagnostic Results</h3>
        <table>
          <tr><th>Check</th><th>Status</th><th>Details</th></tr>
          <tr><td>Title</td><td><span class="status ${
            diag.title.status
          }">${statusEmoji(diag.title.status)} ${
            diag.title.status === "green"
              ? "Pass"
              : diag.title.status === "yellow"
                ? "Warning"
                : "Error"
          }</span></td><td>${escapeHtml(diag.title.message)}</td></tr>
          <tr><td>Description</td><td><span class="status ${
            diag.description.status
          }">${statusEmoji(diag.description.status)} ${
            diag.description.status === "green"
              ? "Pass"
              : diag.description.status === "yellow"
                ? "Warning"
                : "Error"
          }</span></td><td>${escapeHtml(diag.description.message)}</td></tr>
          <tr><td>Open Graph</td><td><span class="status ${
            diag.ogTags.status
          }">${statusEmoji(diag.ogTags.status)} ${
            diag.ogTags.status === "green"
              ? "Pass"
              : diag.ogTags.status === "yellow"
                ? "Warning"
                : "Error"
          }</span></td><td>${escapeHtml(diag.ogTags.message)}</td></tr>
          <tr><td>OG Image</td><td><span class="status ${
            diag.ogImage.status
          }">${statusEmoji(diag.ogImage.status)} ${
            diag.ogImage.status === "green"
              ? "Pass"
              : diag.ogImage.status === "yellow"
                ? "Warning"
                : "Error"
          }</span></td><td>${escapeHtml(diag.ogImage.message)}</td></tr>
          <tr><td>X/Twitter Card</td><td><span class="status ${
            diag.twitterCard.status
          }">${statusEmoji(diag.twitterCard.status)} ${
            diag.twitterCard.status === "green"
              ? "Pass"
              : diag.twitterCard.status === "yellow"
                ? "Warning"
                : "Error"
          }</span></td><td>${escapeHtml(diag.twitterCard.message)}</td></tr>
          <tr><td>Canonical URL</td><td><span class="status ${
            diag.canonical.status
          }">${statusEmoji(diag.canonical.status)} ${
            diag.canonical.status === "green"
              ? "Pass"
              : diag.canonical.status === "yellow"
                ? "Warning"
                : "Error"
          }</span></td><td>${escapeHtml(diag.canonical.message)}</td></tr>
          <tr><td>Robots</td><td><span class="status ${
            diag.robots.status
          }">${statusEmoji(diag.robots.status)} ${
            diag.robots.status === "green"
              ? "Pass"
              : diag.robots.status === "yellow"
                ? "Warning"
                : "Error"
          }</span></td><td>${escapeHtml(diag.robots.message)}</td></tr>
        </table>
      </div>
      
      <div class="section">
        <h3>📝 Basic Meta Tags</h3>
        <table>
          <tr><td>Title</td><td><span class="value">${escapeHtml(
            tags.title,
          )}</span> <span class="char-count ${
            (tags.title?.length || 0) > 60 ? "over-limit" : ""
          }">(${tags.title?.length || 0}/60 chars)</span></td></tr>
          <tr><td>Description</td><td><span class="value">${escapeHtml(
            tags.description,
          )}</span> <span class="char-count ${
            (tags.description?.length || 0) > 160 ? "over-limit" : ""
          }">(${tags.description?.length || 0}/160 chars)</span></td></tr>
          <tr><td>Canonical URL</td><td><span class="value">${escapeHtml(
            tags.canonical,
          )}</span></td></tr>
          <tr><td>Robots</td><td><span class="value">${escapeHtml(
            tags.robots,
          )}</span></td></tr>
          ${
            tags.author
              ? `<tr><td>Author</td><td><span class="value">${escapeHtml(
                  tags.author,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.keywords
              ? `<tr><td>Keywords</td><td><span class="value">${escapeHtml(
                  tags.keywords,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.viewport
              ? `<tr><td>Viewport</td><td><span class="value">${escapeHtml(
                  tags.viewport,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.themeColor
              ? `<tr><td>Theme Color</td><td><span style="display:inline-block;width:16px;height:16px;background:${
                  sanitizeCssColor(tags.themeColor)
                };border:1px solid #ccc;border-radius:3px;vertical-align:middle;margin-right:8px;"></span><span class="value">${escapeHtml(
                  tags.themeColor,
                )}</span></td></tr>`
              : ""
          }
        </table>
      </div>
      
      <div class="section">
        <h3>🌐 Open Graph Tags</h3>
        <table>
          <tr><td>og:title</td><td><span class="value">${escapeHtml(
            tags.og?.title,
          )}</span></td></tr>
          <tr><td>og:description</td><td><span class="value">${escapeHtml(
            tags.og?.description,
          )}</span></td></tr>
          <tr><td>og:type</td><td><span class="value">${escapeHtml(
            tags.og?.type,
          )}</span></td></tr>
          <tr><td>og:url</td><td><span class="value">${escapeHtml(
            tags.og?.url,
          )}</span></td></tr>
          <tr><td>og:image</td><td><span class="value">${escapeHtml(
            tags.og?.image,
          )}</span></td></tr>
          ${
            tags.og?.imageAlt
              ? `<tr><td>og:image:alt</td><td><span class="value">${escapeHtml(
                  tags.og.imageAlt,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.og?.imageWidth
              ? `<tr><td>og:image:width</td><td><span class="value">${escapeHtml(
                  tags.og.imageWidth,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.og?.imageHeight
              ? `<tr><td>og:image:height</td><td><span class="value">${escapeHtml(
                  tags.og.imageHeight,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.og?.siteName
              ? `<tr><td>og:site_name</td><td><span class="value">${escapeHtml(
                  tags.og.siteName,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.og?.locale
              ? `<tr><td>og:locale</td><td><span class="value">${escapeHtml(
                  tags.og.locale,
                )}</span></td></tr>`
              : ""
          }
        </table>
      </div>
      
      <div class="section">
        <h3>🐦 X/Twitter Card Tags</h3>
        <table>
          <tr><td>twitter:card</td><td><span class="value">${escapeHtml(
            tags.twitter?.card,
          )}</span></td></tr>
          <tr><td>twitter:site</td><td><span class="value">${escapeHtml(
            tags.twitter?.site,
          )}</span></td></tr>
          ${
            tags.twitter?.creator
              ? `<tr><td>twitter:creator</td><td><span class="value">${escapeHtml(
                  tags.twitter.creator,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.twitter?.title
              ? `<tr><td>twitter:title</td><td><span class="value">${escapeHtml(
                  tags.twitter.title,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.twitter?.description
              ? `<tr><td>twitter:description</td><td><span class="value">${escapeHtml(
                  tags.twitter.description,
                )}</span></td></tr>`
              : ""
          }
          ${
            tags.twitter?.image
              ? `<tr><td>twitter:image</td><td><span class="value">${escapeHtml(
                  tags.twitter.image,
                )}</span></td></tr>`
              : ""
          }
        </table>
      </div>
      
      ${
        tags.structuredData?.length
          ? `
      <div class="section">
        <h3>📊 Structured Data (JSON-LD)</h3>
        <p style="margin-bottom: 1rem; color: #6b7280;">Found ${
          tags.structuredData.length
        } schema(s)</p>
        ${tags.structuredData
          .map(
            (schema, i) => `
          <p style="font-weight: 600; margin-bottom: 0.5rem;">Schema ${
            i + 1
          }: ${escapeHtml(String(schema["@type"] || "Unknown"))}</p>
          <pre class="code-block">${escapeHtml(
            JSON.stringify(schema, null, 2),
          )}</pre>
        `,
          )
          .join("")}
      </div>
      `
          : ""
      }
      
      ${
        aiResult.value
          ? `
      <div class="section">
        <h3>🤖 AI Readiness Assessment</h3>
        <div style="padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border: 2px dashed #8b5cf6; background: #f5f3ff;">
          <p style="font-weight: 600; color: #6d28d9; margin-bottom: 0.25rem;">
            ${aiResult.value.verdict === "ready" ? "✅ AI Ready" : aiResult.value.verdict === "partial" ? "⚠️ Partially AI Ready" : "❌ Not AI Ready"}
          </p>
          <p style="font-size: 0.75rem; color: #7c3aed;">Informational only — does not impact meta tag quality score.</p>
        </div>
        <table>
          <tr><th>Check</th><th>Status</th><th>Details</th></tr>
          ${aiResult.value.checks
            .map(
              (c) => `
            <tr>
              <td>${escapeHtml(c.label)}</td>
              <td><span class="status ${c.status === "pass" ? "green" : c.status === "warn" ? "yellow" : c.status === "fail" ? "red" : ""}" style="${c.status === "na" ? "background:#f3f4f6;color:#6b7280;" : ""}">
                ${c.status === "pass" ? "✅ Pass" : c.status === "warn" ? "⚠️ Warn" : c.status === "fail" ? "❌ Fail" : "➖ N/A"}
              </span></td>
              <td>${escapeHtml(c.message)}${c.suggestion ? `<br><span style="font-size:0.75rem;color:#6b7280;">${escapeHtml(c.suggestion)}</span>` : ""}</td>
            </tr>`,
            )
            .join("")}
        </table>
      </div>
      `
          : ""
      }

      <div class="section">
        <h3>📄 Original HTML Source</h3>
        <pre class="code-block">${escapeHtml(originalHtml)}</pre>
      </div>
    </div>

    <div class="footer">
      Generated by <strong>MetaPeek</strong> — Open Graph & Social Sharing Meta Tag Analyzer<br>
      <a href="https://metapeek.icjia.app" style="color: #3b82f6;">metapeek.icjia.app</a> | 
      Built by <a href="https://icjia.illinois.gov" style="color: #3b82f6;">ICJIA</a>
    </div>
  </div>
</body>
</html>`;

  const filename = `metapeek-report-${
    new Date().toISOString().split("T")[0]
  }.html`;
  downloadFile(html, filename, "text/html");
};
</script>

<template>
  <div
    class="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100"
  >
    <!-- Skip link for keyboard users -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <!-- Header -->
    <header
      class="sticky top-0 z-50 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800"
    >
      <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <div class="flex items-center justify-between h-20 sm:h-24">
          <div class="flex items-center gap-4">
            <img
              src="~/assets/images/icjia-logo.png"
              alt="ICJIA Logo"
              class="h-12 sm:h-14 w-auto"
            >
            <div>
              <div class="flex items-center gap-2">
                <span class="text-2xl sm:text-3xl font-extrabold tracking-tight"
                  >MetaPeek</span
                >
                <span
                  class="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded"
                  >Beta</span
                >
              </div>
              <span
                class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block"
                >Open Graph & Social Sharing Meta Tag Analyzer</span
              >
            </div>
          </div>
          <div class="flex items-center gap-1">
            <ClientOnly>
              <button
                class="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
                :aria-label="
                  colorMode.value === 'dark'
                    ? 'Switch to light mode'
                    : 'Switch to dark mode'
                "
                @click="
                  colorMode.preference =
                    colorMode.value === 'dark' ? 'light' : 'dark'
                "
              >
                <UIcon
                  :name="
                    colorMode.value === 'dark'
                      ? 'i-heroicons-sun'
                      : 'i-heroicons-moon'
                  "
                  class="w-5 h-5 text-gray-600 dark:text-gray-400"
                  aria-hidden="true"
                />
              </button>
              <template #fallback
                ><div class="w-9 h-9" aria-hidden="true"
              /></template>
            </ClientOnly>
            <a
              href="https://github.com/ICJIA/icjia-metapeek"
              target="_blank"
              rel="noopener"
              class="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="View on GitHub"
            >
              <UIcon
                name="i-simple-icons-github"
                class="w-5 h-5 text-gray-600 dark:text-gray-400"
                aria-hidden="true"
              />
            </a>
          </div>
        </div>
      </div>
    </header>

    <main id="main-content" class="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <!-- Hero Section -->
      <div class="mb-8">
        <h1
          class="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight mb-2 text-gray-900 dark:text-white"
        >
          Open Graph &amp; Social Sharing Meta Tag Analyzer
        </h1>
        <p class="text-lg text-gray-600 dark:text-gray-300 mb-4">
          Preview how your links appear when shared on social media
        </p>

        <!-- Two-column layout on larger screens -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          <div class="space-y-2">
            <p class="text-gray-700 dark:text-gray-300">
              When you share a link on social media, platforms display a preview
              card with a title, image, and description. This comes from
              <span class="font-medium text-gray-900 dark:text-white"
                >Open Graph tags</span
              >
              in your HTML.
            </p>
            <p class="text-gray-600 dark:text-gray-400 text-sm">
              Missing or broken tags = unprofessional previews that people
              scroll past.
            </p>
          </div>
          <div class="space-y-2">
            <p class="text-gray-700 dark:text-gray-300">
              <span class="font-medium text-gray-900 dark:text-white"
                >MetaPeek</span
              >
              shows you exactly what each platform will display, diagnoses
              problems, and gives you the code to fix them.
            </p>
            <p class="text-gray-500 dark:text-gray-400 text-sm italic">
              "Peek" at your meta tags — the hidden HTML controlling your social
              presence.
            </p>
          </div>
        </div>
      </div>

      <!-- Step 1: Input Section -->
      <div
        class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-blue-50 dark:bg-blue-950/40 border-y border-blue-200 dark:border-blue-800"
      >
        <div class="flex items-center gap-4 mb-6">
          <div
            class="flex items-center justify-center w-24 h-24 rounded-full bg-blue-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-blue-200 dark:ring-blue-800"
          >
            1
          </div>
          <div class="flex-1">
            <h2
              class="text-2xl font-bold text-gray-900 dark:text-white block mb-2"
            >
              Analyze Your Meta Tags
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Choose how you want to analyze: paste HTML directly or fetch from
              a live URL
            </p>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <UButton
              v-if="inputHtml.trim() || inputUrl.trim()"
              size="sm"
              variant="ghost"
              color="neutral"
              icon="i-heroicons-x-mark"
              @click="resetAll"
            >
              Clear
            </UButton>
            <UButton
              size="sm"
              variant="soft"
              color="primary"
              icon="i-heroicons-document-duplicate"
              @click="loadSample"
            >
              Load Example
            </UButton>
          </div>
        </div>

        <!-- Simple Mode Toggle -->
        <div class="mb-4">
          <div
            class="inline-flex rounded-lg bg-white dark:bg-gray-900 p-1 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700"
          >
            <button
              :class="[
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                inputMode === 'html'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
              ]"
              @click="inputMode = 'html'"
            >
              📋 Paste HTML
            </button>
            <button
              :class="[
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                inputMode === 'url'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
              ]"
              @click="inputMode = 'url'"
            >
              🌐 Fetch URL
            </button>
          </div>
        </div>

        <!-- HTML Paste Mode -->
        <div v-if="inputMode === 'html'" class="relative">
          <label for="html-input" class="sr-only">Paste HTML</label>
          <textarea
            id="html-input"
            v-model="inputHtml"
            rows="8"
            placeholder="Paste your <head>...</head> section here. This contains your meta tags, title, and Open Graph tags needed for analysis.

Tip: Right-click on your webpage → 'View Page Source' → Copy the <head> section"
            class="w-full px-4 py-3 rounded-xl border-0 bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 font-mono text-sm leading-relaxed placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none transition-shadow duration-150 shadow-sm"
            spellcheck="false"
          />

          <!-- Status indicator -->
          <div
            class="absolute bottom-3 right-3 flex items-center gap-3 text-xs"
          >
            <span class="text-gray-400 dark:text-gray-500 tabular-nums">
              {{ inputHtml.length.toLocaleString() }} chars
            </span>
            <span
              v-if="hasAnalyzed && inputMode === 'html'"
              class="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Analyzed
            </span>
          </div>
        </div>

        <!-- URL Fetch Mode -->
        <div v-if="inputMode === 'url'" class="space-y-4">
          <div class="relative">
            <label for="url-input" class="sr-only">Enter URL</label>
            <input
              id="url-input"
              v-model="inputUrl"
              type="url"
              placeholder="https://example.com"
              class="w-full px-4 py-3 pr-32 rounded-xl border-0 bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-shadow duration-150 shadow-sm"
              @keyup.enter="handleFetchUrl"
            >
            <div class="absolute right-2 top-1/2 -translate-y-1/2">
              <UButton
                :disabled="
                  !inputUrl.trim() ||
                  fetchStatus.state.value.status === 'fetching'
                "
                size="sm"
                color="primary"
                :loading="fetchStatus.state.value.status === 'fetching'"
                @click="handleFetchUrl"
              >
                {{
                  fetchStatus.state.value.status === "fetching"
                    ? "Fetching..."
                    : "Fetch"
                }}
              </UButton>
            </div>
          </div>

          <!-- Status Bar (during fetch) -->
          <div
            v-if="
              fetchStatus.state.value.status === 'fetching' &&
              fetchStatus.statusMessage.value
            "
            role="status"
            aria-live="polite"
            :class="[
              'flex items-center justify-between px-4 py-3 rounded-lg text-sm',
              fetchStatus.statusMessage.value.tone === 'neutral' &&
                'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
              fetchStatus.statusMessage.value.tone === 'amber' &&
                'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
              fetchStatus.statusMessage.value.tone === 'red' &&
                'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
            ]"
          >
            <span>{{ fetchStatus.statusMessage.value.message }}</span>
            <span class="font-mono"
              >{{ (fetchStatus.elapsedTime.value / 1000).toFixed(1) }}s</span
            >
          </div>

          <!-- Error State -->
          <div
            v-if="fetchStatus.state.value.status === 'error'"
            role="alert"
            class="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800"
          >
            <p class="font-medium text-red-900 dark:text-red-100 mb-1">
              {{ fetchStatus.state.value.message }}
            </p>
            <p class="text-sm text-red-700 dark:text-red-300">
              {{ fetchStatus.state.value.suggestion }}
            </p>
          </div>

          <!-- Success State -->
          <div
            v-if="fetchStatus.state.value.status === 'complete'"
            role="status"
            class="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-sm"
          >
            <UIcon name="i-heroicons-check-circle" class="w-5 h-5" />
            <span>Fetched in {{ fetchStatus.state.value.timing }}ms</span>
          </div>
        </div>

      </div>

      <!-- Step 2: Image Analysis - Right after Step 1 -->
      <div
        v-if="parsedTags && diagnostics"
        class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-purple-50 dark:bg-purple-950/40 border-y border-purple-200 dark:border-purple-800"
      >
        <div class="flex items-center gap-4 mb-6">
          <div
            class="flex items-center justify-center w-24 h-24 rounded-full bg-purple-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-purple-200 dark:ring-purple-800"
          >
            2
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              Image Size Check
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Will your og:image display correctly on each platform?
            </p>
          </div>
        </div>
        <ImageAnalysis
          :image-url="parsedTags.og.image"
          @analysis-complete="handleImageAnalysisComplete"
        />
      </div>

      <!-- Step 3: Platform Previews -->
      <div
        v-if="parsedTags && diagnostics"
        class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-emerald-50 dark:bg-emerald-950/40 border-y border-emerald-200 dark:border-emerald-800"
      >
        <div class="flex items-center gap-4 mb-6">
          <div
            class="flex items-center justify-center w-24 h-24 rounded-full bg-emerald-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-emerald-200 dark:ring-emerald-800"
          >
            3
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              Platform Preview
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              See exactly how your links will appear when shared
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PreviewGoogle
            :title="parsedTags.og.title || parsedTags.title"
            :description="parsedTags.og.description || parsedTags.description"
            :url="parsedTags.og.url || parsedTags.canonical"
          />
          <PreviewFacebook
            :title="parsedTags.og.title"
            :description="parsedTags.og.description"
            :image="parsedTags.og.image"
          />
          <PreviewLinkedIn
            :title="parsedTags.og.title"
            :description="parsedTags.og.description"
            :image="parsedTags.og.image"
          />
          <PreviewTwitter
            :card="parsedTags.twitter.card"
            :title="parsedTags.twitter.title || parsedTags.og.title"
            :description="
              parsedTags.twitter.description || parsedTags.og.description
            "
            :image="parsedTags.twitter.image || parsedTags.og.image"
          />
          <PreviewWhatsApp
            :title="parsedTags.og.title || parsedTags.title"
            :description="parsedTags.og.description || parsedTags.description"
            :image="parsedTags.og.image"
            :url="parsedTags.og.url || parsedTags.canonical"
          />
          <PreviewSlack
            :title="parsedTags.og.title || parsedTags.title"
            :description="parsedTags.og.description || parsedTags.description"
            :image="parsedTags.og.image"
            :favicon="resolvedFavicon"
            :url="parsedTags.og.url || parsedTags.canonical"
          />
          <PreviewiMessage
            :title="parsedTags.og.title || parsedTags.title"
            :description="parsedTags.og.description || parsedTags.description"
            :image="parsedTags.og.image"
            :url="parsedTags.og.url || parsedTags.canonical"
          />
        </div>
      </div>

      <!-- Step 4: Diagnostics & Code -->
      <div
        v-if="parsedTags && diagnostics"
        :class="[
          '-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 border-y',
          diagnostics.overall.status === 'red'
            ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
            : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
        ]"
      >
        <div class="flex items-center gap-4 mb-6">
          <div
            :class="[
              'flex items-center justify-center w-24 h-24 rounded-full text-white font-extrabold text-5xl shadow-xl ring-4',
              diagnostics.overall.status === 'red'
                ? 'bg-red-600 ring-red-200 dark:ring-red-800'
                : 'bg-emerald-600 ring-emerald-200 dark:ring-emerald-800',
            ]"
          >
            4
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              Meta Results and Suggestions
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Review diagnostics and get corrected HTML to copy
            </p>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div
          :class="[
            'border-b mb-6',
            diagnostics.overall.status === 'red'
              ? 'border-red-200 dark:border-red-800'
              : 'border-emerald-200 dark:border-emerald-800',
          ]"
        >
          <nav class="flex gap-6" aria-label="Results tabs">
            <button
              v-for="tab in tabs.filter((t) => t.value !== 'previews')"
              :key="tab.value"
              :class="[
                'flex items-center gap-2 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.value
                  ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
              ]"
              @click="activeTab = tab.value"
            >
              <UIcon :name="tab.icon" class="w-4 h-4" />
              {{ tab.label }}
              <UBadge
                v-if="tab.value === 'diagnostics'"
                :color="
                  diagnostics.overall.status === 'green'
                    ? 'success'
                    : diagnostics.overall.status === 'yellow'
                      ? 'warning'
                      : 'error'
                "
                size="xs"
                variant="subtle"
              >
                {{
                  diagnostics.overall.status === "green"
                    ? "✓"
                    : diagnostics.overall.status === "yellow"
                      ? "!"
                      : "✕"
                }}
              </UBadge>
            </button>
          </nav>
        </div>

        <!-- Tab Panels -->
        <div class="min-h-[300px]">
          <!-- Diagnostics Tab -->
          <div v-show="activeTab === 'diagnostics'">
            <DiagnosticsPanel :diagnostics="diagnostics" :tags="parsedTags" />
          </div>

          <!-- Code Tab -->
          <div v-show="activeTab === 'code'">
            <CodeGenerator :tags="parsedTags" />
          </div>
        </div>
      </div>

      <!-- Step 5: Overall Score -->
      <div
        v-if="parsedTags && diagnostics && metaScore"
        class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-indigo-50 dark:bg-indigo-950/40 border-y border-indigo-200 dark:border-indigo-800"
      >
        <div class="flex items-center gap-4 mb-6">
          <div
            class="flex items-center justify-center w-24 h-24 rounded-full bg-indigo-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-indigo-200 dark:ring-indigo-800"
          >
            5
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              Overall Meta Tag Score
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Comprehensive quality assessment of your meta tags
            </p>
          </div>
        </div>

        <!-- Score Card -->
        <div
          class="bg-white dark:bg-gray-900 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6 mb-6"
        >
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <!-- Score Display -->
            <div class="text-center">
              <div class="mb-4">
                <div
                  class="inline-flex items-center justify-center w-48 h-48 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-2xl"
                >
                  <div class="text-center">
                    <div class="text-7xl font-extrabold">
                      {{ metaScore.overall }}
                    </div>
                    <div class="text-xl font-medium opacity-90">/ 100</div>
                  </div>
                </div>
              </div>
              <div class="flex items-center justify-center gap-3">
                <span
                  :class="[
                    'text-4xl font-extrabold px-6 py-3 rounded-xl',
                    metaScore.grade === 'A' &&
                      'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
                    metaScore.grade === 'B' &&
                      'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
                    metaScore.grade === 'C' &&
                      'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
                    metaScore.grade === 'D' &&
                      'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
                    metaScore.grade === 'F' &&
                      'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
                  ]"
                >
                  Grade: {{ metaScore.grade }}
                </span>
              </div>
              <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
                <template v-if="metaScore.overall === 100">
                  🎉 Perfect score! Your meta tags are fully optimized.
                </template>
                <template v-else-if="metaScore.overall >= 90">
                  Excellent! Just a few minor improvements possible.
                </template>
                <template v-else-if="metaScore.overall >= 80">
                  Good work! Some areas could use improvement.
                </template>
                <template v-else-if="metaScore.overall >= 70">
                  Decent, but several issues need attention.
                </template>
                <template v-else-if="metaScore.overall >= 60">
                  Needs work. Multiple critical issues found.
                </template>
                <template v-else>
                  Significant improvements needed for proper social sharing.
                </template>
              </p>
              <!-- Low-grade SPA hint: when grade is especially low, suggest it might be an SPA -->
              <p
                v-if="metaScore && (metaScore.grade === 'D' || metaScore.grade === 'F')"
                class="mt-3 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 border border-amber-200 dark:border-amber-800"
              >
                <UIcon name="i-heroicons-light-bulb" class="inline-block w-4 h-4 mr-1 align-middle" />
                If this grade is surprisingly low, your site might be a Single-Page Application (SPA). Social platforms fetch HTML without executing JavaScript—they may see an empty page. Try pasting the HTML from your app (View Page Source in the browser after the page loads) to see what meta tags are actually available.
              </p>
            </div>

            <!-- Issues Summary -->
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                {{
                  metaScore.totalIssues === 0
                    ? "✅ No Issues Found"
                    : `⚠️ ${metaScore.totalIssues} ${metaScore.totalIssues === 1 ? "Issue" : "Issues"} to Fix`
                }}
              </h3>
              <div v-if="metaScore.totalIssues > 0" class="space-y-3">
                <template
                  v-for="(category, key) in metaScore.categories"
                  :key="key"
                >
                  <div
                    v-if="category.issues.length > 0"
                    class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <UIcon
                      :name="
                        category.status === 'fail'
                          ? 'i-heroicons-x-circle-solid'
                          : 'i-heroicons-exclamation-circle-solid'
                      "
                      :class="[
                        'w-5 h-5 flex-shrink-0 mt-0.5',
                        category.status === 'fail'
                          ? 'text-red-500'
                          : 'text-amber-500',
                      ]"
                    />
                    <div class="flex-1 min-w-0">
                      <p
                        class="font-medium text-gray-900 dark:text-white text-sm"
                      >
                        {{ category.name }}
                      </p>
                      <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {{ category.issues[0] }}
                      </p>
                    </div>
                  </div>
                </template>
              </div>
              <div
                v-else
                class="p-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-center"
              >
                <p class="text-emerald-700 dark:text-emerald-300 font-medium">
                  All meta tags are properly configured!
                </p>
                <p class="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                  Your pages will look great when shared on social media.
                </p>
              </div>

              <!-- LLM-ready copy block (Step 5) -->
              <div class="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Copy for AI assistant
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Paste this into ChatGPT, Claude, or another LLM to get help implementing fixes.
                </p>
                <pre
                  class="p-4 rounded-lg bg-gray-900 dark:bg-gray-950 text-gray-100 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-words mb-3"
                >{{ generateLlmIssuesContent() }}</pre>
                <div class="flex flex-wrap items-center gap-3">
                  <UButton
                    size="sm"
                    variant="solid"
                    color="primary"
                    icon="i-heroicons-clipboard-document"
                    @click="copyLlmIssuesToClipboard"
                  >
                    Copy to clipboard
                  </UButton>
                  <UButton
                    size="sm"
                    variant="soft"
                    color="neutral"
                    icon="i-heroicons-arrow-down-tray"
                    @click="downloadLlmIssuesAs('md')"
                  >
                    Download .md
                  </UButton>
                  <UButton
                    size="sm"
                    variant="soft"
                    color="neutral"
                    icon="i-heroicons-arrow-down-tray"
                    @click="downloadLlmIssuesAs('txt')"
                  >
                    Download .txt
                  </UButton>
                  <Transition
                    enter-active-class="transition-all duration-200 ease-out"
                    enter-from-class="opacity-0 translate-x-2"
                    enter-to-class="opacity-100 translate-x-0"
                    leave-active-class="transition-all duration-150 ease-in"
                    leave-from-class="opacity-100 translate-x-0"
                    leave-to-class="opacity-0 translate-x-2"
                  >
                    <span
                      v-if="copiedState === 'llm-issues'"
                      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-sm font-medium"
                    >
                      <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
                      Copied!
                    </span>
                  </Transition>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Category Breakdown -->
        <div
          class="bg-white dark:bg-gray-900 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6 mb-6"
        >
          <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Category Breakdown
          </h3>
          <div class="space-y-4">
            <template
              v-for="(category, key) in metaScore.categories"
              :key="key"
            >
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span
                      class="font-medium text-gray-900 dark:text-white text-sm"
                    >
                      {{ category.name }}
                    </span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      ({{ category.weight }}% weight)
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span
                      :class="[
                        'text-sm font-semibold',
                        category.status === 'pass' &&
                          'text-emerald-600 dark:text-emerald-400',
                        category.status === 'warning' &&
                          'text-amber-600 dark:text-amber-400',
                        category.status === 'fail' &&
                          'text-red-600 dark:text-red-400',
                      ]"
                    >
                      {{ category.score }}/{{ category.maxScore }}
                    </span>
                    <UIcon
                      :name="
                        category.status === 'pass'
                          ? 'i-heroicons-check-circle-solid'
                          : category.status === 'warning'
                            ? 'i-heroicons-exclamation-circle-solid'
                            : 'i-heroicons-x-circle-solid'
                      "
                      :class="[
                        'w-5 h-5',
                        category.status === 'pass' && 'text-emerald-500',
                        category.status === 'warning' && 'text-amber-500',
                        category.status === 'fail' && 'text-red-500',
                      ]"
                    />
                  </div>
                </div>
                <div
                  class="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
                >
                  <div
                    :class="[
                      'absolute left-0 top-0 h-full transition-all duration-500',
                      category.status === 'pass' && 'bg-emerald-500',
                      category.status === 'warning' && 'bg-amber-500',
                      category.status === 'fail' && 'bg-red-500',
                    ]"
                    :style="{ width: `${category.score}%` }"
                  />
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Scoring Methodology -->
        <div
          class="bg-white dark:bg-gray-900 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6"
        >
          <details class="group">
            <summary
              class="cursor-pointer list-none flex items-center justify-between font-bold text-gray-900 dark:text-white"
            >
              <span class="flex items-center gap-2">
                <UIcon name="i-heroicons-information-circle" class="w-5 h-5" />
                How is this score calculated?
              </span>
              <UIcon
                name="i-heroicons-chevron-down"
                class="w-5 h-5 transition-transform group-open:rotate-180"
              />
            </summary>
            <div
              class="mt-4 space-y-4 text-sm text-gray-700 dark:text-gray-300"
            >
              <p>
                Your overall score is a weighted average of seven category
                scores, similar to Google Lighthouse scoring. Each category is
                evaluated based on diagnostic status and assigned a weight based
                on its importance for SEO and social sharing.
              </p>

              <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h4 class="font-semibold text-gray-900 dark:text-white mb-2">
                  Scoring System:
                </h4>
                <ul class="space-y-1 text-xs">
                  <li class="flex items-center gap-2">
                    <span
                      class="w-16 h-6 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-semibold"
                      >100</span
                    >
                    <span
                      >Green status (pass) — tag is properly configured</span
                    >
                  </li>
                  <li class="flex items-center gap-2">
                    <span
                      class="w-16 h-6 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center font-semibold"
                      >60</span
                    >
                    <span
                      >Yellow status (warning) — tag exists but could be
                      improved</span
                    >
                  </li>
                  <li class="flex items-center gap-2">
                    <span
                      class="w-16 h-6 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 flex items-center justify-center font-semibold"
                      >0</span
                    >
                    <span
                      >Red status (fail) — tag is missing or critically
                      flawed</span
                    >
                  </li>
                </ul>
              </div>

              <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h4 class="font-semibold text-gray-900 dark:text-white mb-2">
                  Category Weights:
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div class="flex justify-between">
                    <span>Open Graph Tags:</span>
                    <span class="font-semibold">25%</span>
                  </div>
                  <div class="flex justify-between">
                    <span>OG Image:</span>
                    <span class="font-semibold">20%</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Title Tag:</span>
                    <span class="font-semibold">15%</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Meta Description:</span>
                    <span class="font-semibold">15%</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Canonical URL:</span>
                    <span class="font-semibold">10%</span>
                  </div>
                  <div class="flex justify-between">
                    <span>X/Twitter Card:</span>
                    <span class="font-semibold">10%</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Robots Meta:</span>
                    <span class="font-semibold">5%</span>
                  </div>
                </div>
              </div>

              <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h4 class="font-semibold text-gray-900 dark:text-white mb-2">
                  Letter Grades:
                </h4>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div
                    class="text-center p-2 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-semibold"
                  >
                    A: 90-100
                  </div>
                  <div
                    class="text-center p-2 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold"
                  >
                    B: 80-89
                  </div>
                  <div
                    class="text-center p-2 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-semibold"
                  >
                    C: 70-79
                  </div>
                  <div
                    class="text-center p-2 rounded bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 font-semibold"
                  >
                    D: 60-69
                  </div>
                  <div
                    class="text-center p-2 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 font-semibold"
                  >
                    F: 0-59
                  </div>
                </div>
              </div>

              <p class="text-xs italic">
                Open Graph tags and images are weighted most heavily because
                they directly control how your links appear on social media
                platforms. Title and description are also critical for both SEO
                and social sharing.
              </p>

              <div
                class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
              >
                <h5
                  class="font-semibold text-blue-900 dark:text-blue-100 text-xs mb-2"
                >
                  💡 Technical Detail: Trailing Slashes Matter
                </h5>
                <p class="text-xs text-blue-800 dark:text-blue-200">
                  URLs with and without trailing slashes (e.g.,
                  <code class="bg-blue-100 dark:bg-blue-800 px-1 rounded"
                    >/page</code
                  >
                  vs
                  <code class="bg-blue-100 dark:bg-blue-800 px-1 rounded"
                    >/page/</code
                  >) are treated as different pages by search engines.
                  Inconsistency between your canonical URL and og:url can split
                  ranking signals and cause duplicate content issues. MetaPeek
                  checks for this and penalizes inconsistent trailing slash
                  usage.
                </p>
              </div>
            </div>
          </details>
        </div>
      </div>

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

        <!-- LLM-ready copy block (AI Readiness) -->
        <div class="mt-6 bg-white dark:bg-gray-900 rounded-xl border border-violet-200 dark:border-violet-800 p-6">
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Copy for AI assistant
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Paste this into ChatGPT, Claude, or another LLM to get help improving your AI readiness.
          </p>
          <pre
            class="p-4 rounded-lg bg-gray-900 dark:bg-gray-950 text-gray-100 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-words mb-3"
          >{{ generateAiReadinessLlmContent() }}</pre>
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              size="sm"
              variant="solid"
              color="primary"
              icon="i-heroicons-clipboard-document"
              @click="copyAiReadinessToClipboard"
            >
              Copy to clipboard
            </UButton>
            <UButton
              size="sm"
              variant="soft"
              color="neutral"
              icon="i-heroicons-arrow-down-tray"
              @click="downloadAiReadinessAs('md')"
            >
              Download .md
            </UButton>
            <UButton
              size="sm"
              variant="soft"
              color="neutral"
              icon="i-heroicons-arrow-down-tray"
              @click="downloadAiReadinessAs('txt')"
            >
              Download .txt
            </UButton>
            <Transition
              enter-active-class="transition-all duration-200 ease-out"
              enter-from-class="opacity-0 translate-x-2"
              enter-to-class="opacity-100 translate-x-0"
              leave-active-class="transition-all duration-150 ease-in"
              leave-from-class="opacity-100 translate-x-0"
              leave-to-class="opacity-0 translate-x-2"
            >
              <span
                v-if="copiedState === 'ai-readiness'"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-sm font-medium"
              >
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
                Copied!
              </span>
            </Transition>
          </div>
        </div>
      </div>

      <!-- Step 6: Export Results -->
      <div
        v-if="parsedTags && diagnostics"
        class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-cyan-50 dark:bg-cyan-950/40 border-y border-cyan-200 dark:border-cyan-800"
      >
        <div class="flex items-center gap-4 mb-6">
          <div
            class="flex items-center justify-center w-24 h-24 rounded-full bg-cyan-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-cyan-200 dark:ring-cyan-800"
          >
            6
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              Export Results
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Save your analysis with score and recommendations
            </p>
          </div>
        </div>

        <div
          class="bg-white dark:bg-gray-900 rounded-lg border border-cyan-200 dark:border-cyan-800 p-6"
        >
          <p class="text-gray-700 dark:text-gray-300 mb-6">
            Download your meta tag analysis to share with your team, include in
            documentation, or upload to an AI assistant (ChatGPT, Claude, etc.)
            for help implementing fixes. All exports include your overall score,
            category breakdown, specific recommendations, and the original HTML
            source.
          </p>

          <!-- Download buttons -->
          <div class="mb-6">
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"
            >
              <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4" />
              Download Files
            </h3>
            <div class="flex flex-wrap gap-3">
              <AppTooltip
                text="Structured data for developers and automated tools"
                position="top"
              >
                <UButton
                  size="lg"
                  variant="solid"
                  class="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white"
                  icon="i-heroicons-code-bracket"
                  @click="exportAsJson"
                >
                  JSON
                </UButton>
              </AppTooltip>
              <AppTooltip
                text="Best for pasting into ChatGPT, Claude, or other AI assistants"
                position="top"
              >
                <UButton
                  size="lg"
                  variant="solid"
                  class="bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white"
                  icon="i-heroicons-document-text"
                  @click="exportAsMarkdown"
                >
                  Markdown
                </UButton>
              </AppTooltip>
              <AppTooltip
                text="Printable report to share with your team or stakeholders"
                position="top"
              >
                <UButton
                  size="lg"
                  variant="solid"
                  class="bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600 text-white"
                  icon="i-heroicons-globe-alt"
                  @click="exportAsHtml"
                >
                  HTML Report
                </UButton>
              </AppTooltip>
            </div>
          </div>

          <!-- Copy to clipboard buttons -->
          <div class="mb-4">
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"
            >
              <UIcon name="i-heroicons-clipboard-document" class="w-4 h-4" />
              Copy to Clipboard
            </h3>
            <div class="flex flex-wrap items-center gap-3">
              <AppTooltip
                text="Copy formatted text — ideal for pasting into AI assistants"
                position="top"
              >
                <UButton
                  size="lg"
                  variant="outline"
                  color="neutral"
                  icon="i-heroicons-clipboard-document"
                  @click="copyMarkdownToClipboard"
                >
                  Copy Markdown
                </UButton>
              </AppTooltip>
              <AppTooltip
                text="Copy structured data for use in scripts or APIs"
                position="top"
              >
                <UButton
                  size="lg"
                  variant="outline"
                  color="neutral"
                  icon="i-heroicons-clipboard-document"
                  @click="copyJsonToClipboard"
                >
                  Copy JSON
                </UButton>
              </AppTooltip>

              <!-- Copied indicator -->
              <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 translate-x-2"
                enter-to-class="opacity-100 translate-x-0"
                leave-active-class="transition-all duration-150 ease-in"
                leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0 translate-x-2"
              >
                <span
                  v-if="copiedState"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-sm font-medium"
                >
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
                  {{
                    copiedState === "llm-issues"
                      ? "Issues copied!"
                      : copiedState === "markdown"
                        ? "Markdown copied!"
                        : "JSON copied!"
                  }}
                </span>
              </Transition>
            </div>
          </div>

          <p
            class="text-xs text-gray-500 dark:text-gray-400 mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <strong>💡 Tip:</strong> The Markdown format is ideal for pasting
            into LLMs — it includes all diagnostic details, current values,
            issues, and the original HTML source in a structured format that AI
            assistants can easily understand and act on.
          </p>

          <!-- Raw HTML Debug (collapsible) -->
          <details class="mt-6 group">
            <summary
              class="cursor-pointer list-none flex items-center justify-between font-medium text-gray-700 dark:text-gray-300 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <span class="flex items-center gap-2">
                <UIcon name="i-heroicons-bug-ant" class="w-4 h-4" />
                Raw HTML debug
              </span>
              <UIcon
                name="i-heroicons-chevron-down"
                class="w-5 h-5 transition-transform group-open:rotate-180"
              />
            </summary>
            <div class="mt-2 p-3 rounded-lg bg-gray-900 dark:bg-gray-950 border border-gray-700">
              <p class="text-xs text-gray-400 mb-2">
                The actual <code>&lt;head&gt;</code> content that was parsed. Useful for debugging when results seem wrong.
              </p>
              <pre
                class="text-xs font-mono text-gray-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all"
              >{{ rawHeadHtml }}</pre>
            </div>
          </details>

          <!-- Reset button -->
          <div
            class="mt-8 pt-6 -mx-6 px-6 pb-6 border-t-2 border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/40 rounded-b-lg flex flex-col items-center text-center"
          >
            <UButton
              size="xl"
              variant="solid"
              icon="i-heroicons-arrow-path"
              aria-label="Reset and start over"
              class="font-semibold shadow-lg bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white"
              @click="resetAll"
            >
              Reset & Start Over
            </UButton>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Clear everything and return to the top to start a new analysis
            </p>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else
        class="flex flex-col items-center justify-center py-16 text-center"
      >
        <div
          class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5"
        >
          <UIcon name="i-heroicons-share" class="w-8 h-8 text-gray-400" />
        </div>
        <h2 class="text-lg font-semibold mb-2">
          Check how your website looks when shared
        </h2>
        <p class="text-gray-600 dark:text-gray-300 mb-3 max-w-lg">
          Paste your page's HTML above to see exactly what Facebook, LinkedIn,
          X, and other platforms will display when someone shares your link.
        </p>
        <p class="text-gray-500 dark:text-gray-400 mb-5 max-w-lg text-sm">
          MetaPeek will identify any missing or incorrect tags and provide the
          exact code needed to fix them.
          <span class="block mt-1 text-xs"
            >Not sure how to get your HTML? Right-click on your webpage and
            select "View Page Source."</span
          >
        </p>
        <UButton
          variant="soft"
          color="neutral"
          icon="i-heroicons-sparkles"
          size="md"
          @click="loadSample"
        >
          See an Example First
        </UButton>
      </div>

      <!-- Footer -->
      <footer class="mt-16 pt-6 border-t border-gray-200 dark:border-gray-800">
        <div
          class="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-gray-400"
        >
          <p>
            Built by
            <a
              href="https://icjia.illinois.gov"
              class="underline hover:text-gray-900 dark:hover:text-gray-100 transition-colors inline-block py-2"
              >ICJIA</a
            >
          </p>
          <p class="flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            No tracking · No ads · No account
          </p>
        </div>
      </footer>
    </main>
  </div>
</template>
