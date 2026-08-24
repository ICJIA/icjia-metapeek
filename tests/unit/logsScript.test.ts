/**
 * @fileoverview Tests for ./logs.sh query building. The script talks to the
 * Supabase request_log table over PostgREST; LOGS_DRY_RUN=1 makes it print the
 * request URL instead of sending it, so the filters, ordering, and day
 * boundaries can be asserted without network access or credentials.
 */

import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);
const SCRIPT = resolve(__dirname, "../../logs.sh");

/** Runs logs.sh in dry-run mode with stub credentials. */
async function dryRun(args: string[]) {
  const { stdout, stderr } = await execFileAsync("bash", [SCRIPT, ...args], {
    env: {
      ...process.env,
      LOGS_DRY_RUN: "1",
      SUPABASE_URL: "https://stub.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_stub",
      TZ: "America/Chicago",
    },
  });
  return stdout + stderr;
}

/** Runs logs.sh expecting a non-zero exit; returns the combined output. */
async function dryRunFailure(args: string[]) {
  try {
    await dryRun(args);
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
  throw new Error(`expected logs.sh ${args.join(" ")} to fail`);
}

describe("logs.sh query building", () => {
  it("requests the newest rows first, honoring the row limit", async () => {
    const out = await dryRun(["recent", "50"]);
    expect(out).toContain("/rest/v1/request_log");
    expect(out).toContain("order=at.desc");
    expect(out).toContain("limit=50");
  });

  it("treats a bare number as a row count", async () => {
    const out = await dryRun(["25"]);
    expect(out).toContain("limit=25");
    expect(out).toContain("order=at.desc");
  });

  it("filters denied requests to the rate-limited rows", async () => {
    const out = await dryRun(["denied"]);
    expect(out).toContain("allowed=is.false");
  });

  it("bounds a day query by that calendar day in Chicago time", async () => {
    const out = await dryRun(["2026-08-24"]);
    // August is CDT (UTC-5): the day starts at 05:00Z and ends before the next.
    expect(out).toContain("at=gte.2026-08-24T00%3A00%3A00-0500");
    expect(out).toContain("at=lt.2026-08-25T00%3A00%3A00-0500");
  });

  it("searches the target URL and user agent for a grep pattern", async () => {
    const out = await dryRun(["grep", "curl"]);
    // %2A is the wildcard: PostgREST percent-decodes before parsing the filter.
    expect(out).toContain("or=(target_url.ilike.%2Acurl%2A,user_agent.ilike.%2Acurl%2A)");
  });

  it("percent-encodes a pattern that would otherwise break out of the or() filter", async () => {
    const out = await dryRun(["grep", "a,b)c"]);
    expect(out).toContain("target_url.ilike.%2Aa%2Cb%29c%2A");
    expect(out).toContain("user_agent.ilike.%2Aa%2Cb%29c%2A");
  });

  it("rejects a malformed date with a message naming the format", async () => {
    const { code, output } = await dryRunFailure(["2026-8-24"]);
    expect(code).not.toBe(0);
    expect(output).toContain("YYYY-MM-DD");
  });

  it("rejects an unknown command and lists the real ones", async () => {
    const { code, output } = await dryRunFailure(["frobnicate"]);
    expect(code).not.toBe(0);
    expect(output).toContain("unknown command");
    expect(output).toContain("recent");
  });

  it("prints usage for help without touching the network", async () => {
    const out = await dryRun(["help"]);
    expect(out).toContain("QUICK START");
    expect(out).toContain("./logs.sh");
    expect(out).not.toContain("/rest/v1/request_log?");
  });

  it("explains itself when credentials are missing", async () => {
    try {
      await execFileAsync("bash", [SCRIPT, "recent"], {
        env: {
          ...process.env,
          LOGS_DRY_RUN: "1",
          SUPABASE_URL: "",
          SUPABASE_SECRET_KEY: "",
          LOGS_SKIP_ENV_FILE: "1",
        },
      });
      throw new Error("expected missing-credential failure");
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      expect(e.code).not.toBe(0);
      expect(`${e.stdout ?? ""}${e.stderr ?? ""}`).toContain("SUPABASE_SECRET_KEY");
    }
  });
});
