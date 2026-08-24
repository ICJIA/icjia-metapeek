/**
 * @fileoverview Tests for the fetch-spa DNS pinning helpers. The SPA renderer
 * must not let Chromium re-resolve the target hostname after validation —
 * a rebinding attacker could flip DNS to a private IP between the Node-side
 * check and page.goto(). The fix pins the validated IP via
 * --host-resolver-rules, closing the TOCTOU window the Nitro fetcher already
 * closes with its pinned undici dispatcher.
 */

import { describe, it, expect } from "vitest";
import {
  pickPinnedAddress,
  buildHostResolverRules,
  validateUrlForSpa,
} from "../../netlify/functions/fetch-spa.mjs";

describe("pickPinnedAddress", () => {
  it("prefers the first IPv4 address when both families resolved", () => {
    expect(
      pickPinnedAddress({
        ipv4: ["93.184.216.34", "93.184.216.35"],
        ipv6: ["2606:2800:220:1:248:1893:25c8:1946"],
      }),
    ).toBe("93.184.216.34");
  });

  it("brackets an IPv6-only address for host-resolver-rules syntax", () => {
    expect(
      pickPinnedAddress({
        ipv4: [],
        ipv6: ["2606:2800:220:1:248:1893:25c8:1946"],
      }),
    ).toBe("[2606:2800:220:1:248:1893:25c8:1946]");
  });

  it("returns null when nothing resolved", () => {
    expect(pickPinnedAddress({ ipv4: [], ipv6: [] })).toBeNull();
    expect(pickPinnedAddress(undefined)).toBeNull();
  });
});

describe("buildHostResolverRules", () => {
  it("pins the target hostname BEFORE the wildcard NOTFOUND rule", () => {
    // Chromium applies MAP rules first-match-wins in listed order, so the
    // pinned rule must come first or the wildcard would swallow the target.
    expect(buildHostResolverRules("example.com", "93.184.216.34")).toBe(
      "MAP example.com 93.184.216.34, MAP * ~NOTFOUND",
    );
  });
});

describe("validateUrlForSpa", () => {
  it("rejects non-http(s) protocols", async () => {
    const result = await validateUrlForSpa("ftp://example.com/");
    expect(result.ok).toBe(false);
  });

  it("rejects private IPv4 literals", async () => {
    const result = await validateUrlForSpa("https://192.168.1.1/");
    expect(result.ok).toBe(false);
  });

  it("rejects blocked hostnames", async () => {
    const result = await validateUrlForSpa("https://localhost/admin");
    expect(result.ok).toBe(false);
  });

  it("returns the resolved public addresses for DNS pinning", async () => {
    const result = await validateUrlForSpa("https://example.com/");
    expect(result.ok).toBe(true);
    expect(result.hostname).toBe("example.com");
    const total =
      (result.resolved?.ipv4.length ?? 0) + (result.resolved?.ipv6.length ?? 0);
    expect(total).toBeGreaterThan(0);
    expect(pickPinnedAddress(result.resolved)).toBeTruthy();
  });
});
