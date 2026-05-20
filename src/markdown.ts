import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import { toMarkdown, type Options as ToMarkdownOptions } from "mdast-util-to-markdown";
import { mdxToMarkdown } from "mdast-util-mdx";
import { gfmToMarkdown } from "mdast-util-gfm";
import type { Root } from "mdast";

/**
 * MDX <-> mdast at the edges of the pipeline.
 *
 * Parsing uses unified with remark-parse + remark-gfm + remark-mdx so JSX and
 * GFM constructs (strikethrough) become real AST nodes with source positions.
 *
 * Serializing uses mdast-util-to-markdown directly (rather than
 * remark-stringify) so every normalization knob is in one place. The options
 * below are tuned to the Portfolio content's conventions — see SERIALIZE_OPTIONS.
 */

/**
 * Serializer options tuned for round-trip identity against the Portfolio
 * `.mdx` corpus. Each choice matches an observed convention in the source:
 *
 *  - `bullet: '-'`        — Portfolio uses `-` for unordered lists.
 *  - `rule: '-'` + repetition 3 — thematic breaks are written `---`.
 *  - `emphasis: '*'`      — italics use `*text*`.
 *  - `strong: '*'`        — bold uses `**text**`.
 *  - `fence: '`' + fences — fenced code blocks, never indented.
 *  - `listItemIndent: 'one'` — content of a list item is indented by one
 *                          space past the marker (`- text`, `1. text`).
 *  - `resourceLink: false`— links serialize as `[text](url)`, not autolinks.
 *  - `tightDefinitions`   — no blank line between adjacent definitions.
 *
 * The `mdxToMarkdown` and `gfmToMarkdown` extensions teach the serializer how
 * to write JSX and GFM nodes respectively.
 */
export const SERIALIZE_OPTIONS: ToMarkdownOptions = {
  bullet: "-",
  rule: "-",
  ruleRepetition: 3,
  emphasis: "*",
  strong: "*",
  fence: "`",
  fences: true,
  listItemIndent: "one",
  resourceLink: false,
  tightDefinitions: true,
  extensions: [mdxToMarkdown(), gfmToMarkdown()],
};

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);

/** Parse an MDX string into an mdast tree (with JSX + GFM nodes). */
export function parseMdast(mdx: string): Root {
  return parser.parse(mdx) as Root;
}

/** Serialize an mdast tree back to an MDX string, tuned for stable output. */
export function serializeMdast(tree: Root): string {
  return toMarkdown(tree, SERIALIZE_OPTIONS);
}
