/**
 * @fileoverview Pure report builders for MetaPeek exports: the JSON payload,
 * the Markdown report, the LLM handoff texts, and the standalone HTML report.
 * Extracted from app/pages/index.vue so the page only wires UI events —
 * everything here is a pure function of an ExportSnapshot: no refs, no DOM,
 * no toasts. That also makes the builders unit-testable
 * (tests/unit/exporters.test.ts).
 *
 * @module utils/exporters
 */

import type {
  MetaTags,
  Diagnostics,
  MetaScore,
  AiReadinessResult,
} from "#shared/types";

/**
 * Everything the builders need, captured from page state at export time.
 * Null fields mean "no analysis yet" — builders return null/"" accordingly.
 */
export interface ExportSnapshot {
  tags: MetaTags | null;
  diagnostics: Diagnostics | null;
  score: MetaScore | null;
  aiResult: AiReadinessResult | null;
  /** The analyzed HTML source, as returned by extractHeadSection. */
  originalHtml: string;
}

/** Maps a diagnostic status to the emoji used across the reports. */
const statusEmoji = (status: string) =>
  status === "green" ? "✅" : status === "yellow" ? "⚠️" : "❌";

/**
 * Extracts the &lt;head&gt; section from HTML for export reference.
 * Falls back to the trimmed input if no head tag (e.g. meta-only paste).
 */
export function extractHeadSection(html: string): string {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    return headMatch[0];
  }
  // If no head tags, return the whole input (might be just meta tags)
  return html.trim();
}

/**
 * Builds the export payload for JSON/Markdown/HTML exports.
 * @returns Export data object or null if no analysis
 */
export function buildExportData(snap: ExportSnapshot) {
  if (!snap.tags || !snap.diagnostics) return null;

  const timestamp = new Date().toISOString();
  const tags = snap.tags;
  const diag = snap.diagnostics;
  const originalHtml = snap.originalHtml;
  const score = snap.score;

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
    aiReadiness: snap.aiResult
      ? {
          verdict: snap.aiResult.verdict,
          checks: snap.aiResult.checks.map((c) => ({
            id: c.id,
            label: c.label,
            status: c.status,
            message: c.message,
            suggestion: c.suggestion || null,
            detail: c.detail || null,
          })),
        }
      : null,
  };
}

/** The non-null payload shape produced by buildExportData. */
export type ExportData = Exclude<ReturnType<typeof buildExportData>, null>;

/**
 * Builds the Markdown report.
 * @returns Markdown string or null if no analysis
 */
export function buildMarkdownReport(snap: ExportSnapshot): string | null {
  const data = buildExportData(snap);
  if (!data) return null;

  const tags = snap.tags!;
  const diag = snap.diagnostics!;
  const originalHtml = snap.originalHtml;

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
  if (snap.aiResult) {
    const ai = snap.aiResult;
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
}

/**
 * Builds markdown content for AI assistants (ChatGPT, Claude, etc.).
 * Includes score summary and per-category issue list.
 * @returns Markdown string or empty if no analysis
 */
export function buildLlmIssuesReport(snap: ExportSnapshot): string {
  if (!snap.score || !snap.diagnostics) return "";

  const score = snap.score;

  // AI assessment (preface)
  let assessment: string;
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
}

/**
 * Builds LLM-ready text summarizing the AI readiness assessment.
 * Includes verdict, all check results, and actionable suggestions.
 */
export function buildAiReadinessReport(
  aiResult: AiReadinessResult | null,
): string {
  if (!aiResult) return "";

  const result = aiResult;
  const verdictLabel =
    result.verdict === "ready"
      ? "AI Ready"
      : result.verdict === "partial"
        ? "Partially AI Ready"
        : "Not AI Ready";

  const aiStatusLabel = (s: string) =>
    s === "pass" ? "PASS" : s === "warn" ? "WARN" : s === "fail" ? "FAIL" : "N/A";

  let content = `# AI Readiness Assessment

**Verdict:** ${verdictLabel}

This assessment evaluates how well the page is prepared for AI systems (ChatGPT, Claude, Perplexity, Bing Copilot, etc.) to understand, cite, and link to the content. It does NOT affect the meta tag quality score.

## Check Results

`;

  for (const check of result.checks) {
    content += `### ${aiStatusLabel(check.status)} — ${check.label}\n`;
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
}

/**
 * Builds the standalone HTML report (self-contained, printable).
 * @returns Full HTML document string or null if no analysis
 */
export function buildHtmlReport(snap: ExportSnapshot): string | null {
  const data = buildExportData(snap);
  if (!data) return null;

  const tags = snap.tags!;
  const diag = snap.diagnostics!;
  const originalHtml = snap.originalHtml;

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

  return `<!DOCTYPE html>
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
        snap.aiResult
          ? `
      <div class="section">
        <h3>🤖 AI Readiness Assessment</h3>
        <div style="padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border: 2px dashed #8b5cf6; background: #f5f3ff;">
          <p style="font-weight: 600; color: #6d28d9; margin-bottom: 0.25rem;">
            ${snap.aiResult.verdict === "ready" ? "✅ AI Ready" : snap.aiResult.verdict === "partial" ? "⚠️ Partially AI Ready" : "❌ Not AI Ready"}
          </p>
          <p style="font-size: 0.75rem; color: #7c3aed;">Informational only — does not impact meta tag quality score.</p>
        </div>
        <table>
          <tr><th>Check</th><th>Status</th><th>Details</th></tr>
          ${snap.aiResult.checks
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
}
