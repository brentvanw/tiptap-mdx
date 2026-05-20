import { Node as PMNode, Mark, Fragment } from "@tiptap/pm/model";
import type {
  Root,
  Content,
  PhrasingContent,
  RootContent,
  ListItem,
} from "mdast";
import { schema } from "./schema.js";
import {
  PASSTHROUGH_BLOCK_TYPES,
  PASSTHROUGH_INLINE_TYPES,
} from "./passthrough.js";

/**
 * mdast -> ProseMirror document.
 *
 * Walks an mdast tree and builds the equivalent ProseMirror document using the
 * schema from `schema.ts`. Only the standard-Markdown subset is modeled as
 * real nodes; JSX / expression nodes are wrapped in passthrough nodes that
 * carry the original mdast subtree verbatim.
 *
 * The converter is intentionally total: any mdast node it does not recognize
 * becomes a passthrough rather than throwing, so the pipeline never crashes on
 * real content.
 */

/** Strip `position` data from an mdast node tree (recursively, in place). */
function stripPositions<T>(node: T): T {
  const visit = (n: unknown): void => {
    if (n && typeof n === "object") {
      const obj = n as Record<string, unknown>;
      delete obj.position;
      const children = obj.children;
      if (Array.isArray(children)) {
        for (const child of children) visit(child);
      }
    }
  };
  // Deep-clone first so the caller's tree is never mutated.
  const clone = structuredClone(node);
  visit(clone);
  return clone;
}

/** Build a passthrough PM node carrying a verbatim mdast subtree. */
function passthrough(nodeType: "block" | "inline", mdast: Content): PMNode {
  const name =
    nodeType === "block" ? "mdxBlockPassthrough" : "mdxInlinePassthrough";
  return schema.nodes[name]!.create({ mdast: stripPositions(mdast) });
}

/**
 * Convert mdast phrasing content into an array of inline ProseMirror nodes.
 * `marks` is the set of marks accumulated from enclosing emphasis/strong/etc.
 */
function convertPhrasing(
  nodes: PhrasingContent[],
  marks: readonly Mark[],
): PMNode[] {
  const out: PMNode[] = [];
  for (const node of nodes) {
    out.push(...convertInline(node, marks));
  }
  return out;
}

function convertInline(
  node: PhrasingContent,
  marks: readonly Mark[],
): PMNode[] {
  switch (node.type) {
    case "text":
      if (node.value === "") return [];
      return [schema.text(node.value, marks)];

    case "strong":
      return convertPhrasing(node.children, [
        ...marks,
        schema.marks.bold!.create(),
      ]);

    case "emphasis":
      return convertPhrasing(node.children, [
        ...marks,
        schema.marks.italic!.create(),
      ]);

    case "delete":
      return convertPhrasing(node.children, [
        ...marks,
        schema.marks.strike!.create(),
      ]);

    case "inlineCode":
      return [schema.text(node.value, [...marks, schema.marks.code!.create()])];

    case "link": {
      const linkMark = schema.marks.link!.create({
        href: node.url,
        title: node.title ?? null,
      });
      return convertPhrasing(node.children, [...marks, linkMark]);
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
      // JSX text elements, text expressions, and anything else inline.
      if (PASSTHROUGH_INLINE_TYPES.has(node.type)) {
        return [passthrough("inline", node as Content)];
      }
      // Unknown inline node — carry through verbatim rather than dropping it.
      return [passthrough("inline", node as Content)];
  }
}

/** Convert a single mdast block node into ProseMirror block node(s). */
function convertBlock(node: RootContent): PMNode[] {
  switch (node.type) {
    case "heading":
      return [
        schema.nodes.heading!.create(
          { level: node.depth },
          Fragment.from(convertPhrasing(node.children, [])),
        ),
      ];

    case "paragraph":
      return [
        schema.nodes.paragraph!.create(
          null,
          Fragment.from(convertPhrasing(node.children, [])),
        ),
      ];

    case "blockquote":
      return [
        schema.nodes.blockquote!.create(
          null,
          Fragment.from(convertBlocks(node.children)),
        ),
      ];

    case "list": {
      const items = node.children.map((item) => convertListItem(item));
      const listType = node.ordered ? "orderedList" : "bulletList";
      const attrs = node.ordered
        ? { start: node.start ?? 1 }
        : null;
      return [
        schema.nodes[listType]!.create(attrs, Fragment.from(items)),
      ];
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
      // JSX flow elements, flow expressions, ESM, and anything unrecognized.
      return [passthrough("block", node as Content)];
  }
}

function convertBlocks(nodes: RootContent[]): PMNode[] {
  const out: PMNode[] = [];
  for (const node of nodes) out.push(...convertBlock(node));
  return out;
}

/** Convert an mdast listItem into a ProseMirror listItem node. */
function convertListItem(item: ListItem): PMNode {
  const children = convertBlocks(item.children);
  // ProseMirror's listItem requires a leading paragraph. mdast list items
  // always start with block content; an empty item still needs one.
  if (children.length === 0) {
    children.push(schema.nodes.paragraph!.create());
  }
  return schema.nodes.listItem!.create(null, Fragment.from(children));
}

/** Convert an mdast Root into a ProseMirror document node. */
export function mdastToProseMirror(tree: Root): PMNode {
  let blocks = convertBlocks(tree.children as RootContent[]);
  // ProseMirror's doc requires `block+` — never empty.
  if (blocks.length === 0) {
    blocks = [schema.nodes.paragraph!.create()];
  }
  return schema.nodes.doc!.create(null, Fragment.from(blocks));
}

// Re-export for callers that want to know which mdast types are passthrough.
export { PASSTHROUGH_BLOCK_TYPES, PASSTHROUGH_INLINE_TYPES };
