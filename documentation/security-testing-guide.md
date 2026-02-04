# MetaPeek Security Testing Guide

**Purpose:** Verify that the Phase 2 proxy endpoint is secure against common attack vectors.

**When to run:** Before deploying Phase 2 to production, and after any changes to the proxy logic.

---

## 1. SSRF (Server-Side Request Forgery) Tests

### Test 1.1: Cloud Metadata Endpoints

**Attack:** Access cloud provider metadata APIs that expose credentials and configuration.

```bash
# AWS/Azure metadata endpoint
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://169.254.169.254/latest/meta-data/"}'

# Google Cloud metadata
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://metadata.google.internal/computeMetadata/v1/"}'
```

**Expected:** `400 Bad Request` with message about private IP or blocked hostname.

---

### Test 1.2: Internal Network Access (RFC 1918)

**Attack:** Access internal services on private networks.

```bash
# 10.0.0.0/8
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://10.0.0.1/"}'

# 172.16.0.0/12
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://172.16.0.1/"}'

# 192.168.0.0/16
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://192.168.1.1/"}'
```

**Expected:** `400 Bad Request` with message about private IP.

---

### Test 1.3: Localhost/Loopback Access

**Attack:** Access services running on the proxy server itself.

```bash
# localhost
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localhost:6379/"}'

# 127.0.0.1
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://127.0.0.1:6379/"}'

# IPv6 loopback
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://[::1]:6379/"}'
```

**Expected:** `400 Bad Request` with message about blocked hostname or private IP.

---

### Test 1.4: DNS Rebinding Attack

**Attack:** Domain that resolves to public IP first, then private IP on second lookup.

**Setup:** This requires a malicious DNS server. For testing, use a domain known to resolve to localhost:

```bash
# Example using a test domain (if available)
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localtest.me/"}'  # resolves to 127.0.0.1
```

**Expected:** `400 Bad Request` - our DNS check should catch this.

---

### Test 1.5: Protocol Bypass

**Attack:** Use non-HTTP protocols to access local resources.

```bash
# file:// protocol
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"file:///etc/passwd"}'

# ftp:// protocol
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"ftp://internal-server/"}'

# gopher:// protocol
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"gopher://internal-server/"}'
```

**Expected:** `400 Bad Request` with message about protocol not allowed.

---

## 2. Denial of Service (DoS) Tests

### Test 2.1: Response Size Limit

**Attack:** Request a URL that returns a very large response.

```bash
# Large file (adjust URL to something that returns > 1MB)
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/10mb-file.zip"}'
```

**Expected:** `413 Payload Too Large` with message about exceeding 1MB limit.

---

### Test 2.2: Slow Response (Slowloris)

**Attack:** Request a URL that responds very slowly.

**Setup:** Use a test endpoint that delays responses:

```bash
# Use a slow endpoint (httpbin has a delay endpoint)
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/delay/15"}'  # 15 second delay
```

**Expected:** `504 Gateway Timeout` after 10 seconds (config: `fetchTimeoutMs: 10_000`).

---

### Test 2.3: Redirect Loop

**Attack:** URL that redirects infinitely.

```bash
# Create a redirect loop (if you have a test server)
# Or use a known redirect loop endpoint
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/redirect-loop"}'
```

**Expected:** Should stop after 5 redirects (config: `maxRedirects: 5`).

---

### Test 2.4: URL Length Limit

**Attack:** Extremely long URL.

```bash
# Generate 3000 character URL
LONG_URL="https://example.com/$(printf 'a%.0s' {1..3000})"

curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$LONG_URL\"}"
```

**Expected:** `400 Bad Request` with message about URL length exceeding 2048 chars.

---

## 3. Input Validation Tests

### Test 3.1: Missing URL Field

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** `400 Bad Request` with message about missing URL field.

---

### Test 3.2: Invalid URL Format

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"not-a-url"}'
```

**Expected:** `400 Bad Request` with message about invalid URL format.

---

### Test 3.3: Empty URL

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":""}'
```

**Expected:** `400 Bad Request` with message about URL required.

---

### Test 3.4: Unexpected Fields (Parameter Pollution)

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","extra":"field","admin":true}'
```

**Expected:** `400 Bad Request` with message about unexpected fields.

---

### Test 3.5: Wrong Content-Type

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: text/plain" \
  -d 'url=https://example.com'
```

**Expected:** `400 Bad Request` with message about invalid request body.

---

## 4. Rate Limiting Tests

### Test 4.1: Excessive Requests

**Attack:** Send more than 30 requests per minute from same IP.

```bash
# Send 35 requests in quick succession
for i in {1..35}; do
  curl -X POST http://localhost:3000/api/fetch \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com"}' &
done
wait
```

**Expected:** First 30 succeed, remaining 5 return `429 Too Many Requests`.

---

### Test 4.2: Rate Limit Recovery

**Attack:** Verify rate limit window resets correctly.

```bash
# Send 30 requests
for i in {1..30}; do
  curl -s -X POST http://localhost:3000/api/fetch \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com"}' > /dev/null
done

# Wait 61 seconds (window is 60 seconds)
sleep 61

# Try again - should succeed
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

**Expected:** Final request succeeds with `200 OK`.

---

## 5. Authentication Tests (If API Key Is Enabled)

### Test 5.1: Missing API Key

```bash
# Set METAPEEK_API_KEY=test-key-123 in environment first

curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

**Expected:** `401 Unauthorized` with message about missing API key.

---

### Test 5.2: Invalid API Key

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong-key" \
  -d '{"url":"https://example.com"}'
```

**Expected:** `401 Unauthorized` with message about invalid API key.

---

### Test 5.3: Valid API Key

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key-123" \
  -d '{"url":"https://example.com"}'
```

**Expected:** `200 OK` with HTML response.

---

## 6. Redirect Security Tests

### Test 6.1: Redirect to Private IP

**Attack:** Public URL that redirects to internal service.

**Setup:** You'd need to control a domain that 301 redirects to `http://169.254.169.254/`

```bash
# Example (requires test domain)
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://malicious-redirect.example.com/"}'
```

**Expected:** `400 Bad Request` with message about redirect blocked.

---

### Test 6.2: Too Many Redirects

```bash
# Use httpbin's redirect endpoint
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/redirect/10"}'  # 10 redirects
```

**Expected:** Should stop after 5 redirects and return whatever page it lands on.

---

## 7. Content Security Tests

### Test 7.1: Script Tag Stripping

**Attack:** Verify that `<script>` tags are removed from response.

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

**Verify:** Inspect response `head` field - should NOT contain any `<script>` tags except `<script type="application/ld+json">`.

---

### Test 7.2: JSON-LD Preservation

**Attack:** Verify that structured data scripts are NOT removed.

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

**Verify:** Response `head` field SHOULD contain `<script type="application/ld+json">` if present on page.

---

## 8. Information Leakage Tests

### Test 8.1: Error Message Information

**Attack:** Trigger various errors and verify they don't leak internal details.

```bash
# Trigger DNS error
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://this-domain-does-not-exist-xyz123.com/"}'

# Trigger timeout
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/delay/15"}'

# Trigger private IP
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://10.0.0.1/"}'
```

**Verify:** Error messages should be generic and user-friendly. They should NOT include:

- Stack traces
- File paths
- Internal IP addresses
- Server versions
- Node.js versions
- Framework details

---

## 9. CORS Tests

### Test 9.1: Allowed Origin

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -H "Origin: https://metapeek.icjia.app" \
  -d '{"url":"https://example.com"}'
```

**Expected:** Response includes `Access-Control-Allow-Origin: https://metapeek.icjia.app`.

---

### Test 9.2: Disallowed Origin

```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -H "Origin: https://malicious-site.com" \
  -d '{"url":"https://example.com"}'
```

**Expected:** Request may succeed server-side, but browser would block due to missing CORS header. (CORS is enforced by browser, not server for POST requests without preflight).

---

## 10. Production Deployment Tests

### Test 10.1: HTTP Disallowed in Production

**Setup:** Set `NODE_ENV=production`

```bash
NODE_ENV=production curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://example.com"}'  # HTTP, not HTTPS
```

**Expected:** `400 Bad Request` with message about HTTPS required in production.

---

### Test 10.2: Rate Limit Configuration (Unit Test)

**Verify:** Run the automated unit test:

```bash
yarn test tests/unit/rateLimit.test.ts
```

**Expected:** All tests pass, confirming:

- Rate limit values are defined in `metapeek.config.ts`
- `export const config` exists in `server/api/fetch.post.ts`
- Values match between config and export (30 req/min, 60 sec window)

**Cost:** Free - runs locally, no network requests

---

### Test 10.3: Netlify Rate Limit Detection (Deploy Logs)

**Verify:** After deploying to Netlify, check the deploy log.

**Expected:** Deploy log should mention:

```
◈ Rate limiting enabled for /api/fetch
```

If not present, the `export const config` may not be formatted correctly.

**Cost:** Free - just reading logs

**Security Note:** We do NOT provide executable scripts that hit production to test rate limiting. The combination of unit tests + deploy log confirmation is sufficient verification.

---

### Test 10.4: Function Timeout

**Verify:** In Netlify dashboard, check function settings.

**Expected:** Function timeout should be set to 26 seconds (requested from Netlify support).

---

## 11. Security Audit Checklist

Before deploying Phase 2 to production:

- [ ] All SSRF tests passing (Tests 1.1-1.5)
- [ ] All DoS tests passing (Tests 2.1-2.4)
- [ ] All input validation tests passing (Tests 3.1-3.5)
- [ ] Rate limiting working (Tests 4.1-4.2)
- [ ] Script tags stripped from responses (Test 7.1)
- [ ] JSON-LD preserved (Test 7.2)
- [ ] Error messages don't leak information (Test 8.1)
- [ ] CORS configured correctly (Tests 9.1-9.2)
- [ ] HTTP blocked in production (Test 10.1)
- [ ] Netlify rate limit active (Test 10.2)
- [ ] Function timeout increased to 26s (Test 10.3)
- [ ] No secrets in logs or error responses
- [ ] HTTPS enforced in production
- [ ] DNS resolution checks private IPs
- [ ] Response size limits enforced
- [ ] Timeout limits enforced

---

## 12. Automated Security Testing

Create a test file `tests/security/ssrf.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateUrl, isPrivateIp } from "~/server/utils/proxy";

describe("SSRF Protection", () => {
  describe("isPrivateIp", () => {
    it("blocks 10.0.0.0/8", async () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true);
      expect(isPrivateIp("10.255.255.255")).toBe(true);
    });

    it("blocks 172.16.0.0/12", async () => {
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("172.31.255.255")).toBe(true);
    });

    it("blocks 192.168.0.0/16", async () => {
      expect(isPrivateIp("192.168.0.1")).toBe(true);
      expect(isPrivateIp("192.168.255.255")).toBe(true);
    });

    it("blocks 127.0.0.0/8 (loopback)", async () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("127.255.255.255")).toBe(true);
    });

    it("blocks 169.254.0.0/16 (link-local)", async () => {
      expect(isPrivateIp("169.254.169.254")).toBe(true);
      expect(isPrivateIp("169.254.0.1")).toBe(true);
    });

    it("blocks 0.0.0.0/8", async () => {
      expect(isPrivateIp("0.0.0.0")).toBe(true);
    });

    it("blocks multicast (224.0.0.0/4)", async () => {
      expect(isPrivateIp("224.0.0.1")).toBe(true);
      expect(isPrivateIp("239.255.255.255")).toBe(true);
    });

    it("blocks reserved (240.0.0.0/4)", async () => {
      expect(isPrivateIp("240.0.0.1")).toBe(true);
      expect(isPrivateIp("255.255.255.255")).toBe(true);
    });

    it("allows public IPs", async () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false); // Google DNS
      expect(isPrivateIp("1.1.1.1")).toBe(false); // Cloudflare DNS
      expect(isPrivateIp("93.184.216.34")).toBe(false); // example.com
    });
  });

  describe("validateUrl", () => {
    it("rejects localhost", async () => {
      const result = await validateUrl("http://localhost/");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Internal");
    });

    it("rejects 127.0.0.1", async () => {
      const result = await validateUrl("http://127.0.0.1/");
      expect(result.ok).toBe(false);
    });

    it("rejects metadata endpoint", async () => {
      const result = await validateUrl("http://169.254.169.254/");
      expect(result.ok).toBe(false);
    });

    it("rejects file:// protocol", async () => {
      const result = await validateUrl("file:///etc/passwd");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Protocol");
    });

    it("rejects empty URL", async () => {
      const result = await validateUrl("");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("required");
    });

    it("rejects invalid URL format", async () => {
      const result = await validateUrl("not-a-url");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Invalid URL");
    });

    it("accepts valid public HTTPS URL", async () => {
      const result = await validateUrl("https://example.com");
      expect(result.ok).toBe(true);
    });
  });
});
```

Run with: `yarn test tests/security/`

---

## 13. Monitoring & Alerts

After deployment, monitor:

1. **Netlify Function Invocation Count**
   - Check daily for first week
   - Set up alert if > 10,000/day (potential abuse)

2. **429 Rate Limit Responses**
   - Monitor count in Netlify Analytics
   - Investigate if consistently high (might need to lower limit)

3. **Error Rates**
   - Track 400/500 responses
   - Investigate patterns (same IP, same URL)

4. **Response Times**
   - Monitor average timing
   - Alert if > 5 seconds average (upstream issues)

5. **Geographic Distribution**
   - Check where requests originate
   - Unexpected countries might indicate abuse

---

## Summary

**Critical Security Controls:**

1. ✅ SSRF protection via DNS resolution + private IP checks
2. ✅ Protocol whitelist (HTTPS only in production)
3. ✅ Response size limits (1MB max)
4. ✅ Timeout enforcement (10 seconds)
5. ✅ Rate limiting (30 req/min per IP)
6. ✅ Input validation (URL format, length, unexpected fields)
7. ✅ Script tag stripping (except JSON-LD)
8. ✅ Error message sanitization
9. ✅ Redirect validation (no redirect to private IPs)
10. ✅ No credential forwarding to target sites

**Defense in Depth:** Multiple layers protect against each threat. Even if one fails, others catch malicious requests.

**Test Before Deploy:** Run all tests in sections 1-10 before deploying Phase 2 to production.
