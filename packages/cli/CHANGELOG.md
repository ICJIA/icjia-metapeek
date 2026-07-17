# metapeek-cli changelog

The CLI is versioned independently from the web app. Web-app changes
are tracked in the root [CHANGELOG.md](../../CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the CLI follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.4.0] - 2026-07-17

### Changed

- **Grade gate (parity with the web app/API):** a missing or unreachable
  `og:image` now caps the overall score at 55 (grade F). The JSON output
  gains `score.gated` (boolean) and `score.gateReason` (string | null).
  Previously an imageless page could still score 70/C.

---

## [2.3.0] - 2026-05-26

### Added

- **AI readiness assessment** — the CLI now runs the same 9-check AI
  readiness assessment as the web app: JSON-LD structured data,
  authorship, content freshness, canonical URL, language declaration,
  description quality, AI crawl directives (noai / noimageai),
  robots.txt AI-bot access (GPTBot, ClaudeBot, Google-Extended, etc.),
  and llms.txt. Emits a `ready` / `partial` / `not-ready` verdict.

  Runs as a **parallel verdict** — does NOT affect the existing A-F
  weighted score or the exit code, so CI quality gates built on
  metapeek 2.2.x keep working unchanged. The 7-category SEO score and
  the AI verdict are reported side-by-side.

  In `--html-file` mode the robots.txt and llms.txt checks fall back
  to `n/a` (no live origin to fetch from).

- `--no-ai-check` — skips the entire AI readiness assessment. Useful
  when the two extra HTTP fetches (`/robots.txt` and `/llms.txt`)
  matter for total runtime or when running fully offline.

- Terminal output now includes an "AI Readiness" section with a
  color-coded verdict and per-check status icons.
- Markdown output includes a "## AI Readiness" table with emoji
  status indicators.
- JSON output includes a top-level `aiReadiness` field with
  `{verdict, checks: [...]}`. Each check has `id`, `label`, `status`
  (pass/warn/fail/na), `message`, and optionally `suggestion` and
  `detail`.

### Changed

- Parser now extracts the `<html lang="...">` attribute (exposed as
  `meta.htmlLang` in JSON) and `article:published_time` /
  `article:modified_time` / `og:updated_time` (exposed under
  `meta.article` and `meta.og.updated_time`). These are used by the
  AI freshness and language checks but are also useful for any
  consumer of the JSON output.

### Tests

- 12 new test cases covering AI readiness arg parsing, JSON shape,
  per-check ids and statuses, `n/a` fallback in html-file mode,
  `--no-ai-check` short-circuit, and terminal-output sections. All
  offline-safe. Suite: **104 pass / 0 fail / 0 skip** in `--offline`
  mode.

---

## [2.2.0] - 2026-05-26

### Added

- `--sitemap <url>` — analyze every URL in a sitemap.xml in one pass.
  Aggregates per-URL results into a compact terminal table, a markdown
  table, or a single JSON object (`{ok, sitemap, count, summary,
  results: [...]}`). Sitemap-index documents are rejected with a clear
  message asking for one of the child sitemaps. Same SSRF guards as
  the single-URL path. Exit code 0 only if every URL grades A or B
  with no fetch errors.
- `--html-file <path>` — read the HTML to analyze from a local file
  instead of fetching `<url>` over HTTP. The positional URL becomes a
  label only. Mutually exclusive with `--sitemap`. Useful for
  pre-deploy checks of static-site output and for deterministic tests.

### Fixed

- og:image scoring no longer awards 100 when the image URL is present
  and absolute but the fetcher can't reach it. The category now
  differentiates:
  - `fetch failed`        → score 0, status fail (CSP/hotlink/4xx/DNS)
  - `unrecognized format` → score 60, status warning (got bytes,
    not a recognized image)
  - dimensions known      → existing 1200×630 logic
  - dimensions truly unavailable → existing 100 fallback

  Previously a broken social card looked identical to a healthy one
  in the report.

### Changed

- The CLI is now distributed inside the
  [icjia-metapeek](https://github.com/ICJIA/icjia-metapeek) monorepo
  at `packages/cli/`. The previous standalone
  [icjia-metapeek-cli](https://github.com/ICJIA/icjia-metapeek-cli)
  repository has been archived; old clones and curl downloads keep
  resolving read-only.
- `REPO_URL` and User-Agent strings repointed at the monorepo. The
  update-prompt now references the monorepo path.

### Tests

- Two HTML fixtures (`test/fixtures/no-ogimage.html`,
  `test/fixtures/broken-ogimage.html`) and 13 new test cases covering
  `--html-file` argument parsing, disk-read behavior, and the
  og:image-unreachable scoring path. All tests run offline (the
  broken-image fixture uses an RFC 6761 `.test` TLD so `getaddrinfo`
  fails locally without hitting external DNS).
- Full suite: 92 pass / 0 fail / 0 skip in `--offline` mode.

---

## [2.1.0] - earlier

Initial standalone release in `icjia-metapeek-cli`. Single-URL
analysis, terminal/markdown/JSON output, OG image dimension parsing
for PNG/JPEG/GIF/WebP, SSRF protection, and a self-running test
suite (`metapeek --tests`).
