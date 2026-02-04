import { describe, it, expect } from "vitest";
import { useDiagnostics } from "~/composables/useDiagnostics";
import type { MetaTags } from "~/types/meta";

describe("useDiagnostics", () => {
  const { generateDiagnostics } = useDiagnostics();

  // Helper to create a base MetaTags object
  const createMetaTags = (overrides: Partial<MetaTags> = {}): MetaTags => ({
    title: undefined,
    description: undefined,
    viewport: undefined,
    robots: undefined,
    canonical: undefined,
    favicon: undefined,
    themeColor: undefined,
    og: {
      title: undefined,
      description: undefined,
      type: undefined,
      url: undefined,
      image: undefined,
      imageAlt: undefined,
      siteName: undefined,
      locale: undefined,
    },
    twitter: {
      card: undefined,
      site: undefined,
      creator: undefined,
      title: undefined,
      description: undefined,
      image: undefined,
      imageAlt: undefined,
    },
    structuredData: [],
    ...overrides,
  });

  describe("title diagnostics", () => {
    it("returns red status when title is missing", () => {
      const tags = createMetaTags();
      const result = generateDiagnostics(tags);
      expect(result.title.status).toBe("red");
      expect(result.title.message).toContain("missing");
    });

    it("returns green status when title is optimal length", () => {
      const tags = createMetaTags({ title: "A good page title" });
      const result = generateDiagnostics(tags);
      expect(result.title.status).toBe("green");
    });

    it("returns yellow status when title exceeds 60 characters", () => {
      const longTitle = "A".repeat(65);
      const tags = createMetaTags({ title: longTitle });
      const result = generateDiagnostics(tags);
      expect(result.title.status).toBe("yellow");
      expect(result.title.message).toContain("exceeds");
    });
  });

  describe("description diagnostics", () => {
    it("returns red status when description is missing", () => {
      const tags = createMetaTags();
      const result = generateDiagnostics(tags);
      expect(result.description.status).toBe("red");
      expect(result.description.message).toContain("missing");
    });

    it("returns green status when description is optimal length", () => {
      const tags = createMetaTags({
        description:
          "This is a good description that provides enough context about the page content for search engines and users.",
      });
      const result = generateDiagnostics(tags);
      expect(result.description.status).toBe("green");
    });

    it("returns yellow status when description exceeds 160 characters", () => {
      const longDescription = "A".repeat(165);
      const tags = createMetaTags({ description: longDescription });
      const result = generateDiagnostics(tags);
      expect(result.description.status).toBe("yellow");
      expect(result.description.message).toContain("exceeds");
    });

    it("returns yellow status when description is too short", () => {
      const tags = createMetaTags({ description: "Too short" });
      const result = generateDiagnostics(tags);
      expect(result.description.status).toBe("yellow");
      expect(result.description.message).toContain("short");
    });
  });

  describe("OG tags diagnostics", () => {
    it("returns red status when all OG tags are missing", () => {
      const tags = createMetaTags();
      const result = generateDiagnostics(tags);
      expect(result.ogTags.status).toBe("red");
      expect(result.ogTags.message).toContain("Missing");
    });

    it("returns red status when 2+ OG tags are missing", () => {
      const tags = createMetaTags({
        og: {
          title: "OG Title",
          description: undefined,
          type: undefined,
          url: undefined,
          image: undefined,
          imageAlt: undefined,
          siteName: undefined,
          locale: undefined,
        },
      });
      const result = generateDiagnostics(tags);
      expect(result.ogTags.status).toBe("red");
      expect(result.ogTags.message).toContain("Missing");
    });

    it("returns yellow status when only 1 OG tag is missing", () => {
      const tags = createMetaTags({
        og: {
          title: "OG Title",
          description: "OG Description",
          type: undefined,
          url: undefined,
          image: undefined,
          imageAlt: undefined,
          siteName: undefined,
          locale: undefined,
        },
      });
      const result = generateDiagnostics(tags);
      expect(result.ogTags.status).toBe("yellow");
      expect(result.ogTags.message).toContain("Missing");
    });

    it("returns green status when all required OG tags are present", () => {
      const tags = createMetaTags({
        og: {
          title: "OG Title",
          description: "OG Description",
          type: "website",
          url: "https://example.com",
          image: "https://example.com/image.jpg",
          imageAlt: undefined,
          siteName: undefined,
          locale: undefined,
        },
      });
      const result = generateDiagnostics(tags);
      expect(result.ogTags.status).toBe("green");
    });
  });

  describe("OG image diagnostics", () => {
    it("returns red status when og:image is missing", () => {
      const tags = createMetaTags();
      const result = generateDiagnostics(tags);
      expect(result.ogImage.status).toBe("red");
      expect(result.ogImage.message).toContain("missing");
    });

    it("returns yellow status when og:image is a relative path", () => {
      const tags = createMetaTags({
        og: {
          title: "Title",
          description: "Description",
          type: undefined,
          url: undefined,
          image: "/images/og.jpg",
          imageAlt: undefined,
          siteName: undefined,
          locale: undefined,
        },
      });
      const result = generateDiagnostics(tags);
      expect(result.ogImage.status).toBe("yellow");
      expect(result.ogImage.message).toContain("relative");
    });

    it("returns green status when og:image is an absolute URL", () => {
      const tags = createMetaTags({
        og: {
          title: "Title",
          description: "Description",
          type: undefined,
          url: undefined,
          image: "https://example.com/image.jpg",
          imageAlt: undefined,
          siteName: undefined,
          locale: undefined,
        },
      });
      const result = generateDiagnostics(tags);
      expect(result.ogImage.status).toBe("green");
    });
  });

  describe("Twitter Card diagnostics", () => {
    it("returns red when OG tags exist but twitter:card is missing", () => {
      const tags = createMetaTags({
        og: {
          title: "OG Title",
          description: "Description",
          type: undefined,
          url: undefined,
          image: "https://example.com/image.jpg",
          imageAlt: undefined,
          siteName: undefined,
          locale: undefined,
        },
      });
      const result = generateDiagnostics(tags);
      expect(result.twitterCard.status).toBe("red");
      expect(result.twitterCard.suggestion).toContain("twitter:card");
    });

    it("returns green when twitter:card is present", () => {
      const tags = createMetaTags({
        twitter: {
          card: "summary_large_image",
          site: undefined,
          creator: undefined,
          title: undefined,
          description: undefined,
          image: undefined,
          imageAlt: undefined,
        },
      });
      const result = generateDiagnostics(tags);
      expect(result.twitterCard.status).toBe("green");
    });
  });

  describe("canonical diagnostics", () => {
    it("returns red when canonical is missing", () => {
      const tags = createMetaTags();
      const result = generateDiagnostics(tags);
      expect(result.canonical.status).toBe("red");
      expect(result.canonical.suggestion).toContain("canonical");
    });

    it("returns green when canonical is present", () => {
      const tags = createMetaTags({ canonical: "https://example.com/page" });
      const result = generateDiagnostics(tags);
      expect(result.canonical.status).toBe("green");
    });
  });

  describe("robots diagnostics", () => {
    it("returns green when robots is not set (page will be indexed)", () => {
      const tags = createMetaTags();
      const result = generateDiagnostics(tags);
      expect(result.robots.status).toBe("green");
    });

    it("returns yellow when noindex is set", () => {
      const tags = createMetaTags({ robots: "noindex, follow" });
      const result = generateDiagnostics(tags);
      expect(result.robots.status).toBe("yellow");
      expect(result.robots.message).toContain("noindex");
    });

    it("returns green for normal robots directive", () => {
      const tags = createMetaTags({ robots: "index, follow" });
      const result = generateDiagnostics(tags);
      expect(result.robots.status).toBe("green");
    });
  });

  describe("overall status", () => {
    it("returns red overall when any check is red", () => {
      const tags = createMetaTags(); // Missing title and description
      const result = generateDiagnostics(tags);
      expect(result.overall.status).toBe("red");
      expect(result.overall.message).toContain("Critical");
    });

    it("returns yellow overall when worst is yellow", () => {
      const tags = createMetaTags({
        title: "Good Title",
        description:
          "A description that is long enough to pass the minimum check",
        canonical: "https://example.com/",
        og: {
          title: "OG Title",
          description: "OG Description",
          type: "website",
          url: "https://example.com/",
          image: "/images/og.jpg", // relative path = yellow
          imageAlt: undefined,
          siteName: undefined,
          locale: undefined,
        },
        twitter: {
          card: "summary_large_image",
          site: undefined,
          creator: undefined,
          title: undefined,
          description: undefined,
          image: undefined,
          imageAlt: undefined,
        },
      });
      const result = generateDiagnostics(tags);
      expect(result.overall.status).toBe("yellow");
    });

    it("returns green overall when all checks pass", () => {
      const tags = createMetaTags({
        title: "Good Title",
        description:
          "A description that is long enough to pass the minimum check for search engines",
        canonical: "https://example.com/",
        og: {
          title: "OG Title",
          description: "OG Description",
          type: "website",
          url: "https://example.com/",
          image: "https://example.com/image.jpg",
          imageAlt: undefined,
          siteName: undefined,
          locale: undefined,
        },
        twitter: {
          card: "summary_large_image",
          site: undefined,
          creator: undefined,
          title: undefined,
          description: undefined,
          image: undefined,
          imageAlt: undefined,
        },
      });
      const result = generateDiagnostics(tags);
      expect(result.overall.status).toBe("green");
    });
  });
});
