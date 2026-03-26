# MetaPeek Security Audit

**Project:** MetaPeek (icjia-metapeek)
**Audit Date:** 2026-03-26
**Auditor:** Red Team / Blue Team Assessment
**Scope:** Server-side proxy, API endpoints, HTML parsing, deployment configuration
**Version:** Current `main` branch (commit `605cc06`)

---

## 1. Executive Summary

MetaPeek is a Nuxt 4 web application deployed on Netlify that acts as a server-side proxy: it fetches arbitrary user-supplied URLs, extracts HTML meta tags, and returns structured analysis results. This architecture inherently creates a significant attack surface, particularly around Server-Side Request Forgery (SSRF). The codebase demonstrates strong security awareness with multiple layers of defense-in-depth, but several gaps remain.

### Finding Summary

| Severity | Count | Description |
|----------|-------|-------------|
| Critical | 0 | No critical vulnerabilities found |
| High | 3 | Content-Length bypass, CSP unsafe-inline, body snippet data leakage |
| Medium | 5 | CORS misconfiguration, no Content-Type validation, `Math.random()` request IDs, error classification leakage, `img-src *` CSP directive |
| Low | 4 | Cookie header no-op, edge-only rate limiting portability, extractHead regex edge cases, non-cryptographic randomness in logs |
| Info | 3 | IPv4-mapped IPv6 handling (properly mitigated), parameter pollution rejection (good), timing-safe auth (good) |

**Overall Security Posture: GOOD** -- The application implements substantially above-average security controls for a URL-fetching proxy. The SSRF protections are comprehensive and well-designed. The findings below represent hardening opportunities rather than critical vulnerabilities.

---

## 2. Red Team Findings

### RT-01: Content-Length Check Bypass via Chunked Transfer Encoding

**Severity:** HIGH
**File:** `server/utils/fetcher.ts`, lines 121-138
**Category:** Denial of Service / Resource Exhaustion

**Description:**
The response size check relies on two mechanisms: (1) the `Content-Length` header, and (2) post-download string length check. However, HTTP servers using chunked transfer encoding (`Transfer-Encoding: chunked`) do not send a `Content-Length` header. The first check at line 121 is skipped entirely in this case. The second check at line 133 only fires after the entire response body has already been downloaded and stored in memory as a string.

**Attack Scenario:**
An attacker hosts a server that responds with `Transfer-Encoding: chunked` and slowly streams a response just under or at the 5MB limit. While the final size check will eventually reject responses over 5MB, the server must first download the full payload into memory. With concurrent requests, this could exhaust server memory.

**Proof of Concept:**
```javascript
// Attacker's server
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Transfer-Encoding': 'chunked'
  });
  // Stream 5MB of data slowly, no Content-Length header
  const chunk = '<div>' + 'A'.repeat(65536) + '</div>';
  let sent = 0;
  const interval = setInterval(() => {
    res.write(chunk);
    sent += chunk.length;
    if (sent > 5 * 1024 * 1024) {
      clearInterval(interval);
      res.end('</body></html>');
    }
  }, 100);
}).listen(8080);
```

**Remediation:**
Implement streaming size validation. Use a `ReadableStream` or `TransformStream` that counts bytes as they arrive and aborts the request when the limit is exceeded, rather than waiting for the full response:

```typescript
// Track bytes during download, abort if limit exceeded
let receivedBytes = 0;
const reader = response.body.getReader();
const chunks = [];
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  receivedBytes += value.length;
  if (receivedBytes > options.maxBytes) {
    reader.cancel();
    throw Object.assign(new Error('Response too large'), { code: 'ERR_RESPONSE_TOO_LARGE' });
  }
  chunks.push(value);
}
```

**Effort:** Medium (requires refactoring `pinnedFetch` to use streaming)

---

### RT-02: CSP Allows `unsafe-inline` for Both Scripts and Styles

**Severity:** HIGH
**File:** `netlify.toml`, line 18
**Category:** Client-Side / Cross-Site Scripting

**Description:**
The Content Security Policy includes `script-src 'self' 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'`. The `unsafe-inline` directive for scripts effectively negates much of CSP's XSS protection. If any user-controlled content is rendered in the DOM without proper sanitization, an attacker can execute arbitrary JavaScript.

While MetaPeek currently renders fetched HTML metadata as text (via Vue's template interpolation, which auto-escapes), the `unsafe-inline` in `script-src` means that any future XSS vulnerability would not be mitigated by CSP.

**Current CSP:**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src * data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'
```

**Attack Scenario:**
If a fetched meta tag value containing `<script>alert(1)</script>` or an event handler like `<img onerror="alert(1)">` were ever rendered via `v-html` instead of text interpolation, CSP would not block it.

**Remediation:**
1. Replace `'unsafe-inline'` in `script-src` with nonce-based CSP: `script-src 'self' 'nonce-{random}'`.
2. Nuxt 4 supports CSP nonces via the `security` module or custom server middleware.
3. For `style-src`, `'unsafe-inline'` is harder to remove due to Vue's scoped styles and Tailwind, but consider migrating to `'unsafe-hashes'` with specific style hashes.

**Effort:** High (requires Nuxt CSP nonce integration, testing all inline scripts)

---

### RT-03: Body Snippet Returns Raw HTML That May Contain Sensitive Data

**Severity:** HIGH
**File:** `server/utils/proxy.ts`, lines 384-393; `server/api/fetch.post.ts`, line 138
**Category:** Information Disclosure

**Description:**
The `extractBodySnippet` function returns the first 1024 characters of raw `<body>` content with no sanitization. This content is sent directly to the client in the API response. If the target page contains server-rendered content such as user data, API keys, session tokens, CSRF tokens, or internal URLs in its first 1024 body characters, these are forwarded to the MetaPeek user.

**Proof of Concept:**
```html
<!-- Target page body -->
<body>
  <div id="app" data-csrf="a1b2c3d4e5" data-user="admin@internal.corp">
    <script>window.__INITIAL_STATE__ = {"apiKey":"sk-live-xxxx","user":{"email":"admin@corp.com"}}</script>
```

The above would be captured and returned verbatim. Note that script stripping only happens in `extractHead`, not in `extractBodySnippet`.

**Remediation:**
1. Strip all HTML tags from the body snippet, returning only text content.
2. Alternatively, strip `<script>` tags and HTML attributes from the body snippet the same way `extractHead` does.
3. Consider whether the body snippet is necessary at all -- if it is only used for preview purposes, a text-only version is safer.

```typescript
export function extractBodySnippet(html: string, maxLength = 1024): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return "";
  // Strip all HTML tags, return text only
  const textOnly = (bodyMatch[1] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return textOnly.substring(0, maxLength);
}
```

**Effort:** Low

---

### RT-04: CORS Configuration Only Sets First Origin from Array

**Severity:** MEDIUM
**File:** `nuxt.config.ts`, line 61
**Category:** Configuration / Access Control

**Description:**
The CORS `Access-Control-Allow-Origin` header is hardcoded to `metapeekConfig.cors.allowedOrigins[0]`, which is always `"https://metapeek.icjia.app"`. In development, `http://localhost:3000` is pushed to the array at index 1 but is never used in the CORS header. This means:

1. In production, this works correctly (single origin).
2. In development, cross-origin requests from `http://localhost:3000` to the API will fail because the CORS header only returns the production origin.
3. If additional origins are ever added (e.g., a staging domain), they will be silently ignored.

**Code:**
```typescript
// nuxt.config.ts:61
"Access-Control-Allow-Origin": metapeekConfig.cors.allowedOrigins[0],
```

**Remediation:**
Implement dynamic origin validation in server middleware:

```typescript
// server/middleware/cors.ts
export default defineEventHandler((event) => {
  const origin = getHeader(event, 'origin');
  if (origin && metapeekConfig.cors.allowedOrigins.includes(origin)) {
    setHeader(event, 'Access-Control-Allow-Origin', origin);
    setHeader(event, 'Vary', 'Origin');
  }
});
```

**Effort:** Low

---

### RT-05: No Content-Type Validation on Fetched Responses

**Severity:** MEDIUM
**File:** `server/utils/fetcher.ts`, lines 230-234
**Category:** Input Validation

**Description:**
The proxy fetches any URL and processes the response as HTML regardless of the `Content-Type` header. If a user supplies a URL pointing to a binary file (PDF, image, ZIP), the server will download up to 5MB of binary data, attempt to parse it as HTML (which will fail gracefully but waste resources), and return empty results.

More concerning: if the response is `application/json`, `application/xml`, or another text format, it could be parsed by cheerio and potentially return unexpected structured data in the meta tags response.

**Code:**
```typescript
// fetcher.ts:232-233
const contentType = currentResponse.headers.get("content-type") || "text/html";
const html = currentResponse.data;
// No check that contentType is actually HTML
```

**Remediation:**
Validate that the response Content-Type contains `text/html` or `application/xhtml+xml` before processing:

```typescript
const contentType = currentResponse.headers.get("content-type") || "";
if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
  throw createError({
    statusCode: 422,
    message: `URL returned ${contentType || "unknown"} instead of HTML.`,
  });
}
```

**Effort:** Low

---

### RT-06: `generateRequestId()` Uses `Math.random()` -- Not Cryptographically Secure

**Severity:** MEDIUM
**File:** `server/utils/logger.ts`, lines 33-35
**Category:** Information Disclosure / Predictability

**Description:**
Request IDs are generated using `Date.now()` and `Math.random()`. `Math.random()` uses a PRNG that is predictable if the seed is known. While request IDs are used for log correlation (not security), predictable IDs could allow an attacker who gains log access to correlate or forge log entries.

**Code:**
```typescript
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

**Remediation:**
Use `crypto.randomUUID()` or `crypto.randomBytes()`:

```typescript
import { randomUUID } from "node:crypto";
export function generateRequestId(): string {
  return randomUUID();
}
```

**Effort:** Trivial

---

### RT-07: Error Classification Leaks Infrastructure Information

**Severity:** MEDIUM
**File:** `server/utils/proxy.ts`, lines 404-422
**Category:** Information Disclosure

**Description:**
The `sanitizeErrorMessage` function maps specific error codes to distinct messages. While the messages themselves are sanitized, the differentiation between error types reveals information about the target:

- `"Could not resolve hostname"` -- confirms the hostname does not exist (DNS enumeration)
- `"Connection refused by target server"` -- confirms the host exists but the port is not open (port scanning)
- `"Request timed out"` -- suggests a firewall is dropping packets (firewall detection)
- `"Connection reset by target server"` -- suggests the host exists and is actively rejecting (service detection)

An attacker could use MetaPeek as an oracle for network reconnaissance of hosts they cannot directly reach.

**Remediation:**
Consider returning a single generic message for all network errors:

```typescript
return "Unable to connect to the target URL. Verify the URL is correct and the site is accessible.";
```

Alternatively, keep the current messages but add rate limiting per unique target hostname to prevent scanning.

**Effort:** Low (but UX tradeoff -- specific errors help legitimate users debug issues)

---

### RT-08: `img-src *` in CSP Allows Arbitrary Image Loading

**Severity:** MEDIUM
**File:** `netlify.toml`, line 18
**Category:** Client-Side / Content Security Policy

**Description:**
The CSP directive `img-src * data:` allows loading images from any origin. This is intentional (MetaPeek previews OG images from arbitrary domains), but it enables:

1. **Pixel tracking:** A malicious page could include OG image URLs that track when MetaPeek users preview that page.
2. **SSRF-lite via browser:** If OG image URLs point to internal IPs, the user's browser will attempt to load them, potentially hitting internal services on the user's network.
3. **IP disclosure:** External image URLs in previews cause the user's browser to connect directly to the image host, disclosing the user's IP.

**Remediation:**
Consider proxying OG image previews through the server, or displaying image URLs as text with an explicit "Load Preview" button so users consent before their browser connects to external hosts. At minimum, validate image URLs against the same private IP blocklist used for SSRF protection on the client side.

**Effort:** Medium

---

### RT-09: Cookie Header Set to Empty String

**Severity:** LOW
**File:** `server/utils/fetcher.ts`, lines 173, 219
**Category:** Security Misconfiguration

**Description:**
The fetch request includes `Cookie: ""` (empty string header). In HTTP, sending a `Cookie` header with an empty value is different from not sending a `Cookie` header at all. Some servers/WAFs may:
- Log the presence of the Cookie header as unusual
- Interpret the empty string differently than a missing header
- Include a `Set-Cookie` response header (which would be discarded, but indicates server-side state was created)

The `credentials: "omit"` setting at line 116 should already prevent cookie transmission, making the explicit `Cookie: ""` redundant.

**Code:**
```typescript
headers: {
  "User-Agent": metapeekConfig.proxy.userAgent,
  Cookie: "",  // Line 173 and 219
},
```

**Remediation:**
Remove the `Cookie: ""` header entirely. The `credentials: "omit"` on the fetch request already prevents cookie inclusion. If the intent is to explicitly clear cookies, use:

```typescript
// Simply omit the Cookie header
headers: {
  "User-Agent": metapeekConfig.proxy.userAgent,
},
```

**Effort:** Trivial

---

### RT-10: Rate Limiting Is Netlify-Edge-Only

**Severity:** LOW
**File:** `server/api/fetch.post.ts`, lines 195-202; `server/api/analyze.get.ts`, lines 155-162
**Category:** Deployment Portability

**Description:**
Rate limiting is implemented entirely via Netlify's edge rate limiting configuration (exported `config` objects). If the application is ever deployed on a different platform (Vercel, DigitalOcean, bare VPS), there would be zero rate limiting on the proxy endpoints. The `metapeek.config.ts` comments mention DigitalOcean as an alternative deployment target.

**Remediation:**
Implement application-level rate limiting as a fallback using an in-memory store (e.g., `unstorage` with TTL, or a simple Map with cleanup):

```typescript
// server/middleware/rate-limit.ts
const hits = new Map<string, { count: number; resetAt: number }>();

export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return;
  const ip = getClientIp(event) || 'unknown';
  const now = Date.now();
  const entry = hits.get(ip);
  if (entry && now < entry.resetAt) {
    entry.count++;
    if (entry.count > 10) {
      throw createError({ statusCode: 429, message: 'Too many requests' });
    }
  } else {
    hits.set(ip, { count: 1, resetAt: now + 60000 });
  }
});
```

**Effort:** Low

---

### RT-11: `extractHead` Regex Lazy Match Edge Case

**Severity:** LOW
**File:** `server/utils/proxy.ts`, line 353
**Category:** Input Validation / Parsing

**Description:**
The regex `/<head[^>]*>([\s\S]*?)<\/head>/i` uses a lazy quantifier (`*?`), which means it matches the shortest possible string between `<head>` and `</head>`. If a malicious page contains a nested or premature `</head>` tag inside a comment or attribute, the regex will truncate the head content:

```html
<head>
  <meta name="description" content="test">
  <!-- </head> -->
  <meta name="important" content="this is missed">
</head>
```

In this case, the regex stops at the `</head>` inside the comment, missing the real `<meta name="important">` tag.

Similarly, for `extractBodySnippet` at line 388, the lazy match means content after a premature `</body>` in a comment would be missed.

**Impact:** Low. This is an edge case that affects parsing accuracy, not security. The cheerio parser in `shared/parser.ts` (used by `/api/analyze`) handles this correctly since it builds a proper DOM tree.

**Remediation:**
Consider using cheerio for head extraction as well, or switch to a greedy match with the last occurrence:

```typescript
// Use cheerio instead of regex
import { load } from 'cheerio';
export function extractHead(html: string): string {
  const $ = load(html);
  return $('head').html() || '';
}
```

**Effort:** Low

---

### RT-12: No CORS Enforcement on Server Side

**Severity:** LOW
**File:** `nuxt.config.ts`, lines 57-68
**Category:** Access Control

**Description:**
CORS is configured via Nuxt `routeRules`, which sets response headers but does not perform server-side origin validation. The CORS headers instruct browsers to block cross-origin requests, but:

1. Non-browser clients (curl, Postman, scripts) ignore CORS headers entirely.
2. The API endpoints are fully accessible from any origin if called outside a browser context.

This is standard for public APIs, but combined with the dormant authentication (API key not set by default), it means any automated tool can use the proxy.

**Remediation:**
This is acceptable if MetaPeek's API is intended to be public. If not, activate the `METAPEEK_API_KEY` environment variable for production and add server-side origin validation middleware.

**Effort:** Trivial (set the env var)

---

## 3. Blue Team Assessment

### BD-01: SSRF Protection with DNS Pinning

**What it protects against:** DNS rebinding attacks, TOCTOU vulnerabilities where DNS resolves to a public IP during validation but a private IP during fetch.
**Implementation quality:** EXCELLENT
**Files:** `server/utils/proxy.ts`, `server/utils/fetcher.ts`

The implementation resolves DNS during validation, stores the addresses, then creates an undici `Agent` with a pinned lookup function that returns only the pre-validated IPs. This is the correct approach and prevents the entire class of DNS rebinding attacks.

**Minor gap:** The `createPinnedLookup` function is cast via `as any` at line 84 of `fetcher.ts`. This works but suppresses type checking on the lookup signature.

---

### BD-02: Private IP Blocking (IPv4 + IPv6)

**What it protects against:** SSRF to internal services, cloud metadata endpoints, loopback, link-local addresses.
**Implementation quality:** EXCELLENT
**Files:** `server/utils/proxy.ts`, lines 182-341

The IPv4 blocking covers all RFC 1918 ranges, loopback (127.0.0.0/8), link-local (169.254.0.0/16), multicast, and reserved ranges. The IPv6 blocking covers loopback (::1), unspecified (::), ULA (fc00::/7), link-local (fe80::/10), and multicast (ff00::/8).

**IPv4-mapped IPv6 (::ffff:127.0.0.1):** Properly handled. The `isPrivateIpv6` function at lines 328-338 detects the `::ffff:` prefix, converts the last two groups back to IPv4, and runs the `isPrivateIp` check. This correctly blocks `::ffff:127.0.0.1`, `::ffff:169.254.169.254`, etc.

**IPv6 expansion:** The `expandIpv6` function handles `::` abbreviation, zone identifiers (`%eth0`), CIDR suffixes, and IPv4-mapped notation. Invalid addresses are treated as private (blocked).

---

### BD-03: Blocked Hostnames

**What it protects against:** Direct access to known internal/metadata services.
**Implementation quality:** GOOD
**Files:** `server/utils/proxy.ts`, lines 39-46

Blocks `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `metadata.google.internal`, and `169.254.169.254`.

**Gap:** Does not block `metadata.google.internal.` (with trailing dot -- valid DNS), `instance-data` (Azure alias), or cloud-specific metadata hostnames for other providers (Oracle Cloud, DigitalOcean). However, these are covered by the IP-level blocking since they all resolve to link-local or private IPs.

---

### BD-04: IP Literal Blocking

**What it protects against:** Bypassing hostname-based blocklist by using raw IPs.
**Implementation quality:** GOOD
**Files:** `server/utils/proxy.ts`, lines 103-117

IPv4 literals are checked against `isPrivateIp`. All IPv6 literals (detected via `[` prefix or `:` in hostname) are blocked entirely, which is the safest approach since IPv6 literals are rarely used in legitimate URLs.

---

### BD-05: Redirect Validation

**What it protects against:** SSRF via open redirect chains (e.g., public URL redirects to internal IP).
**Implementation quality:** EXCELLENT
**Files:** `server/utils/fetcher.ts`, lines 183-228

Each redirect target is validated with `validateUrl()` including full DNS resolution and private IP checks. New pinned addresses are obtained for each redirect hop. The redirect count is limited to 5.

---

### BD-06: Timing-Safe Authentication

**What it protects against:** Timing attacks on API key comparison.
**Implementation quality:** EXCELLENT
**Files:** `server/utils/auth.ts`

Uses `crypto.timingSafeEqual` with proper length-mismatch handling (performs dummy comparison against self to normalize timing). This prevents both value-based and length-based timing side channels.

---

### BD-07: Parameter Pollution Rejection

**What it protects against:** Unexpected fields in request body that could confuse server logic.
**Implementation quality:** GOOD
**Files:** `server/api/fetch.post.ts`, lines 66-73

Rejects any request body with fields other than `url`. This prevents attackers from injecting additional parameters that might influence fetch behavior.

**Note:** The GET endpoints (`/api/analyze`, `/api/ai-check`) use `getQuery()` which does not reject extra query parameters. This is standard for GET endpoints but means additional parameters could be injected (though they are not used).

---

### BD-08: Structured Logging with URL Sanitization

**What it protects against:** Sensitive data in logs, log injection.
**Implementation quality:** GOOD
**Files:** `server/utils/logger.ts`

Sensitive query parameters (token, key, apikey, secret, password, etc.) are redacted to `[REDACTED]`. Long strings are truncated. Production logs are JSON-formatted (resistant to log injection via newlines).

**Gap:** The sensitive parameter list is case-sensitive. A parameter named `Token` or `API_KEY` (uppercase) would not be redacted.

---

### BD-09: Script Stripping in Head Extraction

**What it protects against:** XSS from scripts in fetched HTML being forwarded to client.
**Implementation quality:** GOOD
**Files:** `server/utils/proxy.ts`, lines 358-363

All `<script>` tags are removed except `application/ld+json` (structured data). The regex is well-constructed with negative lookahead.

**Gap:** Script stripping only applies to `extractHead`, not `extractBodySnippet`. See RT-03.

---

### BD-10: Security Headers

**What it protects against:** Clickjacking, MIME sniffing, protocol downgrade, iframe embedding.
**Implementation quality:** GOOD
**Files:** `netlify.toml`, lines 10-18

- `X-Frame-Options: DENY` -- prevents clickjacking
- `X-Content-Type-Options: nosniff` -- prevents MIME sniffing
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` -- HSTS with 2-year max-age and preload
- `Referrer-Policy: strict-origin-when-cross-origin` -- limits referrer leakage
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` -- disables sensitive APIs
- `frame-ancestors 'none'` in CSP -- redundant with X-Frame-Options but good defense-in-depth

---

## 4. Attack Surface Analysis

### Entry Points

| Endpoint | Method | Input | Authentication | Rate Limited |
|----------|--------|-------|----------------|--------------|
| `/api/fetch` | POST | `{ url: string }` (body) | Optional Bearer token | Yes (Netlify edge) |
| `/api/analyze` | GET | `?url=<string>` (query) | Optional Bearer token | Yes (Netlify edge) |
| `/api/ai-check` | GET | `?url=<string>` (query) | Optional Bearer token | Yes (Netlify edge) |

### Trust Boundaries

```
[Browser Client] --HTTPS--> [Netlify Edge/CDN]
                               |
                               | Rate limiting, security headers
                               v
                         [Nitro Server Functions]
                               |
                               | URL validation, SSRF protection
                               v
                         [External Internet]
                               |
                               | DNS resolution, HTTP fetch
                               v
                         [Target Web Server]
```

**Key trust boundary:** The Nitro server fetches content from arbitrary external servers. All content from target servers is untrusted. The security perimeter is the URL validation + SSRF protection layer.

### Data Flows

1. **Inbound:** User submits URL via POST body or GET query parameter.
2. **Validation:** URL is parsed, protocol checked, hostname checked against blocklist, DNS resolved, IPs checked against private ranges.
3. **Fetch:** HTTP GET to target URL using pinned DNS. Manual redirect handling with re-validation.
4. **Processing:** HTML head extracted via regex, body snippet extracted, scripts stripped (head only), meta tags parsed via cheerio.
5. **Outbound:** Sanitized head HTML, raw body snippet, parsed meta tag data, redirect chain, timing info returned to client.

---

## 5. Dependency Risk Assessment

### Direct Security-Relevant Dependencies

| Package | Role | Risk Level | Notes |
|---------|------|-----------|-------|
| `undici` | HTTP client, DNS pinning | Low | Node.js core dependency, well-maintained |
| `ofetch` | Fetch wrapper | Low | Built on undici, maintained by UnJS |
| `cheerio` | HTML parsing | Low | Mature, well-audited |
| `h3` | HTTP framework | Low | Nuxt core, actively maintained |

### Supply Chain Risks

1. **Nuxt module ecosystem:** `@nuxt/ui`, `@vueuse/nuxt`, `@nuxtjs/seo`, `@nuxt/eslint` -- these are official/semi-official Nuxt modules with large install bases. Risk is low but surface area is significant.

2. **Transitive dependencies:** Run `npm audit` or `yarn audit` regularly. The `undici` package has had past CVEs related to HTTP request smuggling and CRLF injection -- ensure the version in use is patched.

### Recommended Actions

```bash
# Check for known CVEs
yarn audit --level moderate

# Check for outdated dependencies with known vulnerabilities
npx npm-check-updates --doctor

# Verify undici version specifically (past CVEs in <5.28.4, <6.11.1)
yarn why undici
```

---

## 6. Compliance Mapping -- OWASP Top 10 (2021)

| # | Category | Status | Notes |
|---|----------|--------|-------|
| A01 | Broken Access Control | PARTIAL | Auth is dormant by default. CORS is browser-only. No server-side origin enforcement. |
| A02 | Cryptographic Failures | PASS | Timing-safe comparison, HTTPS-only in production. No secrets stored or transmitted. |
| A03 | Injection | PASS | Input validated, HTML parsed safely via cheerio, no SQL/command injection vectors. |
| A04 | Insecure Design | PASS | Defense-in-depth with multiple validation layers. DNS pinning prevents TOCTOU. |
| A05 | Security Misconfiguration | PARTIAL | CSP `unsafe-inline`, `img-src *`, CORS first-origin-only. See RT-02, RT-04, RT-08. |
| A06 | Vulnerable Components | UNKNOWN | Requires running `yarn audit`. No known issues at time of review. |
| A07 | Auth Failures | N/A | Auth is optional. When enabled, it uses timing-safe comparison. |
| A08 | Data Integrity Failures | PASS | No deserialization of untrusted data (JSON-LD parsing is safe with try/catch). |
| A09 | Logging Failures | PASS | Structured logging with sanitization, request correlation IDs, IP tracking. |
| A10 | SSRF | PASS (with notes) | Comprehensive SSRF protection. Minor gaps in error oracle (RT-07) and Content-Type (RT-05). |

---

## 7. Recommendations -- Prioritized Action Items

### Priority 1: Quick Wins (Low Effort, High/Medium Impact)

| # | Action | Finding | Effort | Impact |
|---|--------|---------|--------|--------|
| 1 | Strip HTML tags from body snippet or remove script tags | RT-03 | 30 min | High |
| 2 | Add Content-Type validation on fetched responses | RT-05 | 15 min | Medium |
| 3 | Replace `Math.random()` with `crypto.randomUUID()` | RT-06 | 5 min | Medium |
| 4 | Remove redundant `Cookie: ""` header | RT-09 | 5 min | Low |
| 5 | Make sensitive param redaction case-insensitive | BD-08 gap | 10 min | Low |

### Priority 2: Medium-Term Hardening (Medium Effort)

| # | Action | Finding | Effort | Impact |
|---|--------|---------|--------|--------|
| 6 | Implement streaming response size validation | RT-01 | 2-4 hrs | High |
| 7 | Implement dynamic CORS origin checking in middleware | RT-04 | 1 hr | Medium |
| 8 | Add application-level rate limiting as fallback | RT-10 | 2 hrs | Low |
| 9 | Consolidate error messages to reduce information leakage | RT-07 | 30 min | Medium |

### Priority 3: Long-Term Improvements (High Effort)

| # | Action | Finding | Effort | Impact |
|---|--------|---------|--------|--------|
| 10 | Implement nonce-based CSP, remove `unsafe-inline` from `script-src` | RT-02 | 4-8 hrs | High |
| 11 | Proxy OG image previews through server to prevent IP disclosure | RT-08 | 4-8 hrs | Medium |
| 12 | Activate `METAPEEK_API_KEY` for production deployment | RT-12 | 15 min (config) | Medium |

---

## Appendix A: Files Reviewed

| File | Lines | Purpose |
|------|-------|---------|
| `server/utils/proxy.ts` | 423 | SSRF protection, URL validation, IP blocking, HTML extraction |
| `server/utils/fetcher.ts` | 313 | DNS pinning, redirect tracking, fetch with security controls |
| `server/utils/auth.ts` | 18 | Timing-safe string comparison |
| `server/utils/logger.ts` | 248 | Structured logging with URL sanitization |
| `server/api/fetch.post.ts` | 203 | Main fetch proxy endpoint |
| `server/api/analyze.get.ts` | 163 | Full analysis endpoint |
| `server/api/ai-check.get.ts` | 123 | AI readiness check endpoint |
| `metapeek.config.ts` | 66 | Centralized configuration |
| `netlify.toml` | 26 | Security headers and deployment config |
| `nuxt.config.ts` | 69 | Nuxt/CORS configuration |
| `shared/parser.ts` | 383 | HTML parsing with cheerio |

## Appendix B: Testing Methodology

This audit was performed via static code analysis of the complete server-side codebase. No dynamic testing, penetration testing, or fuzzing was performed. Findings are based on code review against known attack patterns for SSRF proxy applications.

### Not In Scope

- Client-side Vue components (XSS in template rendering)
- Third-party dependency source code (assessed by version/CVE only)
- Infrastructure configuration beyond `netlify.toml`
- Production environment variables and secrets management
- Network-level security (TLS configuration, Netlify CDN settings)
