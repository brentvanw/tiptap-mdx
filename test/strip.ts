/**
 * Test helper — prepare a real `.mdx` file for the round-trip assertion.
 *
 * Phase 2 round-trips JSX byte-exact (verbatim atoms), so JSX is NO LONGER
 * stripped — only YAML frontmatter is.
 *
 * Frontmatter is stripped (not modeled) because `remark-frontmatter` is not in
 * the parser stack — frontmatter is a Studio concern, parsed separately, and
 * out of scope for the MDX body editor.
 *
 * The Portfolio corpus is authored in the serializer's canonical conventions
 * (see SERIALIZE_OPTIONS), so every frontmatter-stripped file is already a
 * fixed point of the pipeline — the round-trip test asserts exactly that,
 * `roundTrip(body) === body`, with JSX intact.
 */

/** Remove the leading YAML frontmatter block, if present. */
export function stripFrontmatter(mdx: string): string {
  if (!mdx.startsWith("---\n")) return mdx;
  const end = mdx.indexOf("\n---", 4);
  if (end === -1) return mdx;
  // Drop the closing fence line and any blank lines after it.
  return mdx.slice(end + 4).replace(/^\n+/, "");
}
