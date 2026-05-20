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
- **Phase 2** — JSX verbatim atoms. _(not started)_
- **Phase 3** — rich container components.
- **Phase 4** — ship.

In Phase 1, JSX nodes (`mdxJsxFlowElement`, `mdxJsxTextElement`, expressions) are carried through unchanged as a passthrough so the pipeline does not crash on real files. Proper JSX modeling lands in Phase 2.

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
