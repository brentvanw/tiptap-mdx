import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { roundTrip, portfolioRegistry } from "../src/index.js";
import { stripFrontmatter } from "./strip.js";

/**
 * Phase 2 — real-world coverage against the Portfolio `.mdx` corpus.
 *
 * Milestone M2: every Portfolio `.mdx` file must round-trip byte-equal with
 * JSX *intact* — frontmatter is still stripped (not modeled), but JSX is no
 * longer removed. The pipeline captures each JSX / expression / ESM construct
 * as a verbatim atom and re-emits its exact source, so the body survives a
 * round-trip unchanged. This is the empirical half of the M2 gate.
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
  "Phase 2 — Portfolio .mdx round-trip (JSX intact, frontmatter stripped)",
  () => {
    for (const fixture of fixtures) {
      it(fixture.label, () => {
        const raw = readFileSync(fixture.path, "utf8");
        const body = stripFrontmatter(raw);
        // M2: the full body — standard Markdown AND every JSX construct —
        // must round-trip byte-equal through the pipeline.
        expect(roundTrip(body)).toBe(body);
      });
    }
  },
);

/**
 * Phase 3 — the same corpus, this time with the Portfolio component registry
 * supplied. Registered container components are promoted to editable nodes;
 * registered atoms and unknown JSX still take the verbatim path. The
 * round-trip of an *unedited* file must remain byte-equal — promoting
 * containers must not regress M1 or M2.
 */
describe.skipIf(fixtures.length === 0)(
  "Phase 3 — Portfolio .mdx round-trip with the component registry",
  () => {
    for (const fixture of fixtures) {
      it(fixture.label, () => {
        const raw = readFileSync(fixture.path, "utf8");
        const body = stripFrontmatter(raw);
        expect(roundTrip(body, portfolioRegistry)).toBe(body);
      });
    }
  },
);

if (fixtures.length === 0) {
  describe("Phase 2 — Portfolio corpus", () => {
    it.skip("skipped: ~/Portfolio not found", () => {});
  });
}
