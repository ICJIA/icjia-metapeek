/**
 * Image-gate scoring behavior: a page without a working og:image cannot
 * pass, because the product's whole promise is "your share card will look
 * right." Covers the missing-tag, unreachable-URL, and browser-load-failure
 * paths end-to-end through generateDiagnostics → computeScore.
 */
import { describe, it, expect } from "vitest";
import { generateDiagnostics } from "#shared/diagnostics";
import { computeScore } from "#shared/score";
import type { MetaTags } from "#shared/types";

/** An otherwise-excellent page; og.image varies per test. */
const goodTags = (image?: string): MetaTags =>
  ({
    title: "A perfectly sized page title",
    description:
      "A meta description of a very reasonable length that search engines and social platforms will happily display in full.",
    canonical: "https://example.com/page",
    og: {
      title: "A perfectly sized page title",
      description: "Social description",
      image,
      url: "https://example.com/page",
    },
    facebook: {},
    twitter: { card: "summary_large_image" },
  }) as MetaTags;

describe("og:image grade gate", () => {
  it("caps an imageless page at F even when everything else is green", () => {
    const diagnostics = generateDiagnostics(goodTags(undefined));
    const score = computeScore(diagnostics);

    expect(diagnostics.ogImage.status).toBe("red");
    expect(score.overall).toBeLessThanOrEqual(55);
    expect(score.grade).toBe("F");
    expect(score.gated).toBe(true);
    expect(score.gateReason).toBeTruthy();
  });

  it("caps a page whose og:image URL is unreachable (server-verified)", () => {
    const diagnostics = generateDiagnostics(
      goodTags("https://example.com/gone.png"),
      { width: 0, height: 0, overallStatus: null, reachable: false },
    );
    const score = computeScore(diagnostics);

    expect(diagnostics.ogImage.status).toBe("red");
    expect(diagnostics.ogImage.message).toContain("not reachable");
    expect(score.grade).toBe("F");
    expect(score.gated).toBe(true);
  });

  it("treats a non-image content-type as red", () => {
    const diagnostics = generateDiagnostics(
      goodTags("https://example.com/actually-a-page"),
      {
        width: 0,
        height: 0,
        overallStatus: null,
        reachable: true,
        contentType: "text/html",
      },
    );
    expect(diagnostics.ogImage.status).toBe("red");
    expect(computeScore(diagnostics).gated).toBe(true);
  });

  it("treats a browser-only load failure as yellow, NOT a gate", () => {
    // Hotlink/referer protection can fail in-browser while platform
    // crawlers still fetch the image fine — warn, don't fail.
    const diagnostics = generateDiagnostics(
      goodTags("https://example.com/maybe-protected.png"),
      { width: 0, height: 0, overallStatus: null, loadFailed: true },
    );
    const score = computeScore(diagnostics);

    expect(diagnostics.ogImage.status).toBe("yellow");
    expect(diagnostics.ogImage.message).toContain("could not be verified");
    expect(score.gated).toBe(false);
    expect(score.grade).not.toBe("F");
  });

  it("leaves healthy pages ungated with an A", () => {
    const diagnostics = generateDiagnostics(
      goodTags("https://example.com/og.png"),
      { width: 1200, height: 630, overallStatus: "optimal", reachable: true },
    );
    const score = computeScore(diagnostics);

    expect(diagnostics.ogImage.status).toBe("green");
    expect(score.gated).toBe(false);
    expect(score.grade).toBe("A");
    expect(score.overall).toBe(100);
  });

  it("still reports dimension problems as red and gates them", () => {
    const diagnostics = generateDiagnostics(
      goodTags("https://example.com/tiny.png"),
      { width: 100, height: 100, overallStatus: "issues", reachable: true },
    );
    expect(diagnostics.ogImage.status).toBe("red");
    expect(computeScore(diagnostics).grade).toBe("F");
  });
});
