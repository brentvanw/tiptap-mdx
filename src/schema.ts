import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import type { Schema } from "@tiptap/pm/model";
import { MdxBlockAtom, MdxInlineAtom } from "./verbatim.js";
import { MdxContainer } from "./container.js";
import { MdxInlineMark } from "./inline-mark.js";

/**
 * The ProseMirror schema for tiptap-mdx.
 *
 * Derived from Tiptap's StarterKit so the schema stays in lockstep with what
 * a real Tiptap editor would use. `getSchema()` builds the schema from the
 * extension list without ever touching the DOM, so this runs in Node.
 *
 * Phase 1 covers the standard-Markdown subset:
 *   - doc, paragraph, text
 *   - heading (levels 1-6)
 *   - bulletList, orderedList, listItem
 *   - blockquote
 *   - codeBlock (fenced)
 *   - horizontalRule (thematic break)
 *   - image
 *   - hardBreak
 *   - marks: bold, italic, strike, code, link
 *
 * Phase 2 adds the MDX verbatim atom nodes (see verbatim.ts): every JSX /
 * expression / ESM construct becomes an opaque atom carrying its exact source.
 *
 * Phase 3 adds the editable container node (see container.ts): a registered
 * container component becomes a styled wrapper with real, editable block
 * children, while its open/close tags are preserved verbatim.
 *
 * Phase 4 adds the editable inline container mark (see inline-mark.ts): a
 * registered container written as an inline JSX element becomes an editable
 * mark over its text, with the open/close tags preserved verbatim.
 */
export const schema: Schema = getSchema([
  StarterKit.configure({
    // Keep heading at the default 1-6 range — Markdown supports all six.
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  // StarterKit (2.27) ships neither the image node nor the link mark, so they
  // are added explicitly here. Markdown images are phrasing-level content
  // (`![alt](url)` lives inside a paragraph), so the image node is inline.
  Image.configure({ inline: true }),
  // The stock Link mark has no `title` attribute, but Markdown links carry an
  // optional title (`[text](url "title")`). Extend the mark to preserve it.
  Link.extend({
    addAttributes() {
      return {
        ...(this.parent?.() ?? {}),
        title: { default: null },
      };
    },
  }),
  // Phase 2 MDX verbatim atoms (see verbatim.ts).
  MdxBlockAtom,
  MdxInlineAtom,
  // Phase 3 editable container node (see container.ts).
  MdxContainer,
  // Phase 4 editable inline container mark (see inline-mark.ts).
  MdxInlineMark,
]);

// Sanity: surface a clear error early if an expected node/mark is missing,
// rather than failing deep inside the converters.
const REQUIRED_NODES = [
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "image",
  "mdxBlockAtom",
  "mdxInlineAtom",
  "mdxContainer",
];
const REQUIRED_MARKS = ["bold", "italic", "strike", "code", "link", "mdxInline"];

for (const name of REQUIRED_NODES) {
  if (!schema.nodes[name]) {
    throw new Error(`tiptap-mdx: schema is missing required node "${name}"`);
  }
}
for (const name of REQUIRED_MARKS) {
  if (!schema.marks[name]) {
    throw new Error(`tiptap-mdx: schema is missing required mark "${name}"`);
  }
}
