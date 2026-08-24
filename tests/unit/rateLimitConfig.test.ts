/**
 * @fileoverview Tests for shared/rate-limit-config.mjs — the single source of
 * truth for the tier tables. metapeek.config.ts and the standalone fetch-spa
 * function both import it, so the "keep these in sync by hand" comment (and
 * the drift risk it admitted) is gone.
 */

import { describe, it, expect } from "vitest";
import { RATE_LIMIT } from "#shared/rate-limit-config.mjs";
import metapeekConfig from "../../metapeek.config";

describe("shared rate-limit config", () => {
  it("carries the full tier table", () => {
    expect(RATE_LIMIT.trustedSuffixes).toEqual(["illinois.gov", "icjia.app"]);
    expect(RATE_LIMIT.tiers.trusted).toEqual({ perMinute: 30, perDay: 500 });
    expect(RATE_LIMIT.tiers.default).toEqual({ perMinute: 5, perDay: 50 });
    expect(RATE_LIMIT.spa.trusted).toEqual({ perMinute: 3, perDay: 60 });
    expect(RATE_LIMIT.spa.default).toEqual({ perMinute: 1, perDay: 10 });
    expect(RATE_LIMIT.global).toEqual({ perDay: 2000, spaPerDay: 100 });
  });

  it("is the very object metapeek.config.ts exposes (no drift possible)", () => {
    expect(metapeekConfig.rateLimit).toBe(RATE_LIMIT);
  });
});
