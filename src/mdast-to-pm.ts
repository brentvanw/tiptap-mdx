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
import { ComponentRegistry } from "./registry.js";
import {
  extractAttributes,
  splitContainerTags,
  type MdxJsxFlowElementLike,
} from "./container.js";
import { proseMirrorToMdast } from "./pm-to-mdast.js";
import { serializeMdast } from "./markdown.js";

/**
 * mdast -> ProseMirror document.
 *
 * Walks an mdast tree and builds the equivalent ProseMirror document using the
 * schema from `schema.ts`. The standard-Markdown subset is modeled as real
 * nodes; every MDX-specific node (JSX flow/text elements, expressions, ESM) is
 * captured as a *verbatim atom*.
 *
 * A verbatim atom stores the exact original source substring for the node,
 * sliced via the `position` offsets `remark-mdx` attaches. By default the walk
 * does NOT recurse into a JSX element's children — the source span already
 * contains them, so the whole element is captured as one opaque atom.
 *
 * Phase 3 adds one exception: a JSX flow element whose name is registered as a
 * `container` in the supplied `ComponentRegistry` is promoted to an editable
 * `mdxContainer` node. Its open/close tags are sliced verbatim (carrying
 * attributes and blank-line padding), and the walk *does* recurse into its
 * children, converting them to real editable block nodes. Atoms and any
 * unregistered JSX still take the verbatim-atom path — the universal safety
 * net is unchanged.
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
 * Build the editable container node for a registered container component.
 *
 * The open/close tags are sliced verbatim (so attributes and blank-line
 * padding survive); the children are recursed into as real, editable block
 * content. Returns `null` if the element cannot be safely promoted — so the
 * caller falls back to a verbatim atom. A container is promoted ONLY when its
 * children round-trip byte-equal: the children become editable Markdown, and
 * Markdown serialization is canonicalizing (e.g. `mdast-util-gfm` defensively
 * escapes a bare `~`). If the original child Markdown is non-canonical, an
 * unedited promotion would *change bytes* — so such a container is kept as a
 * Phase-2 verbatim atom instead. This guarantees M2 never regresses: every
 * container that can be promoted losslessly is; every one that cannot stays a
 * byte-exact atom. The safety net is absolute.
 */
function containerNode(
  node: MdxJsxFlowElementLike,
  ctx: ConvertContext,
): PMNode | null {
  const tags = splitContainerTags(node, ctx.source);
  if (tags == null) return null;

  const children = convertBlocks(node.children as RootContent[], ctx);
  // mdxContainer is `block+`; a container with no convertible children cannot
  // satisfy the schema — fall back to a verbatim atom in that case.
  if (children.length === 0) return null;

  const container = schema.nodes.mdxContainer!.create(
    {
      componentName: node.name ?? "",
      openTag: tags.openTag,
      closeTag: tags.closeTag,
      gaps: tags.gaps,
      attributes: extractAttributes(node),
    },
    Fragment.from(children),
  );

  // Round-trip guard: the container, serialized unchanged, must reproduce its
  // exact source span. If Markdown canonicalization would alter a byte, do not
  // promote — keep the verbatim atom. (Edits are still serialized faithfully;
  // this guard only protects the *unedited* identity invariant.)
  const expected = sliceSource(node, ctx.source);
  if (expected == null) return null;
  const actual = serializeContainerStandalone(container);
  if (actual !== expected) return null;

  return container;
}

/**
 * Serialize a single `mdxContainer` PM node to MDX, in isolation. Used by the
 * round-trip guard in `containerNode`. The container is wrapped in a throwaway
 * document; `serializeMdast` adds one trailing newline (block documents always
 * end in `\n`), which is stripped so the result lines up with the node's raw
 * source span.
 */
function serializeContainerStandalone(container: PMNode): string {
  const doc = schema.nodes.doc!.create(null, Fragment.from([container]));
  return serializeMdast(proseMirrorToMdast(doc)).replace(/\n$/, "");
}

/**
 * Conversion context threaded through the recursive walk: the original source
 * (for verbatim slicing) and the component registry (for the container/atom
 * decision). Passing one object keeps every converter signature stable.
 */
interface ConvertContext {
  source: string;
  registry: ComponentRegistry;
}

/**
 * Convert mdast phrasing content into an array of inline ProseMirror nodes.
 * `marks` is the set of marks accumulated from enclosing emphasis/strong/etc.
 */
function convertPhrasing(
  nodes: PhrasingContent[],
  marks: readonly Mark[],
  ctx: ConvertContext,
): PMNode[] {
  const out: PMNode[] = [];
  for (const node of nodes) {
    out.push(...convertInline(node, marks, ctx));
  }
  return out;
}

function convertInline(
  node: PhrasingContent,
  marks: readonly Mark[],
  ctx: ConvertContext,
): PMNode[] {
  switch (node.type) {
    case "text":
      if (node.value === "") return [];
      return [schema.text(node.value, marks)];

    case "strong":
      return convertPhrasing(
        node.children,
        [...marks, schema.marks.bold!.create()],
        ctx,
      );

    case "emphasis":
      return convertPhrasing(
        node.children,
        [...marks, schema.marks.italic!.create()],
        ctx,
      );

    case "delete":
      return convertPhrasing(
        node.children,
        [...marks, schema.marks.strike!.create()],
        ctx,
      );

    case "inlineCode":
      return [schema.text(node.value, [...marks, schema.marks.code!.create()])];

    case "link": {
      const linkMark = schema.marks.link!.create({
        href: node.url,
        title: node.title ?? null,
      });
      return convertPhrasing(node.children, [...marks, linkMark], ctx);
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
      // elements never appear inside emphasis/strong runs. Inline JSX text
      // elements are never promoted to containers — Phase 3 promotes only
      // block-level flow elements; inline JSX stays a verbatim atom.
      return [inlineAtom(node as MdastNode, ctx.source)];
  }
}

/** Convert a single mdast block node into ProseMirror block node(s). */
function convertBlock(node: RootContent, ctx: ConvertContext): PMNode[] {
  switch (node.type) {
    case "heading":
      return [
        schema.nodes.heading!.create(
          { level: node.depth },
          Fragment.from(convertPhrasing(node.children, [], ctx)),
        ),
      ];

    case "paragraph":
      return [
        schema.nodes.paragraph!.create(
          null,
          Fragment.from(convertPhrasing(node.children, [], ctx)),
        ),
      ];

    case "blockquote":
      return [
        schema.nodes.blockquote!.create(
          null,
          Fragment.from(convertBlocks(node.children, ctx)),
        ),
      ];

    case "list": {
      const items = node.children.map((item) => convertListItem(item, ctx));
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

    default: {
      // A registered container component is promoted to an editable
      // `mdxContainer` node: open/close tags verbatim, children recursed
      // into. Everything else — atoms, expressions, ESM, unregistered or
      // unrecognized JSX — falls back to a verbatim atom. The container
      // promotion is best-effort: if the element cannot be split safely,
      // `containerNode` returns null and the verbatim atom takes over, so the
      // round-trip is never put at risk.
      if (
        node.type === "mdxJsxFlowElement" &&
        ctx.registry.isContainer((node as MdxJsxFlowElementLike).name)
      ) {
        const container = containerNode(node as MdxJsxFlowElementLike, ctx);
        if (container) return [container];
      }
      return [blockAtom(node as MdastNode, ctx.source)];
    }
  }
}

function convertBlocks(nodes: RootContent[], ctx: ConvertContext): PMNode[] {
  const out: PMNode[] = [];
  for (const node of nodes) out.push(...convertBlock(node, ctx));
  return out;
}

/** Convert an mdast listItem into a ProseMirror listItem node. */
function convertListItem(item: ListItem, ctx: ConvertContext): PMNode {
  const children = convertBlocks(item.children, ctx);
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
 *
 * `registry` decides which JSX components become editable container nodes; it
 * defaults to an empty registry, in which case every JSX construct stays a
 * Phase-2 verbatim atom (M2 behaviour, unchanged).
 */
export function mdastToProseMirror(
  tree: Root,
  source: string,
  registry: ComponentRegistry = ComponentRegistry.empty(),
): PMNode {
  const ctx: ConvertContext = { source, registry };
  let blocks = convertBlocks(tree.children as RootContent[], ctx);
  // ProseMirror's doc requires `block+` — never empty.
  if (blocks.length === 0) {
    blocks = [schema.nodes.paragraph!.create()];
  }
  return schema.nodes.doc!.create(null, Fragment.from(blocks));
}

// Re-export for callers that want to know which mdast types are verbatim.
export { MDX_BLOCK_TYPES, MDX_INLINE_TYPES };
