/**
 * @fileoverview Tests for StatusReport.vue — the /status page body.
 *
 * Pure presentational: the payload arrives as a prop (the page owns the
 * fetch), so the component mounts without Nuxt runtime. What matters: the
 * verdict is stated in words, the budget meters carry real ARIA semantics,
 * the numbers shown are the payload's, and the raw JSON escape hatch points
 * at the API. An unconfigured Supabase (local dev) degrades the sections,
 * not the page.
 */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StatusReport from "~/components/StatusReport.vue";
import type { StatusPayload } from "~~/server/api/status.get";

const global = { stubs: { UIcon: { template: "<i />" } } };

const HEALTHY: StatusPayload = {
  ok: true,
  service: "MetaPeek",
  version: "0.18.0",
  commit: "abc1234",
  builtAt: "2026-08-24T12:00:00.000Z",
  now: "2026-08-24T18:00:00.000Z",
  checks: { supabase: { configured: true, ok: true, latencyMs: 42 } },
  usage: {
    last24h: { total: 60, allowed: 58, denied: 2, api: 55, spa: 5 },
    last30d: { total: 900, allowed: 850, denied: 50, api: 800, spa: 100 },
  },
  budget: {
    api: { used: 123, limit: 2000, windowStartedAt: "2026-08-24T03:00:00+00:00" },
    spa: { used: 7, limit: 100, windowStartedAt: "2026-08-24T05:00:00+00:00" },
  },
  errors: { last24h: 1, last30d: 12, lastAt: "2026-08-24T09:30:00+00:00" },
  retentionDays: { requestLog: 90, errorLog: 90 },
};

describe("StatusReport", () => {
  it("states the healthy verdict with version and commit", () => {
    const wrapper = mount(StatusReport, { global, props: { status: HEALTHY } });
    expect(wrapper.text()).toContain("All systems normal");
    expect(wrapper.text()).toContain("v0.18.0");
    expect(wrapper.text()).toContain("abc1234");
  });

  it("exposes the budget as accessible meters with the payload's numbers", () => {
    const wrapper = mount(StatusReport, { global, props: { status: HEALTHY } });
    const meters = wrapper.findAll("[role='meter']");
    expect(meters).toHaveLength(2);
    const api = meters[0]!;
    expect(api.attributes("aria-valuenow")).toBe("123");
    expect(api.attributes("aria-valuemax")).toBe("2000");
    expect((api.attributes("aria-label") ?? "").toLowerCase()).toContain("budget");
    expect(wrapper.text()).toContain("123");
    expect(wrapper.text()).toContain("2,000");
  });

  it("shows the 24h and 30d usage totals", () => {
    const wrapper = mount(StatusReport, { global, props: { status: HEALTHY } });
    expect(wrapper.text()).toContain("60");
    expect(wrapper.text()).toContain("900");
    expect(wrapper.text()).toContain("2"); // denied
  });

  it("shows the persisted failure counts", () => {
    const wrapper = mount(StatusReport, { global, props: { status: HEALTHY } });
    const text = wrapper.text();
    expect(text).toMatch(/failure|error/i);
    expect(text).toContain("12");
  });

  it("keeps meter semantics in range when demand exceeded the cap", () => {
    // check_rate_limits increments the global counter even on denied attempts,
    // so used can exceed limit once the budget trips. The raw number stays
    // visible (real demand is signal), but the meter must not report
    // aria-valuenow beyond aria-valuemax, and the note must say the cap hit.
    const tripped: StatusPayload = {
      ...HEALTHY,
      budget: {
        api: { used: 3412, limit: 2000, windowStartedAt: "2026-08-24T03:00:00+00:00" },
        spa: { used: 7, limit: 100 },
      },
    };
    const wrapper = mount(StatusReport, { global, props: { status: tripped } });
    const api = wrapper.findAll("[role='meter']")[0]!;
    expect(api.attributes("aria-valuenow")).toBe("2000");
    expect(api.attributes("aria-valuemax")).toBe("2000");
    expect(wrapper.text()).toContain("3,412");
    expect(wrapper.text().toLowerCase()).toContain("cap reached");
  });

  it("states the degraded verdict when a configured Supabase is unreachable", () => {
    const degraded: StatusPayload = {
      ...HEALTHY,
      ok: false,
      checks: { supabase: { configured: true, ok: false, latencyMs: 2000 } },
      usage: null,
      budget: null,
      errors: null,
    };
    const wrapper = mount(StatusReport, { global, props: { status: degraded } });
    expect(wrapper.text().toLowerCase()).toContain("degraded");
    expect(wrapper.findAll("[role='meter']")).toHaveLength(0);
  });

  it("treats an unconfigured Supabase as fine — sections absent, verdict normal", () => {
    const local: StatusPayload = {
      ...HEALTHY,
      checks: { supabase: { configured: false } },
      usage: null,
      budget: null,
      errors: null,
    };
    const wrapper = mount(StatusReport, { global, props: { status: local } });
    expect(wrapper.text()).toContain("All systems normal");
    expect(wrapper.text().toLowerCase()).toContain("not configured");
  });

  it("links to the raw JSON at the API route", () => {
    const wrapper = mount(StatusReport, { global, props: { status: HEALTHY } });
    const link = wrapper
      .findAll("a")
      .find((a) => a.text().toLowerCase().includes("json"));
    expect(link?.attributes("href")).toBe("/api/status");
  });
});
