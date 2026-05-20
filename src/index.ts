import type { Node as PMNode } from "@tiptap/pm/model";
import type { Root } from "mdast";
import { parseMdast, serializeMdast } from "./markdown.js";
import { mdastToProseMirror } from "./mdast-to-pm.js";
import { proseMirrorToMdast } from "./pm-to-mdast.js";
import { ComponentRegistry } from "./registry.js";

export const VERSION = "0.2.1";

/**
 * tiptap-mdx — a lossless MDX <-> Tiptap (ProseMirror) bridge.
 *
 * The non-negotiable invariant: `roundTrip(input) === input` for any canonical
 * Markdown input. See README.md.
 */

/**
 * Parse an MDX string into a ProseMirror document node.
 *
 * The original `mdx` string is threaded into the converter so JSX nodes can be
 * captured verbatim by slicing their exact source spans.
 *
 * `registry` decides which JSX components become editable container nodes.
 * Omitted, it defaults to an empty registry — every JSX construct stays a
 * verbatim atom (Phase-2 behaviour). Pass `portfolioRegistry`, or a registry
 * built with `ComponentRegistry.from(...)`, to enable editable containers.
 */
export function mdxToDoc(
  mdx: string,
  registry: ComponentRegistry = ComponentRegistry.empty(),
): PMNode {
  const tree = parseMdast(mdx);
  return mdastToProseMirror(tree, mdx, registry);
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
 * project's go/no-go gate and is enforced by the test suite. With a registry
 * supplied, registered container components are promoted to editable nodes;
 * an *unedited* round-trip is still the identity function (M1 + M2 hold).
 */
export function roundTrip(
  mdx: string,
  registry: ComponentRegistry = ComponentRegistry.empty(),
): string {
  return docToMdx(mdxToDoc(mdx, registry));
}

export { parseMdast, serializeMdast, SERIALIZE_OPTIONS } from "./markdown.js";
export { mdastToProseMirror } from "./mdast-to-pm.js";
export { proseMirrorToMdast } from "./pm-to-mdast.js";
export { schema } from "./schema.js";
export {
  MdxBlockAtom,
  MdxInlineAtom,
  MDX_BLOCK_TYPES,
  MDX_INLINE_TYPES,
  mdxNodeLabel,
} from "./verbatim.js";
export type { VerbatimAttrs } from "./verbatim.js";
export {
  ComponentRegistry,
  portfolioRegistry,
} from "./registry.js";
export type { ComponentKind, ComponentConfig } from "./registry.js";
export {
  MdxContainer,
  extractAttributes,
  splitContainerTags,
} from "./container.js";
export { MdxInlineMark } from "./inline-mark.js";
export type {
  ContainerAttribute,
  MdxJsxFlowElementLike,
} from "./container.js";
export type { Root, PMNode };
