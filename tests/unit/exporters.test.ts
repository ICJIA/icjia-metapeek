/**
 * @fileoverview Tests for app/utils/exporters.ts — the pure report builders
 * (JSON payload, Markdown, LLM handoff text, HTML report) extracted from
 * app/pages/index.vue. Fixtures run through the real parser/diagnostics/score
 * pipeline so the tests exercise production data shapes, not mocks.
 */

import { describe, it, expect } from "vitest";
import { parseMetaTags } from "#shared/parser";
import { generateDiagnostics } from "#shared/diagnostics";
import { computeScore } from "#shared/score";
import { assessAiReadiness } from "#shared/ai-readiness";
import type { MetaScore } from "#shared/types";
import {
  extractHeadSection,
  buildExportData,
  buildMarkdownReport,
  buildLlmIssuesReport,
  buildAiReadinessReport,
  buildHtmlReport,
  type ExportSnapshot,
} from "~/utils/exporters";

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Example Page Title for Testing Export Builders</title>
  <meta name="description" content="A description that is long enough to pass the length diagnostics for the exporter test fixtures used here.">
  <meta property="og:site_name" content="Example">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Example OG Title">
  <meta property="og:url" content="https://example.com/">
  <meta property="og:description" content="Example OG description for the fixture.">
  <meta property="og:image" content="https://example.com/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@example">
  <link rel="canonical" href="https://example.com/">
</head>
<body><h1>Hello</h1></body>
</html>`;

function makeSnapshot(overrides: Partial<ExportSnapshot> = {}): ExportSnapshot {
  const tags = parseMetaTags(FIXTURE_HTML);
  const diagnostics = generateDiagnostics(tags, undefined);
  return {
    tags,
    diagnostics,
    score: computeScore(diagnostics),
    aiResult: null,
    originalHtml: extractHeadSection(FIXTURE_HTML),
    ...overrides,
  };
}

describe("extractHeadSection", () => {
  it("returns the full <head> block when present", () => {
    const head = extractHeadSection(FIXTURE_HTML);
    expect(head.startsWith("<head")).toBe(true);
    expect(head.endsWith("</head>")).toBe(true);
    expect(head).toContain("og:image");
  });

  it("falls back to the trimmed input when no head tag exists", () => {
    const fragment = `  <meta property="og:title" content="Loose tags">  `;
    expect(extractHeadSection(fragment)).toBe(fragment.trim());
  });
});

describe("buildExportData", () => {
  it("returns null when tags or diagnostics are missing", () => {
    expect(buildExportData(makeSnapshot({ tags: null }))).toBeNull();
    expect(buildExportData(makeSnapshot({ diagnostics: null }))).toBeNull();
  });

  it("builds the full payload with score, summary counts, and meta tags", () => {
    const data = buildExportData(makeSnapshot());
    expect(data).not.toBeNull();
    expect(data!.exportInfo.tool).toBe("MetaPeek by ICJIA");
    expect(data!.score!.categories).toHaveLength(7);
    expect(data!.summary.passCount + data!.summary.issueCount).toBe(7);
    expect(data!.metaTags.basic.title).toBe(
      "Example Page Title for Testing Export Builders",
    );
    expect(data!.metaTags.openGraph.image).toBe("https://example.com/og.png");
    expect(data!.aiReadiness).toBeNull();
  });

  it("includes AI readiness checks when a result is present", () => {
    const tags = parseMetaTags(FIXTURE_HTML);
    const aiResult = assessAiReadiness(tags, { pasteMode: true });
    const data = buildExportData(makeSnapshot({ aiResult }));
    expect(data!.aiReadiness).not.toBeNull();
    expect(data!.aiReadiness!.verdict).toBe(aiResult.verdict);
    expect(data!.aiReadiness!.checks.length).toBe(aiResult.checks.length);
  });
});

describe("buildMarkdownReport", () => {
  it("returns null when there is nothing to export", () => {
    expect(buildMarkdownReport(makeSnapshot({ tags: null }))).toBeNull();
  });

  it("renders score, diagnostics table, tag tables, and the original HTML", () => {
    const snap = makeSnapshot();
    const md = buildMarkdownReport(snap)!;
    expect(md).toContain("# MetaPeek Analysis Results");
    expect(md).toContain(`**Score:** ${snap.score!.overall}/100`);
    expect(md).toContain("| Check | Status | Details |");
    expect(md).toContain("| og:image | https://example.com/og.png |");
    expect(md).toContain("```html");
    expect(md).toContain("Example Page Title for Testing Export Builders");
  });

  it("includes the AI readiness section only when a result is present", () => {
    const withoutAi = buildMarkdownReport(makeSnapshot())!;
    expect(withoutAi).not.toContain("## AI Readiness Assessment");

    const tags = parseMetaTags(FIXTURE_HTML);
    const aiResult = assessAiReadiness(tags, { pasteMode: true });
    const withAi = buildMarkdownReport(makeSnapshot({ aiResult }))!;
    expect(withAi).toContain("## AI Readiness Assessment");
  });
});

describe("buildLlmIssuesReport", () => {
  it("returns an empty string when score or diagnostics are missing", () => {
    expect(buildLlmIssuesReport(makeSnapshot({ score: null }))).toBe("");
    expect(buildLlmIssuesReport(makeSnapshot({ diagnostics: null }))).toBe("");
  });

  it("reports a clean bill when there are no issues", () => {
    const perfect: MetaScore = {
      ...makeSnapshot().score!,
      totalIssues: 0,
      overall: 100,
      grade: "A",
    };
    const text = buildLlmIssuesReport(makeSnapshot({ score: perfect }));
    expect(text).toContain("None. All checks passed.");
  });

  it("lists each category issue as an actionable bullet", () => {
    const snap = makeSnapshot();
    const text = buildLlmIssuesReport(snap);
    expect(text).toContain("## Specific Issues to Fix");
    for (const category of Object.values(snap.score!.categories)) {
      for (const issue of category.issues) {
        expect(text).toContain(`- **${category.name}:** ${issue}`);
      }
    }
  });
});

describe("buildAiReadinessReport", () => {
  it("returns an empty string without a result", () => {
    expect(buildAiReadinessReport(null)).toBe("");
  });

  it("renders the verdict and action items for failing checks", () => {
    const tags = parseMetaTags("<html><head><title>x</title></head></html>");
    const aiResult = assessAiReadiness(tags, { pasteMode: true });
    const text = buildAiReadinessReport(aiResult);
    expect(text).toContain("# AI Readiness Assessment");
    expect(text).toContain("**Verdict:**");
    const hasProblems = aiResult.checks.some(
      (c) => c.status === "fail" || c.status === "warn",
    );
    if (hasProblems) {
      expect(text).toContain("## Action Items");
    } else {
      expect(text).toContain("All AI readiness checks passed.");
    }
  });
});

describe("buildHtmlReport", () => {
  it("returns null when there is nothing to export", () => {
    expect(buildHtmlReport(makeSnapshot({ diagnostics: null }))).toBeNull();
  });

  it("renders the grade, category table, and footer", () => {
    const snap = makeSnapshot();
    const html = buildHtmlReport(snap)!;
    expect(html).toContain("MetaPeek Analysis Report");
    expect(html).toContain(`Grade: ${snap.score!.grade}`);
    expect(html).toContain("Category Scores");
    expect(html).toContain("metapeek.icjia.app");
  });

  it("escapes HTML in user-controlled tag values", () => {
    const hostile = FIXTURE_HTML.replace(
      'content="A description that is long enough to pass the length diagnostics for the exporter test fixtures used here."',
      'content="<script>alert(1)</script> pretending to be a description"',
    );
    const tags = parseMetaTags(hostile);
    expect(tags.description).toContain("<script>");
    const diagnostics = generateDiagnostics(tags, undefined);
    const html = buildHtmlReport(
      makeSnapshot({ tags, diagnostics, score: computeScore(diagnostics) }),
    )!;
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });

  it("neutralizes a hostile theme-color instead of injecting it into CSS", () => {
    const hostile = FIXTURE_HTML.replace(
      "</head>",
      `<meta name="theme-color" content="red;} body{display:none"></head>`,
    );
    const tags = parseMetaTags(hostile);
    const diagnostics = generateDiagnostics(tags, undefined);
    const html = buildHtmlReport(
      makeSnapshot({ tags, diagnostics, score: computeScore(diagnostics) }),
    )!;
    expect(html).not.toContain("body{display:none;");
    expect(html).toContain("background:transparent");
  });
});
