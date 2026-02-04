import { describe, it, expect } from "vitest";
import metapeekConfig from "../../metapeek.config";

describe("Rate Limit Configuration", () => {
  it("should have valid rate limit settings in config", () => {
    expect(metapeekConfig.rateLimit.windowLimit).toBe(10);
    expect(metapeekConfig.rateLimit.windowSize).toBe(60);
    expect(metapeekConfig.rateLimit.aggregateBy).toEqual(["ip", "domain"]);
  });

  it("should export config object in fetch.post.ts", async () => {
    // Dynamically import to check the export exists
    const module = await import("../../server/api/fetch.post.ts");

    expect(module.config).toBeDefined();
    expect(module.config.path).toBe("/api/fetch");
    expect(module.config.rateLimit).toBeDefined();
  });

  it("should have matching rate limit values between config and export", async () => {
    const module = await import("../../server/api/fetch.post.ts");

    expect(module.config.rateLimit.windowLimit).toBe(
      metapeekConfig.rateLimit.windowLimit,
    );
    expect(module.config.rateLimit.windowSize).toBe(
      metapeekConfig.rateLimit.windowSize,
    );
    expect(module.config.rateLimit.aggregateBy).toEqual(
      metapeekConfig.rateLimit.aggregateBy,
    );
  });

  it("should have reasonable rate limit values", () => {
    // Window limit should be positive and reasonable (not too low, not too high)
    expect(metapeekConfig.rateLimit.windowLimit).toBeGreaterThan(0);
    expect(metapeekConfig.rateLimit.windowLimit).toBeLessThanOrEqual(100);

    // Window size should be in seconds (typically 60 for 1 minute)
    expect(metapeekConfig.rateLimit.windowSize).toBeGreaterThan(0);
    expect(metapeekConfig.rateLimit.windowSize).toBeLessThanOrEqual(3600); // max 1 hour

    // Aggregation should include 'ip' at minimum
    expect(metapeekConfig.rateLimit.aggregateBy).toContain("ip");
  });
});
