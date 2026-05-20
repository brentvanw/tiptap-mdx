import type { Root, RootContent, PhrasingContent, Parent } from "mdast";
import { parseMdast, serializeMdast } from "../src/index.js";

/**
 * Test helper — reduce a real `.mdx` file to the standard-Markdown subset.
 *
 * Phase 1 only round-trips standard Markdown, but the real Portfolio files mix
 * in YAML frontmatter and JSX. To test against real content we:
 *   1. strip the leading `---\n...\n---` frontmatter block,
 *   2. parse to mdast and remove every JSX / expression / ESM node,
 *   3. drop paragraphs left empty by inline-JSX removal,
 *   4. serialize once to *canonical* Markdown.
 *
 * The canonical string is what the round-trip test asserts identity against —
 * the strip step is not part of the library, only the test fixture pipeline.
 */

/** mdast node types produced by remark-mdx — all JSX / expression / ESM. */
const MDX_TYPES = new Set<string>([
  "mdxjsEsm",
  "mdxFlowExpression",
  "mdxTextExpression",
  "mdxJsxFlowElement",
  "mdxJsxTextElement",
]);

/** Remove the leading YAML frontmatter block, if present. */
export function stripFrontmatter(mdx: string): string {
  if (!mdx.startsWith("---\n")) return mdx;
  const end = mdx.indexOf("\n---", 4);
  if (end === -1) return mdx;
  // Drop the closing fence line and any blank lines after it.
  return mdx.slice(end + 4).replace(/^\n+/, "");
}

function isParent(node: unknown): node is Parent {
  return (
    !!node &&
    typeof node === "object" &&
    Array.isArray((node as Parent).children)
  );
}

/** Recursively delete MDX/JSX nodes; drop paragraphs left empty afterward. */
function pruneMdx(node: Parent): void {
  node.children = node.children.filter(
    (child) => !MDX_TYPES.has(child.type),
  ) as RootContent[] | PhrasingContent[] as Parent["children"];
  for (const child of node.children) {
    if (isParent(child)) pruneMdx(child);
  }
  // A paragraph whose only content was inline JSX is now empty — remove it.
  node.children = node.children.filter((child) => {
    if (child.type === "paragraph") {
      return isParent(child) && child.children.length > 0;
    }
    return true;
  }) as Parent["children"];
}

/**
 * Strip frontmatter + JSX from a real `.mdx` file and return canonical
 * standard Markdown (the serializer's own stable output).
 */
export function toCanonicalMarkdown(mdx: string): string {
  const tree = parseMdast(stripFrontmatter(mdx)) as Root;
  pruneMdx(tree);
  return serializeMdast(tree);
}
