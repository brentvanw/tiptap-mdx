import type { Node as PMNode } from "@tiptap/pm/model";
import type { Root } from "mdast";
import { parseMdast, serializeMdast } from "./markdown.js";
import { mdastToProseMirror } from "./mdast-to-pm.js";
import { proseMirrorToMdast } from "./pm-to-mdast.js";

export const VERSION = "0.0.0";

/**
 * tiptap-mdx — a lossless MDX <-> Tiptap (ProseMirror) bridge.
 *
 * The non-negotiable invariant: `roundTrip(input) === input` for any canonical
 * Markdown input. See README.md.
 */

/** Parse an MDX string into a ProseMirror document node. */
export function mdxToDoc(mdx: string): PMNode {
  const tree = parseMdast(mdx);
  return mdastToProseMirror(tree);
}

/** Serialize a ProseMirror document node back into an MDX string. */
export function docToMdx(doc: PMNode): string {
  const tree = proseMirrorToMdast(doc);
  return serializeMdast(tree);
}

/**
 * Full pipeline: MDX -> mdast -> ProseMirror doc -> mdast -> MDX.
 *
 * For canonical Markdown this is the identity function — that property is the
 * project's go/no-go gate and is enforced by the test suite.
 */
export function roundTrip(mdx: string): string {
  return docToMdx(mdxToDoc(mdx));
}

export { parseMdast, serializeMdast, SERIALIZE_OPTIONS } from "./markdown.js";
export { mdastToProseMirror } from "./mdast-to-pm.js";
export { proseMirrorToMdast } from "./pm-to-mdast.js";
export { schema } from "./schema.js";
export type { Root, PMNode };
