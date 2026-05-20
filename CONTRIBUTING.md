# Contributing to tiptap-mdx

Thanks for your interest in `tiptap-mdx`. This document covers how to run the
project locally, the one invariant every change must preserve, and the
architecture you will be working inside.

## Setup

```sh
git clone https://github.com/goodsventures/tiptap-mdx.git
cd tiptap-mdx
npm install
```

Requires Node 18 or newer.

## Running the project

| Command | What it does |
|---------|--------------|
| `npm test` | Run the full test suite once (158 tests). |
| `npm run test:watch` | Run the suite in watch mode while developing. |
| `npm run typecheck` | Type-check `src/` **and** `test/` with `tsc` (no emit). |
| `npm run build` | Build `dist/` — ESM + `.d.ts` — with tsup. |

`npm test` and `npm run typecheck` are what CI runs on every push and pull
request. `prepublishOnly` runs typecheck → build → test before any publish, so
a broken build can never reach npm.

## The invariant you must preserve

**Round-trip identity is non-negotiable.**

> Parsing a document and immediately re-serializing it produces byte-identical
> output: `roundTrip(input) === input` for any canonical input.

This is the entire reason the library exists — both editors it replaces failed
exactly here. Every change must keep it true. Concretely:

1. **Never re-serialize JSX.** MDX JSX, expressions, and ESM are captured as
   *verbatim source slices* and emitted unchanged. `mdast-util-mdx`'s serializer
   reflows JSX children — it must never run. If you add a new MDX construct,
   route it through the verbatim path (`verbatim.ts`), not a new serializer
   handler.
2. **The safety net is absolute.** Any JSX the registry does not recognize —
   and any container whose children would not re-serialize canonically — falls
   back to a verbatim atom. A change must never let unrecognized content reach a
   lossy code path.
3. **Add a round-trip test for every construct.** A new feature is not done
   until a test asserts `roundTrip(x) === x` for it. The validation corpus in
   `test/portfolio.test.ts` is the real-world backstop; `test/markdown.test.ts`,
   `test/jsx.test.ts`, and `test/container.test.ts` cover the units.
4. **Normalization changes are breaking.** The serializer's canonical spellings
   (`SERIALIZE_OPTIONS` in `src/markdown.ts`) are tested in
   `test/normalization.test.ts`. Changing one reformats every consumer's
   content — treat it as a major-version change and document it.

If you are unsure whether a change is safe, run `npm test`. A red round-trip
test means the invariant broke.

## Architecture

The library bridges MDX and Tiptap/ProseMirror in both directions. It was built
in phases; each phase's code is self-contained and documented in its source
file.

```
MDX string
   │  unified + remark-parse + remark-gfm + remark-mdx   (src/markdown.ts)
   ▼
mdast  (JSX nodes + source positions)
   │  mdast → ProseMirror doc                            (src/mdast-to-pm.ts)
   ▼
Tiptap document  ◄── user edits ──►  Tiptap document
   │  ProseMirror doc → mdast                            (src/pm-to-mdast.ts)
   ▼
mdast
   │  mdast-util-to-markdown (tuned for stable output)   (src/markdown.ts)
   ▼
MDX string  ── byte-equal to input when unedited ──
```

| File | Responsibility | Phase |
|------|----------------|-------|
| `src/markdown.ts` | MDX ↔ mdast at the pipeline edges; `SERIALIZE_OPTIONS`. | 1 |
| `src/schema.ts` | The ProseMirror schema, derived from Tiptap extensions. | 1–3 |
| `src/mdast-to-pm.ts` | mdast → ProseMirror document conversion. | 1–3 |
| `src/pm-to-mdast.ts` | ProseMirror document → mdast conversion. | 1–3 |
| `src/verbatim.ts` | JSX verbatim-atom node extensions + helpers. | 2 |
| `src/container.ts` | Editable container node + tag-slicing helpers. | 3 |
| `src/registry.ts` | The `ComponentRegistry` configuration surface. | 3 |
| `src/index.ts` | Public API surface (`mdxToDoc`, `docToMdx`, `roundTrip`, …). | all |

- **Phase 1 — lossless core.** Standard Markdown (headings, paragraphs, lists,
  marks, links, images, blockquote, code, thematic breaks) round-trips
  byte-equal.
- **Phase 2 — verbatim atoms.** Every MDX JSX / expression / ESM node is sliced
  from source and stored verbatim on an atom node — the universal safety net.
- **Phase 3 — editable containers.** Registered container components are
  promoted to editable nodes: styled wrapper, verbatim open/close tags,
  editable Markdown children.

## Pull requests

- Keep `npm test` and `npm run typecheck` green.
- Add tests for new behavior; a round-trip test is mandatory for new constructs.
- Match the existing code style — the source is heavily commented because the
  *why* (especially around the round-trip invariant) is load-bearing.
- One logical change per PR.

## License

By contributing, you agree your contributions are licensed under the
[MIT License](./LICENSE).
