import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import type { Schema } from "@tiptap/pm/model";
import { MdxBlockPassthrough, MdxInlinePassthrough } from "./passthrough.js";

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
 * Custom MDX/JSX nodes are added in Phase 2.
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
  // Phase 1 JSX safety net (see passthrough.ts).
  MdxBlockPassthrough,
  MdxInlinePassthrough,
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
];
const REQUIRED_MARKS = ["bold", "italic", "strike", "code", "link"];

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
