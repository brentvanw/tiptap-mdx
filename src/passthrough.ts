import { Node } from "@tiptap/core";
import type { Node as MdastNode } from "mdast";

/**
 * Phase 1 JSX passthrough.
 *
 * `tiptap-mdx` is an MDX bridge, but Phase 1's job is *only* standard
 * Markdown. Real `.mdx` files still contain JSX, so the pipeline must not
 * crash on them — and, ideally, must not corrupt them either.
 *
 * The passthrough node is the safety net: any mdast node the converter does
 * not yet model (JSX flow/text elements, expressions, ESM import/export) is
 * captured *verbatim* as the original mdast subtree, stored on a single
 * ProseMirror node. The serializer re-emits that exact subtree, so unknown
 * content survives a round-trip untouched.
 *
 * This is deliberately a stopgap. Phase 2 replaces it with proper verbatim
 * atom nodes that also render a styled preview. For now the node is invisible
 * to any real editor view; it only exists so the document model is total.
 *
 * Two variants are needed because ProseMirror is strict about block vs.
 * inline content:
 *  - `mdxBlockPassthrough` — block-level (sits among paragraphs/headings).
 *  - `mdxInlinePassthrough` — inline (sits inside a paragraph's content).
 */

/** mdast node types that Phase 1 carries through unchanged. */
export const PASSTHROUGH_BLOCK_TYPES = new Set<string>([
  "mdxJsxFlowElement",
  "mdxFlowExpression",
  "mdxjsEsm",
]);

export const PASSTHROUGH_INLINE_TYPES = new Set<string>([
  "mdxJsxTextElement",
  "mdxTextExpression",
]);

export interface PassthroughAttrs {
  /** The original mdast subtree, with `position` data removed. */
  mdast: MdastNode;
}

export const MdxBlockPassthrough = Node.create({
  name: "mdxBlockPassthrough",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      mdast: {
        default: null,
      },
    };
  },
});

export const MdxInlinePassthrough = Node.create({
  name: "mdxInlinePassthrough",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      mdast: {
        default: null,
      },
    };
  },
});
