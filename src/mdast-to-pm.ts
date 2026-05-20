import { Node as PMNode, Mark, Fragment } from "@tiptap/pm/model";
import type {
  Root,
  PhrasingContent,
  RootContent,
  ListItem,
  Node as MdastNode,
} from "mdast";
import { schema } from "./schema.js";
import {
  MDX_BLOCK_TYPES,
  MDX_INLINE_TYPES,
  mdxNodeLabel,
} from "./verbatim.js";

/**
 * mdast -> ProseMirror document.
 *
 * Walks an mdast tree and builds the equivalent ProseMirror document using the
 * schema from `schema.ts`. The standard-Markdown subset is modeled as real
 * nodes; every MDX-specific node (JSX flow/text elements, expressions, ESM) is
 * captured as a *verbatim atom*.
 *
 * A verbatim atom stores the exact original source substring for the node,
 * sliced via the `position` offsets `remark-mdx` attaches. The walk does NOT
 * recurse into a JSX element's children — the source span already contains
 * them, nested markdown and nested JSX alike, so the whole element is captured
 * as one opaque atom. This is what makes the round-trip byte-exact: JSX is
 * never re-serialized from a parsed subtree.
 *
 * The converter is intentionally total: any mdast node it does not recognize
 * with a usable source span is still captured verbatim rather than dropped, so
 * the pipeline never crashes on real content.
 */

/**
 * Slice the exact original MDX source for an mdast node using its `position`
 * offsets. Returns `null` if the node has no usable position data.
 */
function sliceSource(node: MdastNode, source: string): string | null {
  const pos = node.position;
  if (
    !pos ||
    typeof pos.start.offset !== "number" ||
    typeof pos.end.offset !== "number"
  ) {
    return null;
  }
  return source.slice(pos.start.offset, pos.end.offset);
}

/** Build a block-level verbatim atom for an MDX mdast node. */
function blockAtom(node: MdastNode, source: string): PMNode {
  const value = sliceSource(node, source);
  if (value == null) {
    throw new Error(
      `tiptap-mdx: MDX node "${node.type}" has no source position; ` +
        "cannot capture it verbatim. Was the document parsed with parseMdast?",
    );
  }
  return schema.nodes.mdxBlockAtom!.create({
    value,
    label: mdxNodeLabel(node as { type: string; name?: string | null }),
  });
}

/** Build an inline verbatim atom for an MDX mdast node. */
function inlineAtom(node: MdastNode, source: string): PMNode {
  const value = sliceSource(node, source);
  if (value == null) {
    throw new Error(
      `tiptap-mdx: inline MDX node "${node.type}" has no source position; ` +
        "cannot capture it verbatim. Was the document parsed with parseMdast?",
    );
  }
  return schema.nodes.mdxInlineAtom!.create({
    value,
    label: mdxNodeLabel(node as { type: string; name?: string | null }),
  });
}

/**
 * Convert mdast phrasing content into an array of inline ProseMirror nodes.
 * `marks` is the set of marks accumulated from enclosing emphasis/strong/etc.
 */
function convertPhrasing(
  nodes: PhrasingContent[],
  marks: readonly Mark[],
  source: string,
): PMNode[] {
  const out: PMNode[] = [];
  for (const node of nodes) {
    out.push(...convertInline(node, marks, source));
  }
  return out;
}

function convertInline(
  node: PhrasingContent,
  marks: readonly Mark[],
  source: string,
): PMNode[] {
  switch (node.type) {
    case "text":
      if (node.value === "") return [];
      return [schema.text(node.value, marks)];

    case "strong":
      return convertPhrasing(
        node.children,
        [...marks, schema.marks.bold!.create()],
        source,
      );

    case "emphasis":
      return convertPhrasing(
        node.children,
        [...marks, schema.marks.italic!.create()],
        source,
      );

    case "delete":
      return convertPhrasing(
        node.children,
        [...marks, schema.marks.strike!.create()],
        source,
      );

    case "inlineCode":
      return [schema.text(node.value, [...marks, schema.marks.code!.create()])];

    case "link": {
      const linkMark = schema.marks.link!.create({
        href: node.url,
        title: node.title ?? null,
      });
      return convertPhrasing(node.children, [...marks, linkMark], source);
    }

    case "image":
      return [
        schema.nodes.image!.create({
          src: node.url,
          alt: node.alt ?? null,
          title: node.title ?? null,
        }),
      ];

    case "break":
      return [schema.nodes.hardBreak!.create()];

    default:
      // Inline JSX elements, inline expressions, and anything else inline:
      // capture verbatim. Marks on a JSX atom are dropped — a JSX element
      // is an opaque atom, not styled text — but in practice MDX inline
      // elements never appear inside emphasis/strong runs.
      return [inlineAtom(node as MdastNode, source)];
  }
}

/** Convert a single mdast block node into ProseMirror block node(s). */
function convertBlock(node: RootContent, source: string): PMNode[] {
  switch (node.type) {
    case "heading":
      return [
        schema.nodes.heading!.create(
          { level: node.depth },
          Fragment.from(convertPhrasing(node.children, [], source)),
        ),
      ];

    case "paragraph":
      return [
        schema.nodes.paragraph!.create(
          null,
          Fragment.from(convertPhrasing(node.children, [], source)),
        ),
      ];

    case "blockquote":
      return [
        schema.nodes.blockquote!.create(
          null,
          Fragment.from(convertBlocks(node.children, source)),
        ),
      ];

    case "list": {
      const items = node.children.map((item) =>
        convertListItem(item, source),
      );
      const listType = node.ordered ? "orderedList" : "bulletList";
      const attrs = node.ordered ? { start: node.start ?? 1 } : null;
      return [schema.nodes[listType]!.create(attrs, Fragment.from(items))];
    }

    case "code":
      return [
        schema.nodes.codeBlock!.create(
          { language: node.lang ?? null },
          node.value ? Fragment.from(schema.text(node.value)) : Fragment.empty,
        ),
      ];

    case "thematicBreak":
      return [schema.nodes.horizontalRule!.create()];

    default:
      // JSX flow elements, flow expressions, ESM, and anything unrecognized:
      // capture the whole source span verbatim. The walk stops here — nested
      // markdown and nested JSX are inside the span already.
      return [blockAtom(node as MdastNode, source)];
  }
}

function convertBlocks(nodes: RootContent[], source: string): PMNode[] {
  const out: PMNode[] = [];
  for (const node of nodes) out.push(...convertBlock(node, source));
  return out;
}

/** Convert an mdast listItem into a ProseMirror listItem node. */
function convertListItem(item: ListItem, source: string): PMNode {
  const children = convertBlocks(item.children, source);
  // ProseMirror's listItem requires a leading paragraph. mdast list items
  // always start with block content; an empty item still needs one.
  if (children.length === 0) {
    children.push(schema.nodes.paragraph!.create());
  }
  return schema.nodes.listItem!.create(null, Fragment.from(children));
}

/**
 * Convert an mdast Root into a ProseMirror document node.
 *
 * `source` is the original MDX string the tree was parsed from — it is sliced
 * to capture JSX verbatim. It must be the exact string passed to `parseMdast`,
 * otherwise the `position` offsets will not line up.
 */
export function mdastToProseMirror(tree: Root, source: string): PMNode {
  let blocks = convertBlocks(tree.children as RootContent[], source);
  // ProseMirror's doc requires `block+` — never empty.
  if (blocks.length === 0) {
    blocks = [schema.nodes.paragraph!.create()];
  }
  return schema.nodes.doc!.create(null, Fragment.from(blocks));
}

// Re-export for callers that want to know which mdast types are verbatim.
export { MDX_BLOCK_TYPES, MDX_INLINE_TYPES };
