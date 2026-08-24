<script setup lang="ts">
/**
 * @fileoverview MetaPeek main page. Handles input (paste HTML or fetch URL),
 * analysis, previews, diagnostics, scoring, and export (JSON/MD/HTML).
 *
 * Two input modes: Paste HTML (client-side parse) or Fetch URL (server proxy).
 */

import type { MetaTags, Diagnostics } from "~/types/meta";

import type { ImageAnalysisResult } from "~/composables/useDiagnostics";
import { normalizeUrlInput } from "~/utils/urlInput";
import {
  extractHeadSection,
  buildExportData,
  buildMarkdownReport,
  buildLlmIssuesReport,
  buildAiReadinessReport,
  buildHtmlReport,
  type ExportSnapshot,
} from "~/utils/exporters";

// OG image for social sharing — a static file in public/, declared directly
// rather than through nuxt-og-image. MetaPeek never renders an OG image at
// request time, so the runtime module was pure attack surface (SSRF, reflected
// XSS, DoS advisories) and is disabled in nuxt.config.
useSeoMeta({
  ogImage: "https://metapeek.icjia.app/og-image-v2.png",
  ogImageAlt:
    "MetaPeek - Open Graph & Social Sharing Meta Tag Analyzer by ICJIA",
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageType: "image/png",
  twitterCard: "summary_large_image",
  twitterImage: "https://metapeek.icjia.app/og-image-v2.png",
  twitterImageAlt:
    "MetaPeek - Open Graph & Social Sharing Meta Tag Analyzer by ICJIA",
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
const { seoInsightsResult, assessFromHtml: assessSeoFromHtml, assessFromUrl: assessSeoFromUrl, reset: resetSeo } = useSeoInsights();

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
const inputMode = ref<"html" | "url">("url");
const inputHtml = ref("");
const inputUrl = ref("");
const httpsPrefixAdded = ref(false);
const parsedTags = ref<MetaTags | null>(null);
const diagnostics = ref<Diagnostics | null>(null);
const hasAnalyzed = ref(false);
const activeTab = ref("diagnostics");
/** Whether the last fetch result looks like an SPA (poor meta tags from static HTML) */
const showSpaHint = ref(false);
/** Whether an SPA render is in progress */
const spaRendering = ref(false);
/** Whether results came from SPA renderer */
const renderedWithJs = ref(false);
const imageAnalysisResult = ref<ImageAnalysisResult | undefined>(undefined);
/** Raw HTML that was parsed (from proxy head or pasted HTML) — for debug view */
const rawHeadHtml = ref<string>("");

// Compute meta tag score when diagnostics are available
const metaScore = computed(() =>
  diagnostics.value ? computeScore(diagnostics.value) : null,
);

/**
 * Bumped every time analysis state is cleared (reset, mode switch). An
 * in-flight fetch captures the value before its await and bails if it changed:
 * without this, a slow response landing after "Start over" would repopulate
 * the page the user just cleared.
 */
const analysisEpoch = ref(0);

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
  assessSeoFromHtml(parsedTags.value);
  rawHeadHtml.value = extractHeadSection(inputHtml.value);
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
      resetSeo();
    }
  }
});

// Reset results when switching modes
watch(inputMode, () => {
  analysisEpoch.value++;
  parsedTags.value = null;
  diagnostics.value = null;
  hasAnalyzed.value = false;
  imageAnalysisResult.value = undefined;
  httpsPrefixAdded.value = false;
  showSpaHint.value = false;
  spaRendering.value = false;
  renderedWithJs.value = false;
  fetchStatus.reset();
  resetAi();
  resetSeo();
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

/** Loads sample HTML (GitHub) or sample URL based on current input mode. Auto-fetches. */
const loadSample = async () => {
  if (inputMode.value === "html") {
    inputHtml.value = sampleHtml;
  } else {
    inputUrl.value = "https://github.com";
    await nextTick();
    handleFetchUrl();
  }
};

/** Clears all input, results, and state; scrolls to top. */
const resetAll = () => {
  analysisEpoch.value++;
  inputHtml.value = "";
  inputUrl.value = "";
  httpsPrefixAdded.value = false;
  parsedTags.value = null;
  diagnostics.value = null;
  hasAnalyzed.value = false;
  imageAnalysisResult.value = undefined;
  rawHeadHtml.value = "";
  showSpaHint.value = false;
  spaRendering.value = false;
  renderedWithJs.value = false;
  fetchStatus.reset();
  resetAi();
  resetSeo();
  activeTab.value = "diagnostics";
  window.scrollTo({ top: 0, behavior: "smooth" });
  // The page empties out and scrolls away under the click, so say plainly
  // that the reset is what happened rather than leaving it to be inferred.
  toast.add({
    title: "Cleared",
    description: "Everything is reset — enter a URL or paste HTML to start again.",
    icon: "i-heroicons-arrow-path",
    color: "success",
    duration: 3000,
  });
};

/**
 * Fetches URL via proxy, parses meta tags, and updates diagnostics.
 * Handles errors via fetchStatus.setError for user-friendly display.
 */
const handleFetchUrl = async () => {
  if (!inputUrl.value.trim()) return;

  // Add https:// to a bare domain, or repair a mistyped scheme. Reporting the
  // two separately matters: telling someone a prefix was "added" to a URL that
  // visibly starts with https reads as a bug in the tool.
  httpsPrefixAdded.value = false;
  const normalized = normalizeUrlInput(inputUrl.value);
  if (normalized.change !== "none") {
    inputUrl.value = normalized.url;
    httpsPrefixAdded.value = true;
    toast.add({
      title:
        normalized.change === "corrected"
          ? "URL corrected"
          : "https:// prefix added",
      description: `Fetching ${normalized.url}`,
      icon: "i-heroicons-information-circle",
      color: "info",
      duration: 3000,
    });
  }

  // Captured before the await; a reset or mode switch mid-fetch bumps the
  // epoch, and this late response must then change nothing.
  const epoch = analysisEpoch.value;

  try {
    // Set fetching state
    fetchStatus.setValidating();
    await nextTick();
    fetchStatus.setFetching(inputUrl.value);

    // Fetch URL via proxy
    const { tags, response } = await fetchUrl(inputUrl.value);
    if (epoch !== analysisEpoch.value) return;

    // Parse complete
    fetchStatus.setParsing();

    // Store results
    parsedTags.value = tags;
    diagnostics.value = generateDiagnostics(tags, imageAnalysisResult.value);
    hasAnalyzed.value = true;
    rawHeadHtml.value = response.head;

    // Trigger AI readiness check (non-blocking)
    assessFromUrl(tags, inputUrl.value);
    assessSeoFromUrl(tags);

    // SPA detection heuristic: suggest JS rendering when the page appears to be
    // a client-side rendered app with incomplete meta tags.
    // Triggers when: no OG tags at all, OR no title+description, OR body contains
    // classic SPA shell patterns (div#app with no real content).
    renderedWithJs.value = false;
    const hasTitle = !!(tags.title || tags.og.title);
    const hasDescription = !!(tags.description || tags.og.description);
    const hasOgTags = !!(tags.og.title || tags.og.description || tags.og.image);
    const bodyLooksLikeSpa = (response.bodySnippet || "").length < 100;
    showSpaHint.value = (!hasTitle && !hasDescription) || (!hasOgTags && bodyLooksLikeSpa) || !hasOgTags;

    // Complete
    fetchStatus.setComplete(response.timing);
  } catch (error: unknown) {
    if (epoch !== analysisEpoch.value) return;
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
    showSpaHint.value = false;
  }
};

/**
 * Re-fetches the current URL using headless Chromium to render JavaScript.
 * Called when user clicks "Render with JavaScript" after SPA detection.
 */
const handleFetchSpa = async () => {
  if (!inputUrl.value.trim()) return;

  spaRendering.value = true;
  showSpaHint.value = false;

  // Same late-response guard as handleFetchUrl.
  const epoch = analysisEpoch.value;

  try {
    fetchStatus.setFetching(inputUrl.value);

    const response = await $fetch<{
      ok: boolean;
      url: string;
      finalUrl: string;
      head: string;
      bodySnippet: string;
      renderedWith: string;
      timing: number;
      error?: string;
    }>("/api/fetch-spa", {
      method: "POST",
      body: { url: inputUrl.value },
    });
    if (epoch !== analysisEpoch.value) return;

    if (!response.ok || !response.head) {
      throw new Error(response.error || "SPA render failed");
    }

    fetchStatus.setParsing();

    const tags = parseMetaTags(response.head);
    parsedTags.value = tags;
    diagnostics.value = generateDiagnostics(tags, imageAnalysisResult.value);
    hasAnalyzed.value = true;
    rawHeadHtml.value = response.head;
    renderedWithJs.value = true;

    // Trigger AI readiness check (non-blocking)
    assessFromUrl(tags, inputUrl.value);
    assessSeoFromUrl(tags);

    fetchStatus.setComplete(response.timing);

    toast.add({
      title: "Rendered with JavaScript",
      description: `Page rendered via headless Chromium in ${response.timing}ms`,
      icon: "i-heroicons-code-bracket",
      color: "success",
      duration: 4000,
    });
  } catch (error: unknown) {
    if (epoch !== analysisEpoch.value) return;
    const err = error as { data?: { error?: string }; message?: string };
    const message = err.data?.error || err.message || "SPA rendering failed";
    fetchStatus.setError(0, message);
    toast.add({
      title: "SPA Render Failed",
      description: message,
      icon: "i-heroicons-exclamation-triangle",
      color: "error",
      duration: 5000,
    });
  } finally {
    spaRendering.value = false;
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

// ── Exports ───────────────────────────────────────────────────
// All report content is built by the pure functions in
// ~/utils/exporters (unit-tested); the page only snapshots state
// and wires the download/copy UI.

/** Captures current analysis state for the pure report builders. */
const exportSnapshot = (): ExportSnapshot => ({
  tags: parsedTags.value,
  diagnostics: diagnostics.value,
  score: metaScore.value,
  aiResult: aiResult.value,
  originalHtml: extractHeadSection(inputHtml.value),
});

const dateStamp = () => new Date().toISOString().split("T")[0];

const exportAsJson = () => {
  const data = buildExportData(exportSnapshot());
  if (!data) return;
  downloadFile(
    JSON.stringify(data, null, 2),
    `metapeek-results-${dateStamp()}.json`,
    "application/json",
  );
};

const exportAsMarkdown = () => {
  const md = buildMarkdownReport(exportSnapshot());
  if (!md) return;
  downloadFile(md, `metapeek-results-${dateStamp()}.md`, "text/markdown");
};

const copyMarkdownToClipboard = () => {
  const md = buildMarkdownReport(exportSnapshot());
  if (!md) return;
  copyToClipboard(md, "markdown");
};

const copyJsonToClipboard = () => {
  const data = buildExportData(exportSnapshot());
  if (!data) return;
  copyToClipboard(JSON.stringify(data, null, 2), "json");
};

/** LLM handoff text for the diagnostics tab (also rendered in the template). */
const generateLlmIssuesContent = (): string =>
  buildLlmIssuesReport(exportSnapshot());

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
  downloadFile(content, `metapeek-ai-assist${ext}`, mime);
};

/** LLM handoff text for the AI readiness panel (also rendered in the template). */
const generateAiReadinessLlmContent = (): string =>
  buildAiReadinessReport(aiResult.value);

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
  const html = buildHtmlReport(exportSnapshot());
  if (!html) return;
  downloadFile(html, `metapeek-report-${dateStamp()}.html`, "text/html");
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
          <button
            class="flex items-center gap-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg p-1 -m-1"
            aria-label="Reset MetaPeek"
            @click="resetAll"
          >
            <img
              src="~/assets/images/icjia-logo.png"
              alt="ICJIA Logo"
              width="250"
              height="175"
              class="h-12 sm:h-14 w-auto"
            >
            <div class="text-left">
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
          </button>
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

      <!--
        Start over — top. Only once an analysis exists: this band sits ABOVE
        the input, so keying it off "anything typed" made it appear on the
        first keystroke and shove the focused field ~140px down the page
        (0.17.2). The typed-but-unanalyzed state is covered by the small Clear
        link in the Step 1 header. Mirrored at the bottom of the results so it
        is reachable from either end without scrolling the full page.
      -->
      <div
        v-if="hasAnalyzed"
        class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-6 mb-8 border-y border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60"
      >
        <ResetButton
          hint="Clears the URL, the pasted HTML, and every result below."
          @reset="resetAll"
        />
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
                inputMode === 'url'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
              ]"
              @click="inputMode = 'url'"
            >
              🌐 Fetch URL
            </button>
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
            <span class="text-gray-400 dark:text-gray-400 tabular-nums">
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
              @input="httpsPrefixAdded = false"
              @keyup.enter="handleFetchUrl"
            >
            <div class="absolute right-2 top-1/2 -translate-y-1/2">
              <UButton
                :disabled="
                  !inputUrl.trim() ||
                  fetchStatus.state.value.status === 'fetching' ||
                  hasAnalyzed
                "
                size="sm"
                :color="hasAnalyzed ? 'neutral' : 'primary'"
                :variant="hasAnalyzed ? 'soft' : 'solid'"
                :loading="fetchStatus.state.value.status === 'fetching'"
                :class="hasAnalyzed ? 'opacity-50 cursor-not-allowed' : ''"
                @click="handleFetchUrl"
              >
                {{
                  fetchStatus.state.value.status === "fetching"
                    ? "Fetching..."
                    : hasAnalyzed
                      ? "Fetched"
                      : "Fetch"
                }}
              </UButton>
            </div>
          </div>

          <!-- https:// prefix notice -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <p
              v-if="httpsPrefixAdded"
              class="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300"
            >
              <UIcon name="i-heroicons-information-circle" class="w-3.5 h-3.5 flex-shrink-0" />
              <span><code class="font-semibold">https://</code> was automatically added to your URL.</span>
            </p>
          </Transition>

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
            <span>
              Fetched in {{ fetchStatus.state.value.timing }}ms
              <span v-if="renderedWithJs" class="ml-1 font-medium">(rendered with JavaScript)</span>
            </span>
          </div>

          <!-- SPA Detection Banner -->
          <div
            v-if="showSpaHint && hasAnalyzed"
            role="alert"
            class="px-4 py-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800"
          >
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="font-medium text-amber-900 dark:text-amber-100 mb-1">
                  Missing Open Graph tags — this may be a JavaScript-rendered page
                </p>
                <p class="text-sm text-amber-700 dark:text-amber-300 mb-3">
                  No Open Graph meta tags (og:title, og:image, etc.) were found in the static HTML.
                  If this site uses a framework like Vue, React, or Angular, the meta tags may be
                  injected by JavaScript at runtime. Try re-analyzing with a headless browser.
                </p>
                <UButton
                  size="sm"
                  color="warning"
                  variant="solid"
                  icon="i-heroicons-code-bracket"
                  :loading="spaRendering"
                  :disabled="spaRendering"
                  @click="handleFetchSpa"
                >
                  {{ spaRendering ? "Rendering..." : "Render with JavaScript" }}
                </UButton>
              </div>
            </div>
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
              <!-- Grade gate: a red og:image caps the score at F -->
              <p
                v-if="metaScore.gated && metaScore.gateReason"
                class="mt-3 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-200 dark:border-red-800"
              >
                <UIcon
                  name="i-heroicons-exclamation-triangle"
                  class="inline-block w-4 h-4 mr-1 align-middle"
                />
                {{ metaScore.gateReason }}
              </p>
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

              <!-- LLM-ready copy block (Step 5) — hidden when score is 100 -->
              <div v-if="metaScore?.overall !== 100" class="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Copy for AI assistant
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Paste this into ChatGPT, Claude, or another LLM to get help implementing fixes.
                </p>
                <pre
                  tabindex="0"
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

        <!-- Category Breakdown (compact two-column grid) -->
        <div
          class="bg-white dark:bg-gray-900 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6 mb-6"
        >
          <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-3">
            Category Breakdown
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <template
              v-for="(category, key) in metaScore.categories"
              :key="key"
            >
              <div
                class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <UIcon
                  :name="
                    category.status === 'pass'
                      ? 'i-heroicons-check-circle-solid'
                      : category.status === 'warning'
                        ? 'i-heroicons-exclamation-circle-solid'
                        : 'i-heroicons-x-circle-solid'
                  "
                  :class="[
                    'w-4 h-4 flex-shrink-0',
                    category.status === 'pass' && 'text-emerald-500',
                    category.status === 'warning' && 'text-amber-500',
                    category.status === 'fail' && 'text-red-500',
                  ]"
                />
                <span class="text-sm text-gray-900 dark:text-white font-medium flex-1 truncate">
                  {{ category.name }}
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {{ category.weight }}%
                </span>
                <span
                  :class="[
                    'text-sm font-semibold tabular-nums flex-shrink-0',
                    category.status === 'pass' && 'text-emerald-600 dark:text-emerald-400',
                    category.status === 'warning' && 'text-amber-600 dark:text-amber-400',
                    category.status === 'fail' && 'text-red-600 dark:text-red-400',
                  ]"
                >
                  {{ category.score }}
                </span>
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

        <!-- LLM-ready copy block (AI Readiness) — hidden when 100% AI Ready -->
        <div v-if="aiResult?.verdict !== 'ready'" class="mt-6 bg-white dark:bg-gray-900 rounded-xl border border-violet-200 dark:border-violet-800 p-6">
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Copy for AI assistant
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Paste this into ChatGPT, Claude, or another LLM to get help improving your AI readiness.
          </p>
          <pre
            tabindex="0"
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

      <!-- Step 5c: SEO Insights -->
      <div
        v-if="parsedTags && diagnostics && seoInsightsResult"
        class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-teal-50 dark:bg-teal-950/40 border-y border-teal-200 dark:border-teal-800"
      >
        <div class="flex items-center gap-4 mb-6">
          <div
            class="flex items-center justify-center w-16 h-16 rounded-full bg-teal-600 text-white font-extrabold text-2xl shadow-xl ring-4 ring-teal-200 dark:ring-teal-800"
          >
            <UIcon name="i-heroicons-magnifying-glass-circle" class="w-8 h-8" />
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              SEO Insights
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Additional SEO signals and best practices for developers.
            </p>
          </div>
        </div>

        <SeoInsightsPanel :result="seoInsightsResult" />
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
            <!--
              One column on phones, three across from sm up. The buttons fill
              their cells so the row spans the panel instead of trailing off
              into empty space on the right.
            -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <AppTooltip
                block
                text="Structured data for developers and automated tools"
                position="top"
              >
                <UButton
                  block
                  size="xl"
                  variant="solid"
                  class="py-4 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800 text-white"
                  icon="i-heroicons-code-bracket"
                  @click="exportAsJson"
                >
                  JSON
                </UButton>
              </AppTooltip>
              <AppTooltip
                block
                text="Best for pasting into ChatGPT, Claude, or other AI assistants"
                position="top"
              >
                <UButton
                  block
                  size="xl"
                  variant="solid"
                  class="py-4 text-base font-semibold bg-violet-600 hover:bg-violet-700 dark:bg-violet-700 dark:hover:bg-violet-800 text-white"
                  icon="i-heroicons-document-text"
                  @click="exportAsMarkdown"
                >
                  Markdown
                </UButton>
              </AppTooltip>
              <AppTooltip
                block
                text="Printable report to share with your team or stakeholders"
                position="top"
              >
                <UButton
                  block
                  size="xl"
                  variant="solid"
                  class="py-4 text-base font-semibold bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800 text-white"
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
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AppTooltip
                block
                text="Copy formatted text — ideal for pasting into AI assistants"
                position="top"
              >
                <UButton
                  block
                  size="xl"
                  variant="outline"
                  color="neutral"
                  class="py-4 text-base font-semibold"
                  icon="i-heroicons-clipboard-document"
                  @click="copyMarkdownToClipboard"
                >
                  Copy Markdown
                </UButton>
              </AppTooltip>
              <AppTooltip
                block
                text="Copy structured data for use in scripts or APIs"
                position="top"
              >
                <UButton
                  block
                  size="xl"
                  variant="outline"
                  color="neutral"
                  class="py-4 text-base font-semibold"
                  icon="i-heroicons-clipboard-document"
                  @click="copyJsonToClipboard"
                >
                  Copy JSON
                </UButton>
              </AppTooltip>
            </div>

            <!-- Copied indicator: its own row, so appearing cannot reflow the grid -->
            <div class="mt-3 min-h-[2rem]" aria-live="polite">
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
                tabindex="0"
                class="text-xs font-mono text-gray-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all"
              >{{ rawHeadHtml }}</pre>
            </div>
          </details>

          <!-- Start over — bottom. Same control as the one above the steps. -->
          <div
            class="mt-8 pt-6 -mx-6 px-6 pb-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 rounded-b-lg"
          >
            <ResetButton
              hint="Clears everything and takes you back to the top for a new analysis."
              @reset="resetAll"
            />
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
          <p class="flex items-center gap-2">
            <a
              href="https://github.com/ICJIA/icjia-metapeek/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              class="underline hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >v0.12.0</a>
            <span>·</span>
            <a
              href="https://github.com/ICJIA/icjia-metapeek"
              target="_blank"
              rel="noopener noreferrer"
              class="underline hover:text-gray-900 dark:hover:text-gray-100 transition-colors inline-flex items-center gap-1 py-2"
            >
              <UIcon name="i-simple-icons-github" class="w-3.5 h-3.5" />
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </main>
  </div>
</template>
