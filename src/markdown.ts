import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import {
  toMarkdown,
  type Options as ToMarkdownOptions,
  type Handlers,
} from "mdast-util-to-markdown";
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
 * Custom mdast node types emitted by the ProseMirror -> mdast converter for
 * JSX verbatim atoms. They are *not* `mdast-util-mdx` node types: they carry a
 * pre-sliced verbatim source string and are written back unchanged, bypassing
 * `mdast-util-mdx`'s JSX serializer entirely (which re-indents and reflows
 * JSX flow children). See `verbatim.ts` for why this matters.
 */
interface VerbatimMdastNode {
  type: "mdxVerbatimBlock" | "mdxVerbatimInline";
  /** Exact original MDX source — emitted byte-for-byte. */
  value: string;
}

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
 * The `gfmToMarkdown` extension teaches the serializer the GFM nodes
 * (strikethrough). `mdxToMarkdown` is intentionally *not* included: every MDX
 * JSX / expression / ESM node is captured as a verbatim atom and re-emitted
 * via the `handlers` below, so the JSX serializer is never invoked and can
 * never reflow content. The `handlers` simply return the stored source.
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
  extensions: [gfmToMarkdown()],
  // `Handlers` is keyed by the known mdast node types; the verbatim node types
  // are custom, so the record is built untyped and cast. Each handler simply
  // returns the stored verbatim source — no escaping, no reflow.
  handlers: {
    mdxVerbatimBlock: (node: unknown): string =>
      (node as VerbatimMdastNode).value,
    mdxVerbatimInline: (node: unknown): string =>
      (node as VerbatimMdastNode).value,
  } as unknown as Partial<Handlers>,
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
