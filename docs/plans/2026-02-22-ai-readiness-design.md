# AI Readiness Feature — Design

## Overview

Add a non-scoring "AI Readiness" assessment that evaluates how well a page is prepared for AI systems (LLMs, AI search engines, AI agents) to understand and cite its content. Displayed as a separate panel below the score card.

## Motivation

Developers optimize for Google and social sharing but have no visibility into whether their content is consumable by AI systems like ChatGPT, Perplexity, Bing Copilot, and Claude. MetaPeek already parses most relevant signals — this feature evaluates them through an AI lens.

## Checks (9 total)

### From HTML head (7 checks)

| # | Check | Green | Yellow | Red |
|---|-------|-------|--------|-----|
| 1 | **JSON-LD Structured Data** | Valid JSON-LD with `@type` | JSON-LD present but no `@type` | No JSON-LD |
| 2 | **Authorship** | Author in meta, article:author, or JSON-LD | — | No authorship info |
| 3 | **Content Freshness** | Published and modified dates found | Only one of published/modified | No date signals |
| 4 | **Canonical URL** | Present | — | Missing |
| 5 | **Language Declaration** | `lang` attr or meta language | — | Not declared |
| 6 | **Description Quality** | 80+ chars | 50-79 chars | Missing or <50 chars |
| 7 | **AI Crawl Directives** | No `noai`/`noimageai` in robots meta | — | `noai` or `noimageai` found |

### From additional fetches (2 checks)

| # | Check | Green | Yellow | Red |
|---|-------|-------|--------|-----|
| 8 | **robots.txt AI Bots** | No AI bot blocks | Some AI bots blocked | All major AI bots blocked |
| 9 | **llms.txt** | `/llms.txt` exists and non-empty | — | No `/llms.txt` found |

### AI bots checked in robots.txt

GPTBot, ChatGPT-User, Google-Extended, Anthropic-AI, ClaudeBot, CCBot, PerplexityBot, Bytespider.

## Overall Verdict

- **AI Ready** (green): 0 fails, <=1 warn
- **Partially Ready** (yellow): 1-2 fails or 2+ warns
- **Not AI Ready** (red): 3+ fails

Does not affect the numeric score or letter grade.

## Architecture

### New files

- `shared/ai-readiness.ts` — Isomorphic evaluation logic. Takes MetaTags + optional robots.txt/llms.txt strings, returns `AiReadinessResult`.
- `server/api/ai-check.get.ts` — Endpoint that takes `?url=`, derives origin, fetches `{origin}/robots.txt` and `{origin}/llms.txt` in parallel. Soft-fails on 404. Returns `{ robotsTxt?: string, llmsTxt?: string }`.
- `app/composables/useAiReadiness.ts` — Combines parsed meta tags with server data, exposes reactive AI readiness state.
- `app/components/AiReadinessPanel.vue` — UI panel with overall badge + check list.

### Modified files

- `shared/types.ts` — Add `AiReadinessCheck` and `AiReadinessResult` types.
- `app/pages/index.vue` — Mount `AiReadinessPanel` below the score display.

### Types

```typescript
interface AiReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'na';
  message: string;
  suggestion?: string;
}

interface AiReadinessResult {
  verdict: 'ready' | 'partial' | 'not-ready';
  checks: AiReadinessCheck[];
}
```

### Data flow

**URL fetch mode:**
1. Existing flow fetches URL and parses meta tags.
2. Client calls `GET /api/ai-check?url=...` (can run in parallel with main fetch).
3. Server fetches `/robots.txt` + `/llms.txt` from same origin (parallel, soft-fail).
4. `useAiReadiness` combines meta tags + server response into 9 checks.
5. `AiReadinessPanel` renders below score.

**Paste HTML mode:**
- Only the 7 HTML-head checks run.
- robots.txt and llms.txt checks show as "N/A — paste mode".

### Server endpoint

`GET /api/ai-check?url=https://example.com/page`

- Derives origin from URL.
- Applies same SSRF validation as `/api/fetch`.
- Fetches `{origin}/robots.txt` and `{origin}/llms.txt` in parallel with 5s timeout each.
- Returns `{ ok: true, robotsTxt: string | null, llmsTxt: string | null }`.
- 404 responses result in `null` for that field (not an error).

### UI

Card below score with:
- Header: "AI Readiness" + verdict badge (green/yellow/red)
- Subtitle: "Does not affect score"
- List of checks with status indicators and messages
- Expandable suggestions on warn/fail items
- In paste mode, a note explaining the 2 unavailable checks
