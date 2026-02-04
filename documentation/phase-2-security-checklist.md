# Phase 2 Security Checklist

**Quick reference for ensuring the proxy endpoint is secure.**

---

## Pre-Deployment Security Checklist

### 1. SSRF Protection ✅

- [x] DNS resolution implemented in `validateUrl()`
- [x] Private IP ranges blocked (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, 0.x)
- [x] Cloud metadata endpoints blocked (169.254.169.254, metadata.google.internal)
- [x] Loopback addresses blocked (localhost, 127.0.0.1, ::1)
- [x] Protocol whitelist enforced (HTTPS only in production, HTTP allowed in dev)
- [x] Redirect targets validated (no redirect to private IPs)
- [x] DNS lookups happen BEFORE fetch

### 2. Denial of Service (DoS) Protection ✅

- [x] Response size limit: 1MB (`maxResponseBytes: 1_048_576`)
- [x] Fetch timeout: 10 seconds (`fetchTimeoutMs: 10_000`)
- [x] Max redirects: 5 (`maxRedirects: 5`)
- [x] URL length limit: 2048 characters (`maxUrlLength: 2048`)
- [x] Rate limiting: 30 requests/minute per IP (Netlify edge-level)

### 3. Input Validation ✅

- [x] Request body must be valid JSON
- [x] `url` field required and must be string
- [x] No extra/unexpected fields allowed (prevents parameter pollution)
- [x] URL format validated before fetch
- [x] Content-Type must be application/json

### 4. Output Sanitization ✅

- [x] All `<script>` tags stripped from response (except `application/ld+json`)
- [x] Only `<head>` and first 1KB of `<body>` returned
- [x] Error messages sanitized (no stack traces, file paths, or internal IPs)
- [x] Response always JSON, never HTML (prevents XSS)

### 5. Rate Limiting ✅

- [x] Netlify edge-level rate limiting configured
- [x] `export const config` in `fetch.post.ts`
- [x] 30 requests per IP per 60-second window
- [x] Aggregated by IP and domain
- [x] Rate-limited requests don't count as function invocations

### 6. Authentication (Optional - Dormant) ✅

- [x] Bearer token check implemented but inactive
- [x] Activated by setting `METAPEEK_API_KEY` in Netlify env vars
- [x] No code change needed to enable/disable
- [x] Checked before SSRF validation (fail fast)

### 7. Network Security ✅

- [x] No cookies forwarded to target sites (`Cookie: ''`)
- [x] No credentials sent (`credentials: 'omit'`)
- [x] Custom User-Agent identifies MetaPeek
- [x] No auth headers forwarded
- [x] Manual redirect handling (prevents auto-follow to private IPs)

### 8. Error Handling ✅

- [x] Generic error messages for users
- [x] Detailed errors logged server-side only
- [x] No stack traces in responses
- [x] Timeout errors identified
- [x] DNS errors identified
- [x] Connection errors sanitized

### 9. CORS Configuration ✅

- [x] Allowed origins configured in `metapeek.config.ts`
- [x] Only POST method allowed
- [x] Content-Type and Authorization headers allowed
- [x] Configured in `nuxt.config.ts` routeRules

### 10. Production Settings ✅

- [x] HTTP protocol blocked when `NODE_ENV=production`
- [x] HTTPS required for all production fetches
- [x] Rate limits active
- [x] Netlify function timeout set to 26 seconds (must request from support)

---

## Security Testing Required

Before deploying, verify:

- [ ] **SSRF Tests** - Run tests 1.1-1.5 from security-testing-guide.md
- [ ] **DoS Tests** - Run tests 2.1-2.4
- [ ] **Input Validation** - Run tests 3.1-3.5
- [ ] **Rate Limiting** - Run tests 4.1-4.2
- [ ] **Content Security** - Run tests 7.1-7.2
- [ ] **Error Messages** - Run test 8.1 (no info leakage)
- [ ] **CORS** - Run tests 9.1-9.2
- [ ] **Production Mode** - Run test 10.1 (HTTP blocked)

Run comprehensive tests:
```bash
# Unit tests
yarn test tests/security/

# Manual tests
bash tests/security/ssrf-manual.sh
```

---

## Post-Deployment Monitoring

### Week 1: Daily Checks
- [ ] Check Netlify function invocations (should be < 10,000/day for solo use)
- [ ] Review error logs for unexpected patterns
- [ ] Verify rate limiting is working (check for 429 responses)
- [ ] Confirm no SSRF attempts in logs

### Ongoing: Monthly Checks
- [ ] Review invocation trends
- [ ] Check for abuse patterns (same IP, unusual URLs)
- [ ] Verify rate limit effectiveness
- [ ] Update security tests if needed

---

## Security Incident Response

If you detect abuse:

### Level 1: Rate Limit Approaching
**Symptom:** Invocation count unusually high but below overage threshold

**Action:**
1. Check Netlify logs for patterns
2. Verify rate limiting is active
3. Consider lowering `windowLimit` from 30 to 15 in `metapeek.config.ts`

### Level 2: Suspected SSRF Attempt
**Symptom:** 400 errors with "private IP" or "internal address" messages

**Action:**
1. Check logs for attempted URLs
2. Verify `validateUrl()` caught them (should see 400 responses)
3. No action needed if blocked - protection working as designed
4. If bypass detected, patch `isPrivateIp()` and redeploy

### Level 3: Overage Charges
**Symptom:** Netlify billing shows function overage packages

**Action:**
1. **Immediate:** Activate bearer token
   - Set `METAPEEK_API_KEY` in Netlify env vars
   - Redeploy (automatic)
   - Update client to send token (if not already configured)
2. **Next:** Switch to DigitalOcean proxy
   - Set `proxy.externalUrl` in `metapeek.config.ts`
   - Deploy DO proxy (code in design doc section 9)
3. **Nuclear:** Disable `/api/fetch` temporarily
   - Return 503 from endpoint
   - Paste mode continues to work

---

## Known Limitations

### ✅ Protected Against:
- SSRF to internal networks
- SSRF to cloud metadata
- Slow loris / timeout attacks
- Response size attacks
- Redirect to internal IPs
- Script injection via fetched HTML
- Parameter pollution
- DNS rebinding

### ⚠️ NOT Protected Against (by design):
- **Public URL scraping** - Any public URL can be fetched (this is the feature)
- **robots.txt violations** - Deliberately not checked (see design doc section 11, line 1295)
- **Target site rate limits** - If you fetch the same URL 30x/min, the target might block the MetaPeek User-Agent
- **Target site DDoS** - Rate limit is per-IP, not per-target-URL

### 🚫 Out of Scope:
- Authentication of users (tool is public, no accounts)
- URL allowlists (defeats the purpose of a general diagnostic tool)
- CAPTCHA / human verification (would harm UX for legitimate use)
- IP reputation checking (false positives, complexity)
- robots.txt compliance checking (see design doc section 11)

---

## Security Best Practices

### Do:
✅ Run security tests before every deploy
✅ Monitor invocation counts weekly
✅ Keep dependencies updated
✅ Review Netlify security advisories
✅ Test rate limiting after config changes
✅ Use HTTPS in production

### Don't:
❌ Disable SSRF checks "temporarily"
❌ Increase timeout beyond 26 seconds
❌ Remove rate limiting
❌ Allow HTTP in production
❌ Return full response bodies
❌ Log full HTML responses (too large)
❌ Add URL allowlists (defeats purpose)

---

## Quick Reference: Attack Surface

| Attack Vector | Protection | Location |
|--------------|------------|----------|
| SSRF | DNS + IP validation | `server/utils/proxy.ts:validateUrl()` |
| DoS (size) | 1MB response limit | `server/api/fetch.post.ts:155` |
| DoS (time) | 10s timeout | `metapeek.config.ts:fetchTimeoutMs` |
| DoS (rate) | 30 req/min | Netlify edge + config export |
| XSS | Script stripping | `server/utils/proxy.ts:extractHead()` |
| Info leak | Error sanitization | `server/utils/proxy.ts:sanitizeErrorMessage()` |
| Injection | Input validation | `server/api/fetch.post.ts:24-56` |
| Redirect loop | Max 5 redirects | `server/api/fetch.post.ts:120-153` |

---

## Contact for Security Issues

If you discover a security vulnerability:

1. **Do NOT** open a public GitHub issue
2. Email: [security contact email]
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Impact assessment
   - Suggested fix (if any)

---

## References

- **Full Design Doc:** `documentation/metapeek-design-doc-final.md` (section 9: Security)
- **Security Tests:** `documentation/security-testing-guide.md`
- **OWASP SSRF:** https://owasp.org/www-community/attacks/Server_Side_Request_Forgery
- **Netlify Rate Limiting:** https://docs.netlify.com/platform/rate-limiting/

---

**Last Updated:** February 2026
**Security Review:** Required before Phase 2 production deployment
**Next Review:** After Phase 2 launch + 1 month
