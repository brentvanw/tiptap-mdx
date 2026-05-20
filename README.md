# tiptap-mdx

A lossless bridge between **MDX** (Markdown + JSX components) and **Tiptap** / ProseMirror.

[![CI](https://github.com/brentvanw/tiptap-mdx/actions/workflows/ci.yml/badge.svg)](https://github.com/brentvanw/tiptap-mdx/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## Why this exists

No mature editor round-trips MDX losslessly:

- **MDXEditor** (Lexical) — parse → re-export is not an identity function. Files go dirty on mount; saves overwrite originals with normalized output.
- **tiptap-markdown** — uses markdown-it, which has no concept of JSX. It HTML-escapes every custom component (`<Section>` becomes `&lt;Section&gt;`).

Both fail for the same reason: the content is **MDX** — Markdown *plus* JSX components — and no editor in the open-source ecosystem round-trips MDX without corrupting it. `tiptap-mdx` fills that gap. It parses MDX into a ProseMirror document model and serializes it back, with one non-negotiable guarantee.

## The invariant: round-trip identity

> Parsing a document and immediately re-serializing it produces **byte-identical** output.

This is the property both prior tools failed. It is enforced by an automated test suite — 158 tests, including every `.mdx` file in a real-world validation corpus.

```ts
import { roundTrip } from "tiptap-mdx";

roundTrip(input) === input; // holds for every supported construct
```

## Install

```sh
npm install tiptap-mdx
```

`tiptap-mdx` is ESM-only and ships `.d.ts` types. The `remark` / `unified` parsing stack is bundled as a regular dependency. The Tiptap packages it builds on — `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link` — are **peer dependencies**: install them in your app so the editor and `tiptap-mdx` share a single Tiptap instance (two copies of `@tiptap/core` break extension interop). To mount the editor in React you also need `@tiptap/react`.

## Usage

### The pure pipeline (no DOM)

`mdxToDoc` and `docToMdx` are the two halves of the bridge. They run in Node with no browser — useful for tests, build steps, and server-side processing.

```ts
import { mdxToDoc, docToMdx, roundTrip, ComponentRegistry } from "tiptap-mdx";

// Which JSX components are editable containers vs. opaque atoms.
const registry = ComponentRegistry.from([
  { name: "Section", kind: "container" }, // editable Markdown children
  { name: "Outcomes", kind: "container" },
  { name: "Figure", kind: "atom" },       // verbatim, form-edited
]);

const doc = mdxToDoc(mdxSource, registry); // MDX  -> ProseMirror doc
const mdx = docToMdx(doc);                 // ProseMirror doc -> MDX

// roundTrip(x) === docToMdx(mdxToDoc(x)) — the identity-function gate.
roundTrip(mdxSource, registry) === mdxSource; // true for unedited canonical MDX
```

`ComponentRegistry.from([...])` builds a registry; `register()` returns a new one (immutable, composable). A component absent from the registry — anything unknown — falls back to a verbatim atom, so the safety net always holds. `portfolioRegistry` is exported as a ready-made config for the validation corpus.

### Wiring into a Tiptap editor (React)

`tiptap-mdx` exports `schema` (a ProseMirror schema) and the node extensions behind it. Build a Tiptap editor from the same extension list, hydrate it from MDX with `mdxToDoc`, and serialize back with `docToMdx`.

```tsx
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import {
  MdxBlockAtom,
  MdxInlineAtom,
  MdxContainer,
  mdxToDoc,
  docToMdx,
  portfolioRegistry,
} from "tiptap-mdx";

const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
  Image.configure({ inline: true }),
  Link.extend({
    addAttributes() {
      return { ...(this.parent?.() ?? {}), title: { default: null } };
    },
  }),
  // The tiptap-mdx node extensions: verbatim atoms + editable containers.
  MdxBlockAtom,
  MdxInlineAtom,
  MdxContainer,
];

export function MdxEditor({
  mdx,
  onChange,
}: {
  mdx: string;
  onChange: (mdx: string) => void;
}) {
  const editor = useEditor({
    extensions,
    // mdxToDoc returns a ProseMirror node; pass its JSON as initial content.
    content: mdxToDoc(mdx, portfolioRegistry).toJSON(),
    onUpdate: ({ editor }) => {
      // editor.state.doc is a ProseMirror node — serialize it straight back.
      onChange(docToMdx(editor.state.doc));
    },
  });

  return <EditorContent editor={editor} />;
}
```

The extension list above is exactly the one `tiptap-mdx`'s own `schema` is derived from — keeping the editor and the converters in lockstep is the consumer's responsibility, so re-declare it once and share it. The three `Mdx*` extensions are the only `tiptap-mdx`-specific additions; everything else is stock Tiptap.

## JSX verbatim atoms — the approach

MDX's defining feature — JSX components and embedded expressions — cannot be round-tripped by re-serializing a parsed subtree: `mdast-util-mdx`'s serializer re-indents JSX flow-element children and collapses blank lines inside them. Re-emitting a parsed `<Section>` mangles it.

So `tiptap-mdx` **never re-serializes JSX.** `remark-mdx` attaches precise character offsets to every node; for each MDX construct the pipeline slices the **exact original source substring** and stores it verbatim on a ProseMirror atom node, emitting it unchanged on serialize. This covers every MDX node type — block JSX (`mdxJsxFlowElement`), inline JSX (`mdxJsxTextElement`), expressions (`mdxFlowExpression`, `mdxTextExpression`), and ESM (`mdxjsEsm`).

This is also the universal safety net: any JSX, recognized or not, becomes a verbatim atom and survives a round-trip untouched. **The editor can never corrupt content it captured verbatim.** Each atom renders a minimal labeled placeholder (the component or expression name).

## Editable container components

A **container component** wraps Markdown children (`<Section>`, `<Outcomes>`, `<Emphasis>`, `<Punch>`, `<Aside>`, `<NowReading>`, …). Registered containers are promoted from opaque atoms to **editable nodes**: the wrapper renders as a styled block, and its children become real, editable Markdown in the canvas.

The open and close tags — attributes and the blank-line padding the content uses — are still sliced **verbatim** from the source and re-emitted unchanged; only the children re-serialize. So an unedited container round-trips byte-for-byte, while an edited one re-serializes as well-formed MDX. If a container's Markdown children are non-canonical (so re-serializing them would change a byte), it gracefully stays a verbatim atom — the safety net is absolute.

### The component registry

Which components are containers, which are atoms, is **configuration** — never a code change:

```ts
import { ComponentRegistry } from "tiptap-mdx";

const registry = ComponentRegistry.from([
  { name: "Section", kind: "container" },
  { name: "Figure", kind: "atom" },
]);
```

`register()` returns a new registry (immutable, composable). A component absent from the registry falls back to a verbatim atom: the safety net always holds.

## Round-trip identity is achievable

`roundTrip` is the identity function on **canonical** Markdown — Markdown already in the single spelling the serializer emits. The serializer is tuned (`SERIALIZE_OPTIONS` in `src/markdown.ts`) so the canonical form matches real-world content conventions:

| Construct | Canonical form |
|-----------|----------------|
| Unordered list bullet | `-` (not `*` / `+`) |
| Thematic break | `---` (not `***` / `___`) |
| Emphasis | `*italic*` (not `_italic_`) |
| Strong | `**bold**` (not `__bold__`) |
| Headings | ATX `#` (not setext underlines) |

Non-canonical input is normalized once on the first pass, then stable forever after. With the serializer tuned as above, every standard-Markdown file in the validation corpus was already canonical — no one-time reformat was required.

## Out of scope for v1

- Inline editing of JavaScript-expression attributes (`items={[...]}`) — verbatim atom + side-panel form only.
- MDX `import` / `export` statements and expression blocks (`{...}`) — preserved verbatim, not modeled.
- Frontmatter — not part of the MDX body; the consuming app models it separately.

## Architecture

```
MDX string
   │  unified + remark-parse + remark-gfm + remark-mdx
   ▼
mdast  (with mdxJsxFlowElement / mdxJsxTextElement nodes + source positions)
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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The one rule: the round-trip-identity invariant is non-negotiable — every change must keep `roundTrip(input) === input` for canonical input.

## License

MIT © Goods
