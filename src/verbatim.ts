import { Node } from "@tiptap/core";

/**
 * Phase 2 — MDX JSX verbatim atoms.
 *
 * `tiptap-mdx` is an MDX bridge, but MDX's defining feature — JSX components
 * and embedded expressions — cannot be round-tripped by re-serializing a
 * parsed subtree: `mdast-util-mdx`'s serializer re-indents JSX flow-element
 * children by two spaces and collapses blank lines inside them. Re-emitting a
 * parsed `<Section>` mangles it.
 *
 * The fix is to never re-serialize JSX at all. `remark-mdx` attaches precise
 * `position` data (start/end character offsets) to every node, so for each
 * MDX-specific node we slice the *exact original source substring* and store
 * that string verbatim on a ProseMirror atom node. On serialize the atom emits
 * its stored string unchanged — byte for byte.
 *
 * This is the universal safety net: any JSX, any expression, any ESM
 * statement — recognized or not — becomes a verbatim atom and survives a
 * round-trip untouched. The editor can never corrupt content it captured
 * verbatim.
 *
 * Two variants are needed because ProseMirror is strict about block vs.
 * inline content:
 *  - `mdxBlockAtom`  — block-level (`mdxJsxFlowElement`, `mdxFlowExpression`,
 *                      `mdxjsEsm`); sits among paragraphs/headings.
 *  - `mdxInlineAtom` — inline (`mdxJsxTextElement`, `mdxTextExpression`);
 *                      sits inside a paragraph's content.
 *
 * Each atom also carries a human-readable `label` (the component or
 * expression name) so a real editor view can render a minimal placeholder.
 * Rich, editable rendering of container components is Phase 3.
 */

/** mdast node types produced by remark-mdx that map to a block verbatim atom. */
export const MDX_BLOCK_TYPES = new Set<string>([
  "mdxJsxFlowElement",
  "mdxFlowExpression",
  "mdxjsEsm",
]);

/** mdast node types produced by remark-mdx that map to an inline verbatim atom. */
export const MDX_INLINE_TYPES = new Set<string>([
  "mdxJsxTextElement",
  "mdxTextExpression",
]);

export interface VerbatimAttrs {
  /** Exact original MDX source for this node — emitted unchanged on serialize. */
  value: string;
  /**
   * Human-readable label for the editor placeholder: the JSX component name
   * (`Figure`, `Section`, `ImageGrid`) or a generic kind for expressions/ESM.
   */
  label: string;
}

/**
 * Derive the placeholder label for an MDX mdast node.
 *
 * JSX elements expose their tag in `node.name` (a fragment `<>` has `name`
 * null). Expressions and ESM have no name, so a generic kind is used.
 */
export function mdxNodeLabel(node: {
  type: string;
  name?: string | null;
}): string {
  if (
    node.type === "mdxJsxFlowElement" ||
    node.type === "mdxJsxTextElement"
  ) {
    return node.name ?? "Fragment";
  }
  if (
    node.type === "mdxFlowExpression" ||
    node.type === "mdxTextExpression"
  ) {
    return "Expression";
  }
  if (node.type === "mdxjsEsm") return "Import/Export";
  return "MDX";
}

export const MdxBlockAtom = Node.create({
  name: "mdxBlockAtom",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      value: { default: "" },
      label: { default: "MDX" },
    };
  },
  // Minimal placeholder. Phase 3 replaces this for container components.
  renderHTML({ node }) {
    return [
      "div",
      {
        "data-mdx-atom": "block",
        "data-mdx-label": String(node.attrs.label),
        class: "tiptap-mdx-atom tiptap-mdx-atom--block",
      },
      `⟨${node.attrs.label}⟩`,
    ];
  },
});

export const MdxInlineAtom = Node.create({
  name: "mdxInlineAtom",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      value: { default: "" },
      label: { default: "MDX" },
    };
  },
  renderHTML({ node }) {
    return [
      "span",
      {
        "data-mdx-atom": "inline",
        "data-mdx-label": String(node.attrs.label),
        class: "tiptap-mdx-atom tiptap-mdx-atom--inline",
      },
      `⟨${node.attrs.label}⟩`,
    ];
  },
});
