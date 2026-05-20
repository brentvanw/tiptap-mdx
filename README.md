# tiptap-mdx

A lossless bridge between **MDX** (Markdown + JSX components) and **Tiptap** / ProseMirror.

## Why this exists

No mature editor round-trips MDX losslessly:

- **MDXEditor** (Lexical) — parse → re-export is not an identity function. Files go dirty on mount; saves overwrite originals with normalized output.
- **tiptap-markdown** — uses markdown-it, which has no concept of JSX. It HTML-escapes every custom component (`<Section>` becomes `&lt;Section&gt;`).

`tiptap-mdx` fills that gap. It parses MDX into a ProseMirror document model and serializes it back, with one non-negotiable guarantee.

## The invariant: round-trip identity

> Parsing a document and immediately re-serializing it produces **byte-identical** output.

This is the property both prior tools failed. It is enforced by an automated test harness:

```ts
import { roundTrip } from "tiptap-mdx";

roundTrip(input) === input; // must hold for every supported construct
```

## Status

Early development.

- **Phase 0** — repo, tooling, parser stack. ✅
- **Phase 1** — lossless core round-trip for standard Markdown (headings, paragraphs, lists, marks, links, images, blockquote, code, thematic breaks). ✅
- **Phase 2** — JSX verbatim atoms. ✅
- **Phase 3** — rich container components + component registry. ✅
- **Phase 4** — ship.

## JSX verbatim atoms

MDX's defining feature — JSX components and embedded expressions — cannot be round-tripped by re-serializing a parsed subtree: `mdast-util-mdx`'s serializer re-indents JSX flow-element children and collapses blank lines inside them.

So `tiptap-mdx` never re-serializes JSX. `remark-mdx` attaches precise character offsets to every node; for each MDX construct the pipeline slices the **exact original source substring** and stores it verbatim on a ProseMirror atom node, emitting it unchanged on serialize. This covers every MDX node type — block JSX (`mdxJsxFlowElement`), inline JSX (`mdxJsxTextElement`), expressions (`mdxFlowExpression`, `mdxTextExpression`), and ESM (`mdxjsEsm`).

By default the walk does **not** recurse into a JSX element's children — a `<Section>` containing markdown and nested JSX is captured whole, as one opaque atom. Each atom renders a minimal labeled placeholder (the component or expression name).

This is also the universal safety net: any JSX, recognized or not, becomes a verbatim atom and survives a round-trip untouched. The editor can never corrupt content it captured verbatim.

## Editable container components

A **container component** wraps Markdown children (`<Section>`, `<Outcomes>`, `<Emphasis>`, `<Punch>`, `<Aside>`, `<NowReading>`, …). Phase 3 promotes registered containers from opaque atoms to **editable nodes**: the wrapper renders as a styled block, and its children become real, editable Markdown in the canvas.

The open and close tags — attributes and the blank-line padding the content uses — are still sliced **verbatim** from the source and re-emitted unchanged; only the children re-serialize. So an unedited container round-trips byte-for-byte, while an edited one re-serializes as well-formed MDX. If a container's Markdown children are non-canonical (so re-serializing them would change a byte), it gracefully stays a verbatim atom — the safety net is absolute.

### The component registry

Which components are containers, which are atoms, is **configuration** — never a code change:

```ts
import { ComponentRegistry, mdxToDoc, docToMdx } from "tiptap-mdx";

const registry = ComponentRegistry.from([
  { name: "Section", kind: "container" }, // editable children
  { name: "Outcomes", kind: "container" },
  { name: "Figure", kind: "atom" },       // verbatim, form-edited
]);

const doc = mdxToDoc(mdxSource, registry);
const mdx = docToMdx(doc);
```

`register()` returns a new registry (immutable, composable). A component absent from the registry — anything unknown — falls back to a verbatim atom: the safety net always holds. `portfolioRegistry` is exported as a ready-made config for the validation corpus.

## M2 — JSX round-trips byte-exact

Every file in the validation corpus round-trips byte-equal with **JSX intact** (frontmatter stripped — it is not part of the MDX body and is modeled separately). The corpus includes container components (`<Section>`, `<Outcomes>`, `<NowReading>`), attribute-heavy components (`<Figure>`), and a JavaScript-expression attribute (`<ImageGrid items={[...]}>`) — all preserved exactly. See `test/portfolio.test.ts` and `test/jsx.test.ts`.

## M1 — round-trip identity is achievable

`roundTrip` is the identity function on **canonical** Markdown — Markdown already in the single spelling the serializer emits. The serializer is tuned (`SERIALIZE_OPTIONS` in `src/markdown.ts`) so the canonical form matches real-world content conventions:

| Construct | Canonical form |
|-----------|----------------|
| Unordered list bullet | `-` (not `*` / `+`) |
| Thematic break | `---` (not `***` / `___`) |
| Emphasis | `*italic*` (not `_italic_`) |
| Strong | `**bold**` (not `__bold__`) |
| Headings | ATX `#` (not setext underlines) |

Non-canonical input is normalized once on the first pass, then stable forever after. With the serializer tuned as above, **every standard-Markdown file in the validation corpus was already canonical** — no one-time reformat was required. See `test/normalization.test.ts` for the exact, tested normalization rules.

## Architecture

```
MDX string
   │  unified + remark-parse + remark-mdx
   ▼
mdast
   │  mdast → ProseMirror doc
   ▼
Tiptap document  ◄── user edits ──►  Tiptap document
   │  ProseMirror doc → mdast
   ▼
mdast
   │  mdast-util-to-markdown (configured for stable output)
   ▼
MDX string  ── byte-equal to input when unedited ──
```

The ProseMirror schema is derived from Tiptap extensions via `@tiptap/core`'s `getSchema()`. The pipeline runs in Node with **no browser/DOM**.

## License

MIT © Goods
