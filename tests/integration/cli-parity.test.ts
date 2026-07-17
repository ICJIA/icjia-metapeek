/**
 * Verdict parity between the shared scorer (web + API) and the CLI's
 * embedded Python analyzer, using the CLI's own fixtures. These two
 * implementations drifted once already (the CLI failed unreachable images
 * while the web app showed green) — this suite keeps them honest.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseMetaTags } from "#shared/parser";
import { generateDiagnostics } from "#shared/diagnostics";
import { computeScore } from "#shared/score";

const FIXTURES = resolve(__dirname, "../../packages/cli/test/fixtures");
const CLI = resolve(__dirname, "../../packages/cli/metapeek");

const fixture = (name: string) =>
  readFileSync(resolve(FIXTURES, name), "utf-8");

const hasCliDeps = (() => {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    execFileSync("jq", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Runs the CLI offline against a fixture and returns its parsed JSON.
 * The CLI exits non-zero for failing grades (lint-style), so stdout must be
 * recovered from the thrown error for exactly the fixtures we test.
 */
const runCli = (fixtureName: string) => {
  const args = [
    "https://example.test/fixture",
    "--html-file",
    resolve(FIXTURES, fixtureName),
    "--json",
    "--no-ai-check",
    "--no-color",
    "--no-spinner",
  ];
  let out: string;
  try {
    out = execFileSync(CLI, args, { encoding: "utf-8", timeout: 30_000 });
  } catch (error) {
    const stdout = (error as { stdout?: string | Buffer }).stdout;
    out = stdout?.toString() ?? "";
  }
  return JSON.parse(out);
};

describe("shared scorer on CLI fixtures", () => {
  it("no-ogimage.html: red ogImage, gated, grade F", () => {
    const tags = parseMetaTags(fixture("no-ogimage.html"));
    const diagnostics = generateDiagnostics(tags);
    const score = computeScore(diagnostics);

    expect(diagnostics.ogImage.status).toBe("red");
    expect(score.gated).toBe(true);
    expect(score.grade).toBe("F");
  });

  it("broken-ogimage.html: unreachable probe result gates to F", () => {
    const tags = parseMetaTags(fixture("broken-ogimage.html"));
    // Simulates the /api/analyze probe verdict for the .test-TLD image URL,
    // which can never resolve (RFC 6761).
    const diagnostics = generateDiagnostics(tags, {
      width: 0,
      height: 0,
      overallStatus: null,
      reachable: false,
    });
    const score = computeScore(diagnostics);

    expect(diagnostics.ogImage.status).toBe("red");
    expect(diagnostics.ogImage.message).toContain("not reachable");
    expect(score.gated).toBe(true);
    expect(score.grade).toBe("F");
  });
});

describe.skipIf(!hasCliDeps)("CLI cross-check (python3 + jq required)", () => {
  it("no-ogimage.html: CLI agrees — ogImage 0, gated, grade F", () => {
    const result = runCli("no-ogimage.html");
    expect(result.score.categories.ogImage.score).toBe(0);
    expect(result.score.categories.ogImage.status).toBe("fail");
    expect(result.score.gated).toBe(true);
    expect(result.score.grade).toBe("F");
  });

  it("broken-ogimage.html: CLI agrees — unreachable image gates to F", () => {
    // The fixture's og:image lives on a .test TLD, which never resolves —
    // the CLI's dimension fetch fails without real network traffic.
    const result = runCli("broken-ogimage.html");
    expect(result.score.categories.ogImage.score).toBe(0);
    expect(result.score.categories.ogImage.status).toBe("fail");
    expect(result.score.gated).toBe(true);
    expect(result.score.grade).toBe("F");
  });
});
