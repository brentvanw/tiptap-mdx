import { describe, it, expect } from "vitest";
import { roundTrip } from "../src/index.js";

/**
 * M1 normalization record.
 *
 * `mdast-util-to-markdown` is a *normalizing* serializer: several Markdown
 * constructs have more than one valid spelling, and the serializer always
 * emits one canonical spelling. `roundTrip` is therefore the identity function
 * only on *canonical* input — non-canonical input is normalized on the first
 * pass and stable on every pass after.
 *
 * This file documents exactly which constructs normalize and to what. The
 * serializer (see SERIALIZE_OPTIONS in markdown.ts) is tuned so the canonical
 * form already matches the Portfolio corpus's conventions — every standard-
 * Markdown Portfolio file is therefore already canonical and needs no reformat.
 *
 * Each case asserts two things:
 *   1. non-canonical input normalizes to the documented canonical form, and
 *   2. that canonical form is then a fixed point (`roundTrip(canon) === canon`).
 */

interface NormCase {
  what: string;
  input: string;
  canonical: string;
}

const NORMALIZATIONS: NormCase[] = [
  {
    what: "unordered list bullet: * and + normalize to -",
    input: "* one\n* two\n",
    canonical: "- one\n- two\n",
  },
  {
    what: "thematic break: *** and ___ normalize to ---",
    input: "***\n",
    canonical: "---\n",
  },
  {
    what: "emphasis: _underscore_ normalizes to *asterisk*",
    input: "_italic_\n",
    canonical: "*italic*\n",
  },
  {
    what: "strong: __underscores__ normalize to **asterisks**",
    input: "__bold__\n",
    canonical: "**bold**\n",
  },
  {
    what: "setext heading normalizes to ATX heading",
    input: "Title\n=====\n",
    canonical: "# Title\n",
  },
];

describe("M1 — documented serializer normalizations", () => {
  for (const c of NORMALIZATIONS) {
    describe(c.what, () => {
      it("non-canonical input normalizes to the canonical form", () => {
        expect(roundTrip(c.input)).toBe(c.canonical);
      });
      it("the canonical form is a fixed point", () => {
        expect(roundTrip(c.canonical)).toBe(c.canonical);
      });
    });
  }
});
