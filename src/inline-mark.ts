import { Mark } from "@tiptap/core";

/**
 * Phase 4 — editable inline container components.
 *
 * An inline JSX element — `mdxJsxTextElement`, e.g. `<Emphasis>…</Emphasis>`
 * written on a single line — whose name is a registered `container` is
 * promoted from an opaque inline atom (`MdxInlineAtom`) to this mark. The
 * wrapped text becomes real, editable ProseMirror content; the open and close
 * tags are preserved verbatim.
 *
 * It is a **mark**, not a node, on purpose. ProseMirror models a span of
 * styled inline content as a mark — an inline *node* is a leaf and cannot hold
 * editable content. `<Emphasis>phrase</Emphasis>` is exactly "a phrase wrapped
 * in styling", so a mark is the correct primitive (the same shape as bold /
 * italic / link).
 *
 * Attributes:
 *  - `componentName` — the JSX tag (`Emphasis`, …); drives the styled span.
 *  - `openTag` / `closeTag` — verbatim source slices, re-emitted unchanged.
 *  - `key` — a per-element disambiguator (the element's source start offset).
 *    ProseMirror coalesces adjacent text whose mark sets are all `eq`; without
 *    a unique key two back-to-back `<Emphasis>a</Emphasis><Emphasis>b</Emphasis>`
 *    would collapse into one on serialize. `key` keeps distinct source
 *    elements distinct. It never affects output — the serializer reads only
 *    `openTag` / `closeTag` and the marked children.
 *
 * All attributes are model-only (`rendered: false`): the document is built
 * programmatically from mdast, never parsed back out of the DOM, so they do
 * not belong in the editor's HTML. `renderHTML` surfaces `componentName` as a
 * `data-` hook for styling.
 */
export const MdxInlineMark = Mark.create({
  name: "mdxInline",
  // Two runs of this mark are genuinely separate components — typing at a
  // boundary must not extend one into the other.
  inclusive: false,

  addAttributes() {
    return {
      componentName: { default: "", rendered: false },
      openTag: { default: "", rendered: false },
      closeTag: { default: "", rendered: false },
      key: { default: null, rendered: false },
    };
  },

  renderHTML({ mark }) {
    return [
      "span",
      {
        "data-mdx-inline": String(mark.attrs.componentName),
        class: "tiptap-mdx-inline",
      },
      0,
    ];
  },

  parseHTML() {
    return [{ tag: "span[data-mdx-inline]" }];
  },
});
