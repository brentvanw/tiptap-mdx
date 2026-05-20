import { Node } from "@tiptap/core";
import type { Node as MdastNode } from "mdast";

/**
 * Phase 3 — editable container components.
 *
 * A *container component* (`<Section>`, `<Outcomes>`, `<Emphasis>`, `<Punch>`,
 * `<Aside>`, `<NowReading>`, `<NowListening>`, `<NowWatching>`) wraps Markdown
 * children. Phase 2 captured the whole element as one opaque verbatim atom.
 * Phase 3 promotes it: the wrapper renders as a styled block and its children
 * become real, editable ProseMirror content.
 *
 * The hard constraint is that an *unedited* container must still round-trip
 * byte-equal — M2 must not regress. The Phase-2 finding is that re-serializing
 * a parsed JSX subtree reflows it (re-indents children, collapses blank-line
 * padding). The fix here is surgical:
 *
 *  - The container's **open tag** and **close tag** are sliced verbatim from
 *    the source — including any attributes and the blank-line padding the
 *    corpus puts between a tag and its Markdown content. They are stored on
 *    the node and re-emitted unchanged. The JSX open/close syntax is never
 *    re-serialized.
 *  - The container's **children** are converted to real ProseMirror nodes and
 *    serialized as ordinary Markdown — that is what makes them editable.
 *
 * `openTag` is the source from the element's start up to the first child's
 * start; `closeTag` is from the last child's end to the element's end; and
 * `gaps[i]` is the source between child `i`'s end and child `i+1`'s start.
 * Those slices together carry the tags plus *all* the in-element whitespace —
 * including the corpus's single-newline separators between adjacent JSX
 * children, which differ from the serializer's default blank-line spacing.
 * Reassembling open-tag + child + gap + child + … + close-tag therefore
 * reproduces the original bytes exactly for an unedited container. An edited
 * container (a child added or removed) has no stored gap for the new boundary
 * and falls back to a canonical blank-line separator.
 */

/** mdast's mdxJsxAttribute shape (a subset — only what we read). */
interface MdxJsxAttribute {
  type: "mdxJsxAttribute";
  name: string;
  value: string | { type: string; value?: string } | null;
}
/** mdast's mdxJsxExpressionAttribute shape (a spread `{...x}`). */
interface MdxJsxExpressionAttribute {
  type: "mdxJsxExpressionAttribute";
  value: string;
}
type AnyMdxAttribute = MdxJsxAttribute | MdxJsxExpressionAttribute;

/** mdast's mdxJsxFlowElement shape (a subset — only what we read). */
export interface MdxJsxFlowElementLike extends MdastNode {
  type: "mdxJsxFlowElement";
  name: string | null;
  attributes: AnyMdxAttribute[];
  children: MdastNode[];
}

/**
 * The minimal shape `splitContainerTags` needs — shared by block
 * (`mdxJsxFlowElement`) and inline (`mdxJsxTextElement`) JSX elements. Tag
 * splitting reads only `position` and `children`, so it is element-kind
 * agnostic; the inline-container path (Phase 4) reuses it.
 */
export interface MdxJsxElementLike extends MdastNode {
  name: string | null;
  children: MdastNode[];
}

/**
 * A plain, serializable representation of one JSX attribute. The verbatim
 * open-tag slice is what gets re-emitted, so attribute fidelity never depends
 * on this — but consumers (a future side panel, validation) want structured
 * access, and Phase 2 discarded it entirely. `expression: true` marks a
 * JavaScript-expression value (`count={3}`) or a spread (`{...rest}`), whose
 * `value` is the raw expression source, not a string literal.
 */
export interface ContainerAttribute {
  /** Attribute name, or `null` for a spread attribute (`{...rest}`). */
  name: string | null;
  /** String value, raw expression source, or `null` for a boolean attribute. */
  value: string | null;
  /** True when `value` is a JS expression (`{...}`) rather than a literal. */
  expression: boolean;
}

/**
 * Extract structured attributes from a parsed `mdxJsxFlowElement`.
 *
 * `mdast-util-mdx` already parses JSX attributes into an `attributes[]` array;
 * the Phase-2 verbatim path threw them away. Containers carry them through so
 * the open tag can be reasoned about — though re-emission still uses the
 * verbatim open-tag slice, never a rebuild from this list.
 */
export function extractAttributes(
  node: MdxJsxFlowElementLike,
): ContainerAttribute[] {
  const out: ContainerAttribute[] = [];
  for (const attr of node.attributes ?? []) {
    if (attr.type === "mdxJsxExpressionAttribute") {
      out.push({ name: null, value: attr.value ?? "", expression: true });
      continue;
    }
    // mdxJsxAttribute
    const value = attr.value;
    if (value == null) {
      out.push({ name: attr.name, value: null, expression: false });
    } else if (typeof value === "string") {
      out.push({ name: attr.name, value, expression: false });
    } else {
      // mdxJsxAttributeValueExpression — a JS-expression attribute value.
      out.push({
        name: attr.name,
        value: value.value ?? "",
        expression: true,
      });
    }
  }
  return out;
}

/** The verbatim-whitespace breakdown of a container's source. */
export interface ContainerTags {
  /** Source from the element start to the first child's start. */
  openTag: string;
  /** Source from the last child's end to the element end. */
  closeTag: string;
  /**
   * Inter-child separators: `gaps[i]` is the source between child `i`'s end
   * and child `i+1`'s start. Length is `childCount - 1`.
   */
  gaps: string[];
}

/**
 * Split a container element's source into `openTag`, `closeTag` and the
 * per-boundary `gaps` between its children.
 *
 * Returns `null` when the breakdown cannot be computed reliably — no position
 * data, a childless container, or a child whose span sits outside the element
 * — in which case the caller falls back to the Phase-2 verbatim atom.
 */
export function splitContainerTags(
  node: MdxJsxElementLike,
  source: string,
): ContainerTags | null {
  const pos = node.position;
  if (
    !pos ||
    typeof pos.start.offset !== "number" ||
    typeof pos.end.offset !== "number"
  ) {
    return null;
  }
  const children = node.children ?? [];
  if (children.length === 0) return null;

  // Every child must carry usable start/end offsets within the element span.
  const offsets: { start: number; end: number }[] = [];
  for (const child of children) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    if (typeof start !== "number" || typeof end !== "number") return null;
    if (start < pos.start.offset || end > pos.end.offset) return null;
    offsets.push({ start, end });
  }

  const gaps: string[] = [];
  for (let i = 0; i < offsets.length - 1; i++) {
    gaps.push(source.slice(offsets[i]!.end, offsets[i + 1]!.start));
  }
  return {
    openTag: source.slice(pos.start.offset, offsets[0]!.start),
    closeTag: source.slice(offsets[offsets.length - 1]!.end, pos.end.offset),
    gaps,
  };
}

/**
 * The Tiptap node for an editable container component.
 *
 * `content: "block+"` — the children are real block content (paragraphs,
 * headings, lists, even nested verbatim atoms or nested containers), all
 * editable in the canvas.
 *
 * Attributes:
 *  - `componentName` — the JSX tag (`Section`, `Outcomes`, …); drives the
 *    styled wrapper and the re-emitted tags.
 *  - `openTag` / `closeTag` — verbatim source slices (tags + padding).
 *  - `gaps` — verbatim inter-child separators; `gaps[i]` joins child `i` to
 *    child `i+1`. Preserves the corpus's significant in-container whitespace.
 *  - `attributes` — structured attribute list, for consumers; not used for
 *    re-emission (the verbatim `openTag` already carries them).
 */
export const MdxContainer = Node.create({
  name: "mdxContainer",
  group: "block",
  content: "block+",
  defining: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      componentName: { default: "" },
      openTag: { default: "" },
      closeTag: { default: "" },
      // Verbatim inter-child separators; see splitContainerTags.
      gaps: { default: [] as string[] },
      // ProseMirror attrs must be plain JSON — ContainerAttribute[] is.
      attributes: { default: [] as ContainerAttribute[] },
    };
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-mdx-container": String(node.attrs.componentName),
        class: "tiptap-mdx-container",
      },
      0, // children render here — editable
    ];
  },

  parseHTML() {
    return [{ tag: "div[data-mdx-container]" }];
  },
});
