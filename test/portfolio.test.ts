import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { roundTrip } from "../src/index.js";
import { toCanonicalMarkdown } from "./strip.js";

/**
 * Phase 1 — real-world coverage against the Portfolio `.mdx` corpus.
 *
 * Each file is reduced to canonical standard Markdown (frontmatter + JSX
 * stripped — see strip.ts) and then asserted to round-trip byte-equal. This is
 * the empirical half of the M1 go/no-go gate.
 *
 * The Portfolio repo is read-only and external; if it is not present (e.g. CI
 * without the sibling checkout) the suite is skipped rather than failing.
 */

const PORTFOLIO_ROOT = join(homedir(), "Portfolio", "src");

const CONTENT_DIRS = [
  "pages/case-studies",
  "pages/writing",
  "pages/about-content",
  "pages/now",
  "site",
];

interface Fixture {
  label: string;
  path: string;
}

function collectFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const dir of CONTENT_DIRS) {
    const abs = join(PORTFOLIO_ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs)) {
      if (!file.endsWith(".mdx")) continue;
      fixtures.push({ label: `${dir}/${file}`, path: join(abs, file) });
    }
  }
  return fixtures;
}

const fixtures = collectFixtures();

describe.skipIf(fixtures.length === 0)(
  "Phase 1 — Portfolio .mdx round-trip (JSX + frontmatter stripped)",
  () => {
    for (const fixture of fixtures) {
      it(fixture.label, () => {
        const raw = readFileSync(fixture.path, "utf8");
        const canonical = toCanonicalMarkdown(raw);
        // The standard-Markdown body of every real file must round-trip
        // byte-equal through the full pipeline.
        expect(roundTrip(canonical)).toBe(canonical);
      });
    }
  },
);

if (fixtures.length === 0) {
  describe("Phase 1 — Portfolio corpus", () => {
    it.skip("skipped: ~/Portfolio not found", () => {});
  });
}
