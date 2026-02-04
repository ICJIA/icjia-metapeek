// tests/security/ssrf.test.ts
// Comprehensive SSRF protection tests

import { describe, it, expect } from "vitest";
import {
  validateUrl,
  isPrivateIp,
  isPrivateIpv6,
} from "../../server/utils/proxy";

describe("SSRF Protection", () => {
  describe("isPrivateIp - IPv4 Private Ranges", () => {
    it("blocks 10.0.0.0/8 private network", () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true);
      expect(isPrivateIp("10.255.255.255")).toBe(true);
      expect(isPrivateIp("10.123.45.67")).toBe(true);
    });

    it("blocks 172.16.0.0/12 private network", () => {
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("172.31.255.255")).toBe(true);
      expect(isPrivateIp("172.20.10.5")).toBe(true);
    });

    it("blocks 192.168.0.0/16 private network", () => {
      expect(isPrivateIp("192.168.0.1")).toBe(true);
      expect(isPrivateIp("192.168.255.255")).toBe(true);
      expect(isPrivateIp("192.168.1.1")).toBe(true);
    });

    it("blocks 127.0.0.0/8 loopback", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("127.255.255.255")).toBe(true);
      expect(isPrivateIp("127.1.2.3")).toBe(true);
    });

    it("blocks 169.254.0.0/16 link-local (AWS/Azure metadata)", () => {
      expect(isPrivateIp("169.254.169.254")).toBe(true);
      expect(isPrivateIp("169.254.0.1")).toBe(true);
      expect(isPrivateIp("169.254.255.255")).toBe(true);
    });

    it("blocks 0.0.0.0/8 invalid/reserved", () => {
      expect(isPrivateIp("0.0.0.0")).toBe(true);
      expect(isPrivateIp("0.255.255.255")).toBe(true);
    });

    it("blocks 224.0.0.0/4 multicast", () => {
      expect(isPrivateIp("224.0.0.1")).toBe(true);
      expect(isPrivateIp("239.255.255.255")).toBe(true);
    });

    it("blocks 240.0.0.0/4 reserved", () => {
      expect(isPrivateIp("240.0.0.1")).toBe(true);
      expect(isPrivateIp("255.255.255.255")).toBe(true);
    });

    it("allows public IPv4 addresses", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false); // Google DNS
      expect(isPrivateIp("1.1.1.1")).toBe(false); // Cloudflare DNS
      expect(isPrivateIp("93.184.216.34")).toBe(false); // example.com
    });

    it("blocks invalid IP formats", () => {
      expect(isPrivateIp("256.1.1.1")).toBe(true);
      expect(isPrivateIp("1.1.1")).toBe(true);
      expect(isPrivateIp("not-an-ip")).toBe(true);
    });
  });

  describe("isPrivateIpv6 - IPv6 Private Ranges", () => {
    it("blocks ::1 loopback", () => {
      expect(isPrivateIpv6("::1")).toBe(true);
      expect(isPrivateIpv6("::1/128")).toBe(true);
    });

    it("blocks fc00::/7 unique local addresses (ULA)", () => {
      expect(isPrivateIpv6("fc00::1")).toBe(true);
      expect(isPrivateIpv6("fd00::1")).toBe(true);
      expect(isPrivateIpv6("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(
        true,
      );
    });

    it("blocks fe80::/10 link-local addresses", () => {
      expect(isPrivateIpv6("fe80::1")).toBe(true);
      expect(isPrivateIpv6("fe80::dead:beef")).toBe(true);
      expect(isPrivateIpv6("fe80::1%eth0")).toBe(true); // with zone
      expect(isPrivateIpv6("feb0::1")).toBe(true);
    });

    it("blocks ff00::/8 multicast", () => {
      expect(isPrivateIpv6("ff00::1")).toBe(true);
      expect(isPrivateIpv6("ff02::1")).toBe(true);
      expect(isPrivateIpv6("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(
        true,
      );
    });

    it("blocks ::ffff:0:0/96 IPv4-mapped IPv6 addresses", () => {
      expect(isPrivateIpv6("::ffff:192.168.1.1")).toBe(true);
      expect(isPrivateIpv6("::ffff:10.0.0.1")).toBe(true);
      expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    });

    it("blocks :: unspecified address", () => {
      expect(isPrivateIpv6("::")).toBe(true);
      expect(isPrivateIpv6("::/128")).toBe(true);
    });

    it("allows public IPv6 addresses", () => {
      expect(isPrivateIpv6("2001:4860:4860::8888")).toBe(false); // Google DNS
      expect(isPrivateIpv6("2606:4700:4700::1111")).toBe(false); // Cloudflare
    });
  });

  describe("validateUrl - Hostname Blocking", () => {
    it("blocks localhost", async () => {
      const result = await validateUrl("http://localhost:3000");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Internal");
    });

    it("blocks 127.0.0.1", async () => {
      const result = await validateUrl("http://127.0.0.1");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Internal");
    });

    it("blocks ::1 (IPv6 loopback)", async () => {
      // Note: URL parsing extracts hostname without brackets
      // The DNS resolution will fail for [::1] as a hostname
      // but the actual IPv6 address ::1 is blocked in BLOCKED_HOSTNAMES
      const result = await validateUrl("http://[::1]:3000");
      expect(result.ok).toBe(false);
      // Either blocked as internal hostname or DNS resolution fails
      expect(result.reason).toMatch(/Internal|Could not resolve/);
    });

    it("blocks metadata.google.internal", async () => {
      const result = await validateUrl(
        "http://metadata.google.internal/computeMetadata/v1/",
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Internal");
    });

    it("blocks 169.254.169.254 (AWS metadata)", async () => {
      const result = await validateUrl("http://169.254.169.254");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Internal");
    });
  });

  describe("validateUrl - Input Validation", () => {
    it("rejects empty strings", async () => {
      const result = await validateUrl("");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("required");
    });

    it("rejects non-string inputs", async () => {
      const result = await validateUrl(null as unknown as string);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("required");
    });

    it("rejects invalid URL formats", async () => {
      const result = await validateUrl("not-a-url");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Invalid URL");
    });

    it("rejects excessively long URLs", async () => {
      const longUrl = "https://example.com/" + "a".repeat(3000);
      const result = await validateUrl(longUrl);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("maximum length");
    });
  });

  describe("validateUrl - Protocol Validation", () => {
    it("allows HTTPS URLs", async () => {
      const result = await validateUrl("https://example.com");
      expect(result.ok).toBe(true);
    });

    it("blocks non-HTTP(S) protocols", async () => {
      const protocols = ["ftp://", "file://", "javascript:", "data:"];

      for (const proto of protocols) {
        const result = await validateUrl(proto + "example.com");
        expect(result.ok).toBe(false);
        expect(result.reason).toContain("Protocol not allowed");
      }
    });

    // Note: HTTP blocking in production is tested in integration tests
    // since it depends on NODE_ENV
  });

  describe("validateUrl - DNS Resolution", () => {
    it("allows domains that resolve to public IPs", async () => {
      const result = await validateUrl("https://example.com");
      expect(result.ok).toBe(true);
    });

    it("rejects domains that don't exist", async () => {
      const result = await validateUrl(
        "https://this-domain-definitely-does-not-exist-12345.com",
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Could not resolve");
    });

    // Note: Testing domains that resolve to private IPs requires
    // either mocking DNS or using actual test domains, which is
    // covered in integration tests
  });
});
