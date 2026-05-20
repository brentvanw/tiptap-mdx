import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import {
  toMarkdown,
  type Options as ToMarkdownOptions,
  type Handlers,
} from "mdast-util-to-markdown";
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
 * Custom mdast node for an editable container component (Phase 3). The open and
 * close tags are carried verbatim; the children are real mdast nodes and are
 * serialized as ordinary Markdown by the handler.
 */
interface ContainerMdastNode {
  type: "mdxContainerBlock";
  openTag: string;
  closeTag: string;
  /** Verbatim inter-child separators; `gaps[i]` joins child i to child i+1. */
  gaps: string[];
  children: unknown[];
}

/**
 * Custom mdast node for an editable *inline* container component (Phase 4).
 * The open/close tags are carried verbatim; the children are real phrasing
 * nodes the handler serializes as ordinary inline Markdown.
 */
interface ContainerInlineMdastNode {
  type: "mdxContainerInline";
  openTag: string;
  closeTag: string;
  children: unknown[];
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
 * Strikethrough (`delete`) is handled by the hand-written `delete` handler
 * below rather than by `gfmToMarkdown` — see that handler's comment for why
 * (the GFM extension escapes every bare `~`, corrupting "~18%"-style prose).
 * `mdxToMarkdown` is also intentionally *not* included: every MDX JSX /
 * expression / ESM node is captured as a verbatim atom and re-emitted via the
 * `handlers` below, so the JSX serializer is never invoked and can never
 * reflow content.
 *
 * Three custom handlers:
 *  - `mdxVerbatimBlock` / `mdxVerbatimInline` — return the stored source
 *    unchanged (verbatim atoms — Phase 2).
 *  - `mdxContainerBlock` — Phase 3 editable containers. The handler serializes
 *    each *real* child individually (so an edited child round-trips as ordinary
 *    Markdown) and re-joins them: open tag, child, verbatim gap, child, …,
 *    close tag. The open/close tags and the per-boundary gaps are all sliced
 *    verbatim from the original source, so an unedited container reassembles
 *    byte-for-byte. A boundary with no stored gap (a child added by an edit)
 *    falls back to a canonical blank-line separator.
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
  // `Handlers` is keyed by the known mdast node types; the custom node types
  // are not, so the record is built untyped and cast. The verbatim handlers
  // return the stored source unchanged; the container handler serializes its
  // children and wraps them in the verbatim open/close tags.
  handlers: {
    mdxVerbatimBlock: (node: unknown): string =>
      (node as VerbatimMdastNode).value,
    mdxVerbatimInline: (node: unknown): string =>
      (node as VerbatimMdastNode).value,
    mdxContainerBlock: (
      node: unknown,
      _parent: unknown,
      state: {
        handle: (
          child: unknown,
          parent: unknown,
          state: unknown,
          info: unknown,
        ) => string;
        bulletLastUsed?: string | undefined;
      },
      info: unknown,
    ): string => {
      const container = node as ContainerMdastNode;
      const children = container.children;
      // Each child is a real mdast node — serialize it as ordinary Markdown.
      // Use a fresh block-context `info` (`before`/`after` = newline) per
      // child, exactly as `mdast-util-to-markdown`'s own block serializer
      // does. Threading the outer inline `info` instead would corrupt the
      // escape context — e.g. a leading `~` would be escaped as `\~`.
      const blockInfo = { ...(info as object), before: "\n", after: "\n" };
      const parts = children.map((child) => {
        // Reset the bullet-alternation memo before each child. Serializing
        // children one at a time shares `state`, so two ordered lists split
        // by a code block would otherwise see each other as adjacent and
        // alternate the marker (`3.` -> `3)`). Each container child is its
        // own block context.
        state.bulletLastUsed = undefined;
        return state.handle(child, container, state, blockInfo);
      });
      // Re-join: openTag + child0 + gap0 + child1 + … + closeTag. Gaps are the
      // verbatim source separators; a missing one (a child added by an edit)
      // falls back to a blank-line separator so the output stays well-formed.
      let inner = parts[0] ?? "";
      for (let i = 1; i < parts.length; i++) {
        const gap = container.gaps[i - 1];
        inner += (gap != null ? gap : "\n\n") + parts[i];
      }
      return container.openTag + inner + container.closeTag;
    },
    // Phase 4 editable inline containers. The children are real phrasing
    // nodes; `containerPhrasing` serializes them as ordinary inline Markdown.
    // `before`/`after` frame the escape context — the content sits between the
    // `>` ending the open tag and the `<` starting the close tag.
    mdxContainerInline: (
      node: unknown,
      _parent: unknown,
      state: {
        containerPhrasing: (parent: unknown, info: unknown) => string;
      },
      info: unknown,
    ): string => {
      const inline = node as ContainerInlineMdastNode;
      const inner = state.containerPhrasing(inline, {
        ...(info as object),
        before: ">",
        after: "<",
      });
      return inline.openTag + inner + inline.closeTag;
    },
    // Strikethrough (`delete`) — emitted as `~~…~~`. Hand-written rather than
    // pulled in via `gfmToMarkdown`, whose strikethrough extension registers
    // an `unsafe` rule that escapes EVERY bare `~` to `\~`. A lone `~` is in
    // fact safe — only a doubled `~~` opens strikethrough — and the corpus
    // uses it for approximations ("~18%", "~98%"). The over-cautious escape
    // would change those bytes, which in turn demotes whole `<Section>`s to
    // verbatim atoms (the round-trip guard refuses a promotion that is not
    // byte-exact). Emitting `~~` directly here, with no `~` unsafe rule, keeps
    // real strikethrough working while leaving lone tildes untouched.
    delete: (
      node: unknown,
      _parent: unknown,
      state: {
        containerPhrasing: (parent: unknown, info: unknown) => string;
      },
      info: unknown,
    ): string => {
      const inner = state.containerPhrasing(node, {
        ...(info as object),
        before: "~",
        after: "~",
      });
      return "~~" + inner + "~~";
    },
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
