# MetaPeek Logging & Monitoring Guide

**Purpose:** Track proxy usage, debug issues, detect abuse, and monitor performance.

---

## TL;DR: Do You Need External Logging?

**For solo use / small teams:** ❌ **No external database needed**
- Netlify's built-in logs are sufficient
- Free, zero setup, works out of the box
- Retention: 7-30 days (enough for debugging and monitoring)

**For public/high-traffic use:** ✅ **Consider external logging**
- Better retention (90+ days)
- Advanced querying and analytics
- Real-time dashboards
- Cost: $0-20/month for reasonable usage

---

## Option 1: Netlify Built-In Logs (Recommended for Launch)

### What You Get

Netlify automatically captures:
- **Function invocations** - Count, duration, memory usage
- **Console output** - All `console.log`, `console.error`, `console.warn`
- **Structured JSON** - Our logger outputs JSON in production
- **Errors** - Uncaught exceptions with stack traces
- **Retention** - 7 days (Free), 30 days (Pro)

### How to Access

#### 1. Netlify Dashboard (Web UI)
```
Netlify Dashboard → Your Site → Functions → /api/fetch → Logs
```

Shows:
- Real-time log stream
- Recent invocations (last 7-30 days)
- Error rate graphs
- Basic search

#### 2. Netlify CLI (Real-Time Tail)
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Authenticate
netlify login

# Tail logs in real-time
netlify functions:log --name fetch

# Filter by level
netlify functions:log --name fetch | grep ERROR
netlify functions:log --name fetch | grep security
```

#### 3. Query Logs Programmatically
```bash
# Get recent logs (requires jq)
netlify api listSiteFunctions --data '{"site_id":"YOUR_SITE_ID"}' | \
  jq -r '.[] | select(.name=="fetch") | .logs'
```

### Log Formats

**Development (human-readable):**
```
✅ [INFO] fetch_success
  URL: https://example.com
  Timing: 342ms

🛡️ [SECURITY] request_blocked
  URL: http://169.254.169.254/
  Reason: URL resolves to a private IP address

❌ [ERROR] fetch_error
  URL: https://slow-site.com
  Error: Request timed out after 10 seconds
```

**Production (JSON for parsing):**
```json
{
  "timestamp": "2026-02-04T12:34:56.789Z",
  "level": "info",
  "requestId": "1738675696789-x7k3m9p",
  "event": "fetch_success",
  "url": "https://example.com",
  "statusCode": 200,
  "timing": 342,
  "redirectCount": 0,
  "responseSize": 15234,
  "ip": "203.0.113.45",
  "userAgent": "Mozilla/5.0..."
}
```

### What's Logged

**✅ Logged (Safe & Useful):**
- Timestamp
- Request ID (for correlation)
- Event type (success, error, blocked)
- Target URL (sanitized - sensitive query params redacted)
- Final URL (if different due to redirects)
- Status code
- Timing (ms)
- Response size (bytes)
- Client IP
- User agent (truncated to 100 chars)
- Redirect count
- Error message (sanitized)
- Block reason

**❌ NOT Logged (Privacy & Performance):**
- Full HTML responses (too large)
- Sensitive query parameters (tokens, keys, passwords)
- Auth headers
- Cookies
- Full stack traces (only in dev)
- Personal data beyond IP address

### Analyzing Netlify Logs

#### Finding Blocked Requests (SSRF Attempts)
```bash
netlify functions:log --name fetch | grep "request_blocked"
```

**Look for patterns:**
- Same IP trying many internal addresses?
- Automated scanning?
- Legitimate user hitting blocked domain?

#### Finding Errors
```bash
netlify functions:log --name fetch | grep "fetch_error"
```

**Common errors to investigate:**
- `timeout` - Target site too slow (expected for some sites)
- `ENOTFOUND` - Typo in URL or domain doesn't exist
- `ECONNREFUSED` - Site is down or blocking our User-Agent

#### Measuring Performance
```bash
# Extract timing from logs (requires jq)
netlify functions:log --name fetch --json | \
  jq -r 'select(.event=="fetch_success") | .timing' | \
  awk '{s+=$1; c++} END {print "Avg:", s/c, "ms"}'
```

#### Daily Usage Stats
```bash
# Count requests per day
netlify functions:log --name fetch --json | \
  jq -r '.timestamp[:10]' | \
  sort | uniq -c
```

### Limitations

❌ **Short retention** - 7-30 days max
❌ **No advanced queries** - Basic text search only
❌ **No aggregations** - Can't easily sum, average, or group
❌ **No dashboards** - Manual log inspection only
❌ **No alerts** - Can't trigger notifications on events

**When these become pain points → consider external logging.**

---

## Option 2: External Logging (Optional - For High Traffic)

### When to Consider External Logging

✅ You want to:
- Retain logs > 30 days
- Build dashboards (usage graphs, error rates)
- Set up alerts (email/Slack when errors spike)
- Query logs with SQL or advanced filters
- Track trends over months
- Correlate with other metrics

### Recommended Services

#### 🥇 Axiom (Best Overall)
**What:** Structured log storage with fast querying
**Pricing:**
- Free: 500 MB/month, 30-day retention
- $25/month: 100 GB/month, 90-day retention
**Why:**
- Generous free tier
- Fast queries (< 1 second)
- APL query language (similar to SQL)
- Netlify integration available

**Setup:**
```bash
# 1. Sign up at axiom.co
# 2. Create dataset: metapeek-logs
# 3. Add to nuxt.config.ts:
export default defineNuxtConfig({
  runtimeConfig: {
    axiomToken: process.env.AXIOM_TOKEN,
    axiomDataset: 'metapeek-logs'
  }
})

# 4. Update logger.ts to send to Axiom
```

#### 🥈 Betterstack (Best Alerts)
**What:** Logs + uptime monitoring + incident management
**Pricing:**
- Free: 1 GB/month, 3-day retention
- $10/month: 5 GB/month, 30-day retention
**Why:**
- Great alerting (email, Slack, PagerDuty)
- Live tail
- Uptime monitoring included

#### 🥉 Upstash (Simplest)
**What:** Serverless Redis (not a full log service)
**Pricing:**
- Free: 10,000 commands/day
- $0.20 per 100,000 commands
**Why:**
- Super simple to add
- Pay-per-use
- Good for counters and recent logs only

**NOT recommended for:**
- Long-term log storage
- Complex queries
- Log retention > 7 days

**Best use case:** Tracking counters (requests per URL, error counts) but not full log storage.

### Implementation: Axiom Example

Update `server/utils/logger.ts`:

```typescript
// Add Axiom client
import { Axiom } from '@axiomhq/js'

const axiom = process.env.AXIOM_TOKEN
  ? new Axiom({ token: process.env.AXIOM_TOKEN })
  : null

export function log(entry: ProxyLogEntry): void {
  // Always log to console (Netlify captures this)
  const isDev = process.env.NODE_ENV === 'development'

  if (isDev) {
    // Human-readable for dev
    console.log(/* ... */)
  } else {
    // JSON for production
    console.log(JSON.stringify(entry))

    // ALSO send to Axiom if configured
    if (axiom) {
      axiom.ingest(process.env.AXIOM_DATASET || 'metapeek-logs', [entry])
    }
  }
}
```

**Environment variables:**
```bash
# Add to Netlify dashboard
AXIOM_TOKEN=xaat-your-token-here
AXIOM_DATASET=metapeek-logs
```

**Cost estimate:**
- 1,000 requests/day = ~2 MB/day = 60 MB/month → **Free tier**
- 10,000 requests/day = ~600 MB/month → **Free tier**
- 100,000 requests/day = ~6 GB/month → **$25/month**

### Do You Need It?

**Ask yourself:**

1. **How many requests per day?**
   - < 1,000/day → Netlify logs fine
   - 1,000-10,000/day → Maybe (still free tier)
   - > 10,000/day → Yes (paid tier worth it)

2. **How often do you check logs?**
   - Once a month → Netlify fine
   - Weekly → Netlify fine
   - Daily → Consider external
   - Real-time dashboards needed → Definitely external

3. **What's your retention need?**
   - 7 days → Netlify fine (free)
   - 30 days → Netlify fine (Pro)
   - 90+ days → Need external

4. **Do you need alerts?**
   - No → Netlify fine
   - Yes (email when errors spike) → Need external

**Recommendation for MetaPeek:**
- **Launch:** Use Netlify logs only (free, zero setup)
- **After 1 month:** Review usage patterns
- **If abuse/issues:** Add Axiom free tier
- **If high traffic:** Upgrade to paid tier

---

## What to Monitor

### Daily (First Week After Launch)

**Function Invocations:**
```bash
# Netlify Dashboard → Site → Functions → fetch
# Look at invocation graph
```
**Expected:** < 100/day for solo use
**Alert if:** > 10,000/day (potential abuse)

**Error Rate:**
```bash
netlify functions:log --name fetch | grep "fetch_error" | wc -l
```
**Expected:** < 5% of requests
**Alert if:** > 20% (upstream issues or bug)

**Blocked Requests:**
```bash
netlify functions:log --name fetch | grep "request_blocked" | wc -l
```
**Expected:** 0 for normal use
**Alert if:** > 10 (someone testing SSRF)

### Weekly (Ongoing)

**Top Fetched Domains:**
```bash
netlify functions:log --name fetch --json | \
  jq -r 'select(.event=="fetch_success") | .url' | \
  awk -F/ '{print $3}' | sort | uniq -c | sort -rn | head -10
```
**Look for:** Unexpected patterns, single domain dominating

**Average Response Time:**
```bash
netlify functions:log --name fetch --json | \
  jq -r 'select(.event=="fetch_success") | .timing' | \
  awk '{s+=$1; c++} END {print "Avg:", s/c, "ms"}'
```
**Expected:** 1000-3000ms (includes target site latency)
**Alert if:** > 5000ms average (upstream slowness)

**Rate Limit Hits:**
Check Netlify Analytics for 429 responses
**Expected:** 0 for solo use
**Alert if:** > 0 consistently (someone hitting limit)

### Monthly

**Cost Check:**
- Netlify function invocations
- Bandwidth usage
- Any overage charges?

**Security Review:**
- Any successful SSRF attempts? (should be 0)
- Any unusual access patterns?
- Any IPs to block?

---

## Log Retention Strategy

### Netlify (Built-In)
- **Free tier:** 7 days
- **Pro tier:** 30 days
- **After retention:** Logs deleted automatically

### Export for Long-Term Storage

If you need logs beyond retention period:

```bash
# Export logs to file (run weekly)
netlify functions:log --name fetch --json > logs/metapeek-$(date +%Y-%m-%d).json

# Compress
gzip logs/metapeek-*.json

# Store in S3/Google Cloud Storage (optional)
aws s3 cp logs/ s3://metapeek-logs/ --recursive
```

**When to do this:**
- Legal/compliance requirements (6+ months retention)
- Long-term trend analysis
- Security audits

**Cost:**
- S3 Standard: ~$0.023/GB/month
- 1 year of logs (~20 GB): ~$0.50/month
- 5 years: ~$2.50/month

---

## Privacy & Legal Considerations

### What We Log: Privacy Analysis

**IP Addresses:**
- **Purpose:** Rate limiting, abuse detection
- **Retention:** 7-30 days (Netlify default)
- **Privacy impact:** Medium
- **Note:** IPs can identify users, but we don't log other PII

**URLs Fetched:**
- **Purpose:** Debugging, abuse detection
- **Retention:** 7-30 days
- **Privacy impact:** Low-Medium
- **Note:** Sanitized (sensitive params redacted)

**User Agents:**
- **Purpose:** Debugging, bot detection
- **Retention:** 7-30 days
- **Privacy impact:** Low

### GDPR Compliance

**Good news:** MetaPeek's logging is GDPR-friendly:
- ✅ No user accounts (no email, name, profile data)
- ✅ IP addresses auto-deleted after 7-30 days
- ✅ No tracking cookies
- ✅ No third-party analytics
- ✅ Logs used only for debugging and security

**If you add external logging:**
- Consider EU-region storage (Axiom supports EU)
- Document retention policy
- Provide way to delete logs on request (manual process OK)

### What NOT to Log

❌ **Never log:**
- Full HTML responses (could contain PII from fetched sites)
- Auth tokens from target sites
- Cookies from target sites
- Email addresses or names from fetched pages
- Credit card numbers or SSNs (shouldn't be in meta tags anyway)

---

## Monitoring Dashboards (Optional)

### Simple Bash Dashboard

Create `scripts/dashboard.sh`:

```bash
#!/bin/bash
# MetaPeek Live Dashboard

echo "=== MetaPeek Proxy Stats ==="
echo ""

# Requests today
echo "Requests today:"
netlify functions:log --name fetch --json | \
  jq -r 'select(.timestamp | startswith("'$(date +%Y-%m-%d)'")) | .event' | \
  wc -l

# Success rate
echo "Success rate:"
netlify functions:log --name fetch --json | \
  jq -r '.event' | \
  awk '/success/{s++}/error/{e++} END {printf "%.1f%% (%d/%d)\n", s/(s+e)*100, s, s+e}'

# Average timing
echo "Average response time:"
netlify functions:log --name fetch --json | \
  jq -r 'select(.event=="fetch_success") | .timing' | \
  awk '{s+=$1; c++} END {printf "%.0f ms\n", s/c}'

# Blocked requests
echo "Blocked requests (security):"
netlify functions:log --name fetch | grep "request_blocked" | wc -l

echo ""
echo "Last 5 requests:"
netlify functions:log --name fetch --json | \
  jq -r 'select(.event=="fetch_success" or .event=="fetch_error") |
    "\(.timestamp | sub("T.*"; "")) \(.event) \(.url[:50])"' | \
  tail -5
```

Run with: `bash scripts/dashboard.sh`

### Axiom Dashboard (If Using External Logs)

Query examples:

```apl
// Request volume over time
['metapeek-logs']
| where event == 'fetch_success'
| summarize count() by bin(timestamp, 1h)

// Error rate
['metapeek-logs']
| summarize
    total = count(),
    errors = countif(level == 'error')
| extend error_rate = errors * 100.0 / total

// Top domains
['metapeek-logs']
| where event == 'fetch_success'
| extend domain = extract(@"https?://([^/]+)", 1, url)
| summarize count() by domain
| top 10 by count_

// Blocked requests
['metapeek-logs']
| where blocked == true
| summarize count() by reason
```

---

## Summary: Logging Decision Tree

```
Do you need logs? → YES (always)
├─ Solo use / small team?
│  └─ Use Netlify built-in logs (free, zero setup)
│
└─ High traffic / public tool?
   ├─ Need real-time dashboards? → Axiom or Betterstack
   ├─ Need 90+ day retention? → Axiom or Betterstack
   ├─ Need advanced alerts? → Betterstack
   ├─ Just want simple counters? → Upstash Redis
   └─ None of the above? → Stick with Netlify

Cost comparison (10,000 requests/day):
- Netlify built-in: $0 (included in Pro plan)
- Axiom free tier: $0 (under 500 MB/month)
- Betterstack: $10/month
- Upstash: ~$6/month
```

**Recommendation for launch:**
1. Start with Netlify built-in logs (already implemented)
2. Monitor for 1 month
3. Add external logging only if you hit limitations

---

## Quick Reference Commands

```bash
# Real-time tail
netlify functions:log --name fetch

# Find errors today
netlify functions:log --name fetch | grep ERROR

# Find blocked requests
netlify functions:log --name fetch | grep request_blocked

# Count total requests
netlify functions:log --name fetch --json | jq -r '.event' | grep -c success

# Check error rate
netlify functions:log --name fetch --json | \
  jq -r '.level' | sort | uniq -c

# Export logs
netlify functions:log --name fetch --json > logs/export-$(date +%Y%m%d).json
```

---

**Next Steps:**
1. ✅ Structured logging implemented (`server/utils/logger.ts`)
2. ✅ Logging added to API endpoint
3. ✅ Sanitization of sensitive data
4. 📋 Deploy and test logging output
5. 📊 Set up weekly log review (manual or automated)
6. 🔔 Add external logging if/when needed
