import { describe, it, expect } from "vitest";
import { roundTrip } from "../src/index.js";

/**
 * Phase 1 — comprehensive standard-Markdown round-trip identity.
 *
 * Every fixture below is *canonical* Markdown (already in the form the tuned
 * serializer emits). The invariant under test is `roundTrip(x) === x`.
 */

const FIXTURES: Record<string, string[]> = {
  headings: [
    "# Heading one\n",
    "## Heading two\n",
    "### Heading three\n",
    "#### Heading four\n",
    "##### Heading five\n",
    "###### Heading six\n",
    "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6\n",
  ],

  paragraphs: [
    "A single paragraph.\n",
    "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n",
  ],

  "inline marks": [
    "A paragraph with **bold** text.\n",
    "A paragraph with *italic* text.\n",
    "A paragraph with ~~strikethrough~~ text.\n",
    "A paragraph with `inline code` text.\n",
    "All four: **bold**, *italic*, ~~strike~~, `code`.\n",
  ],

  "nested marks": [
    "A line with **bold *and italic* together**.\n",
    "A line with *italic **and bold** together*.\n",
    "Bold then `code` then *italic*.\n",
  ],

  links: [
    "Here is a [link](https://example.com) inline.\n",
    'Here is a [titled link](https://example.com "the title") inline.\n',
    "A [**bold link**](https://example.com).\n",
    "A relative [link](/case-study/goodsphd) inline.\n",
  ],

  images: [
    "![alt text](/images/pic.png)\n",
    "Text with an ![inline image](/x.png) in it.\n",
    '![titled](/y.png "image title")\n',
  ],

  "unordered lists": [
    "- one\n- two\n- three\n",
    "- one\n- two\n  - nested a\n  - nested b\n- three\n",
    "- top\n  - mid\n    - deep\n",
  ],

  "ordered lists": [
    "1. first\n2. second\n3. third\n",
    "1. first\n2. second\n   1. nested first\n   2. nested second\n3. third\n",
  ],

  "mixed lists": [
    "1. a\n   - sub bullet\n   - sub bullet two\n2. b\n",
    "- bullet\n  1. ordered child\n  2. ordered child two\n- bullet two\n",
  ],

  "list items with marks": [
    "- a **bold** item\n- an *italic* item\n- a `code` item\n- a [link](https://x.com) item\n",
  ],

  blockquotes: [
    "> a single-line quote\n",
    "> a quote\n>\n> with a second paragraph\n",
    "> ## a heading inside a quote\n>\n> and a paragraph\n",
  ],

  "code blocks": [
    "```\nplain fenced code\n```\n",
    "```js\nconst x = 1;\nconsole.log(x);\n```\n",
    "```ts\ninterface A {\n  b: string;\n}\n```\n",
  ],

  "thematic breaks": ["---\n", "Para one.\n\n---\n\nPara two.\n"],

  "mixed documents": [
    "# Title\n\nAn intro paragraph with **bold** and a [link](https://x.com).\n\n## A section\n\n- point one\n- point two\n\n> A pull quote.\n\n```js\nconst done = true;\n```\n\n---\n\nClosing paragraph.\n",
  ],
};

describe("Phase 1 — standard Markdown round-trip identity", () => {
  for (const [group, cases] of Object.entries(FIXTURES)) {
    describe(group, () => {
      for (const [i, input] of cases.entries()) {
        it(`case ${i + 1}: ${JSON.stringify(input).slice(0, 60)}`, () => {
          expect(roundTrip(input)).toBe(input);
        });
      }
    });
  }
});
