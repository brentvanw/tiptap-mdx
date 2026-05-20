import type { Node as PMNode, Mark } from "@tiptap/pm/model";
import type {
  Root,
  RootContent,
  PhrasingContent,
  Heading,
  Paragraph,
  Blockquote,
  List,
  ListItem,
  Code,
  ThematicBreak,
  Image,
  Break,
} from "mdast";

/**
 * ProseMirror document -> mdast.
 *
 * The exact inverse of `mdast-to-pm.ts`. Walks a ProseMirror document and
 * rebuilds the mdast tree, so that
 *
 *   serializeMdast(proseMirrorToMdast(mdastToProseMirror(parseMdast(x))))
 *
 * is byte-equal to a canonical serialization of `x`.
 *
 * Verbatim atom nodes emit a custom mdast node (`mdxVerbatimBlock` /
 * `mdxVerbatimInline`) carrying the exact original source string. A custom
 * serializer handler (see SERIALIZE_OPTIONS in markdown.ts) writes that string
 * back unchanged — the parsed JSX subtree is never re-serialized.
 *
 * Phase 3 adds the editable container node. An `mdxContainer` PM node emits a
 * custom `mdxContainerBlock` mdast node carrying the verbatim open/close tag
 * slices plus *real* mdast children. Its serializer handler writes
 * `openTag + serialized-children + closeTag`: the children round-trip as
 * ordinary Markdown while the tags (attributes, blank-line padding) are
 * re-emitted byte-for-byte.
 */

/**
 * Custom mdast nodes for JSX verbatim atoms. These are not real mdast /
 * `mdast-util-mdx` types — they exist only to carry a pre-sliced source string
 * to the matching serializer handler.
 */
interface VerbatimBlockNode {
  type: "mdxVerbatimBlock";
  value: string;
}
interface VerbatimInlineNode {
  type: "mdxVerbatimInline";
  value: string;
}

/**
 * Custom mdast node for an editable container component. Unlike the verbatim
 * nodes it has *real* mdast `children`; only the open/close tags are carried
 * verbatim. The matching serializer handler (see markdown.ts) serializes the
 * children as Markdown and wraps them in the two tag slices.
 */
interface ContainerMdastNode {
  type: "mdxContainerBlock";
  openTag: string;
  closeTag: string;
  /** Verbatim inter-child separators; see container.ts splitContainerTags. */
  gaps: string[];
  children: RootContent[];
}

/**
 * Custom mdast node for an editable *inline* container component (Phase 4) —
 * the inline twin of `ContainerMdastNode`. Carries the verbatim open/close
 * tags plus real phrasing children; the serializer handler writes
 * `openTag + serialized-children + closeTag`.
 */
interface ContainerInlineNode {
  type: "mdxContainerInline";
  openTag: string;
  closeTag: string;
  children: PhrasingContent[];
}

/**
 * ProseMirror represents inline marks as a *set per text node*; mdast nests
 * marks as a tree (`emphasis > strong > text`). This rebuilds the nesting.
 *
 * The nesting cannot use a fixed global mark order: in `*a **b** c*` the
 * emphasis is the outer mark, while in `**a *b* c**` the strong is. The
 * correct outer mark at any position is whichever mark spans the *longest*
 * contiguous run of leaves starting there. Ties (two marks covering the same
 * run) are broken by `MARK_TIE_ORDER` purely so output is deterministic.
 */
// `mdxInline` (a JSX wrapper) is listed first so that, on a tie, it nests
// outside the Markdown marks — `<Emphasis>**x**</Emphasis>` rather than
// `**<Emphasis>x</Emphasis>**`. Either nesting is round-trip-guarded at parse
// time, so this only decides which ambiguous form promotes vs. stays an atom.
const MARK_TIE_ORDER = ["mdxInline", "link", "bold", "italic", "strike"] as const;

function tieRank(name: string): number {
  const i = MARK_TIE_ORDER.indexOf(name as (typeof MARK_TIE_ORDER)[number]);
  return i === -1 ? MARK_TIE_ORDER.length : i;
}

interface InlineLeaf {
  /** The mdast leaf node (text / inlineCode / image / break / verbatim). */
  node: PhrasingContent;
  /** Marks still to be applied around this leaf (unordered set). */
  marks: Mark[];
}

/** Build a single mdast phrasing node for a PM inline node (no marks). */
function leafFromPMInline(node: PMNode): PhrasingContent {
  if (node.isText) {
    // `code` is a leaf mark in mdast (inlineCode), handled by the wrapper.
    const isInlineCode = node.marks.some((m) => m.type.name === "code");
    if (isInlineCode) {
      return { type: "inlineCode", value: node.text ?? "" };
    }
    return { type: "text", value: node.text ?? "" };
  }
  switch (node.type.name) {
    case "image": {
      const img: Image = {
        type: "image",
        url: String(node.attrs.src ?? ""),
        alt: node.attrs.alt != null ? String(node.attrs.alt) : null,
      };
      if (node.attrs.title != null) img.title = String(node.attrs.title);
      return img;
    }
    case "hardBreak": {
      const br: Break = { type: "break" };
      return br;
    }
    case "mdxInlineAtom": {
      const verbatim: VerbatimInlineNode = {
        type: "mdxVerbatimInline",
        value: String(node.attrs.value ?? ""),
      };
      // The custom node is not in mdast's PhrasingContent union; it is only
      // ever consumed by the matching serializer handler.
      return verbatim as unknown as PhrasingContent;
    }
    default:
      throw new Error(
        `tiptap-mdx: unexpected inline node "${node.type.name}"`,
      );
  }
}

/** How far a given mark extends, contiguously, from leaf index `start`. */
function runLength(leaves: InlineLeaf[], start: number, mark: Mark): number {
  let n = 0;
  for (let i = start; i < leaves.length; i++) {
    if (leaves[i]!.marks.some((m) => m.eq(mark))) n++;
    else break;
  }
  return n;
}

/**
 * Convert a flat list of inline leaves into nested mdast phrasing content.
 *
 * At each position, pick the mark with the longest contiguous run; wrap that
 * run, recurse inside it with the mark removed, then continue past it.
 */
function nestInline(leaves: InlineLeaf[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let i = 0;
  while (i < leaves.length) {
    const leaf = leaves[i]!;
    if (leaf.marks.length === 0) {
      out.push(leaf.node);
      i++;
      continue;
    }
    // Choose the outer mark: longest run wins; ties broken deterministically.
    let best: Mark | null = null;
    let bestLen = 0;
    for (const mark of leaf.marks) {
      const len = runLength(leaves, i, mark);
      if (
        len > bestLen ||
        (len === bestLen &&
          best !== null &&
          tieRank(mark.type.name) < tieRank(best.type.name))
      ) {
        best = mark;
        bestLen = len;
      }
    }
    const outer = best!;
    const run = leaves
      .slice(i, i + bestLen)
      .map((l) => ({
        node: l.node,
        marks: l.marks.filter((m) => !m.eq(outer)),
      }));
    out.push(wrapMark(outer, nestInline(run)));
    i += bestLen;
  }
  return out;
}

/** Wrap mdast phrasing content in the mdast node for a given PM mark. */
function wrapMark(mark: Mark, children: PhrasingContent[]): PhrasingContent {
  switch (mark.type.name) {
    case "bold":
      return { type: "strong", children };
    case "italic":
      return { type: "emphasis", children };
    case "strike":
      return { type: "delete", children };
    case "link": {
      const href = String(mark.attrs.href ?? "");
      const title =
        mark.attrs.title != null ? String(mark.attrs.title) : null;
      return { type: "link", url: href, title, children };
    }
    case "mdxInline": {
      // Editable inline container (Phase 4): re-emit the verbatim open/close
      // tags around the real, serialized children.
      const inline: ContainerInlineNode = {
        type: "mdxContainerInline",
        openTag: String(mark.attrs.openTag ?? ""),
        closeTag: String(mark.attrs.closeTag ?? ""),
        children,
      };
      return inline as unknown as PhrasingContent;
    }
    default:
      throw new Error(`tiptap-mdx: unexpected mark "${mark.type.name}"`);
  }
}

/** Convert a PM node's inline children into mdast phrasing content. */
function convertInlineContent(parent: PMNode): PhrasingContent[] {
  const leaves: InlineLeaf[] = [];
  parent.forEach((child) => {
    // The `code` mark is consumed by leafFromPMInline (inlineCode), so it
    // must not appear in the nesting marks.
    const nestingMarks = child.marks.filter((m) => m.type.name !== "code");
    leaves.push({ node: leafFromPMInline(child), marks: nestingMarks });
  });
  return nestInline(leaves);
}

/** Convert a single ProseMirror block node into mdast block node(s). */
function convertBlock(node: PMNode): RootContent[] {
  switch (node.type.name) {
    case "heading": {
      const heading: Heading = {
        type: "heading",
        depth: (node.attrs.level as Heading["depth"]) ?? 1,
        children: convertInlineContent(node),
      };
      return [heading];
    }

    case "paragraph": {
      const para: Paragraph = {
        type: "paragraph",
        children: convertInlineContent(node),
      };
      return [para];
    }

    case "blockquote": {
      const quote: Blockquote = {
        type: "blockquote",
        children: convertBlocks(node) as Blockquote["children"],
      };
      return [quote];
    }

    case "bulletList": {
      const list: List = {
        type: "list",
        ordered: false,
        spread: false,
        children: convertListItems(node),
      };
      return [list];
    }

    case "orderedList": {
      const start = Number(node.attrs.start ?? 1);
      const list: List = {
        type: "list",
        ordered: true,
        start,
        spread: false,
        children: convertListItems(node),
      };
      return [list];
    }

    case "codeBlock": {
      const code: Code = {
        type: "code",
        lang: node.attrs.language ? String(node.attrs.language) : null,
        value: node.textContent,
      };
      return [code];
    }

    case "horizontalRule": {
      const hr: ThematicBreak = { type: "thematicBreak" };
      return [hr];
    }

    case "mdxBlockAtom": {
      const verbatim: VerbatimBlockNode = {
        type: "mdxVerbatimBlock",
        value: String(node.attrs.value ?? ""),
      };
      // Not a real mdast RootContent type; only the serializer handler reads it.
      return [verbatim as unknown as RootContent];
    }

    case "mdxContainer": {
      // Children are real, editable block content — convert them recursively
      // so an edit to a child re-serializes as ordinary Markdown. The open and
      // close tags are re-emitted verbatim from the stored slices.
      const rawGaps = node.attrs.gaps;
      const gaps = Array.isArray(rawGaps) ? rawGaps.map(String) : [];
      const container: ContainerMdastNode = {
        type: "mdxContainerBlock",
        openTag: String(node.attrs.openTag ?? ""),
        closeTag: String(node.attrs.closeTag ?? ""),
        gaps,
        children: convertBlocks(node),
      };
      return [container as unknown as RootContent];
    }

    default:
      throw new Error(
        `tiptap-mdx: unexpected block node "${node.type.name}"`,
      );
  }
}

function convertBlocks(parent: PMNode): RootContent[] {
  const out: RootContent[] = [];
  parent.forEach((child) => {
    out.push(...convertBlock(child));
  });
  return out;
}

/** Convert a list PM node's children into mdast listItem nodes. */
function convertListItems(listNode: PMNode): ListItem[] {
  const items: ListItem[] = [];
  listNode.forEach((itemNode) => {
    const item: ListItem = {
      type: "listItem",
      spread: false,
      children: convertBlocks(itemNode) as ListItem["children"],
    };
    items.push(item);
  });
  return items;
}

/** Convert a ProseMirror document node into an mdast Root. */
export function proseMirrorToMdast(doc: PMNode): Root {
  return {
    type: "root",
    children: convertBlocks(doc) as RootContent[],
  };
}
