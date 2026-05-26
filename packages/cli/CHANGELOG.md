# metapeek-cli changelog

The CLI is versioned independently from the web app. Web-app changes
are tracked in the root [CHANGELOG.md](../../CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the CLI follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
