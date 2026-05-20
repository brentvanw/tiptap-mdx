import { describe, it, expect } from "vitest";
import { Fragment } from "@tiptap/pm/model";
import {
  roundTrip,
  mdxToDoc,
  docToMdx,
  schema,
  ComponentRegistry,
  portfolioRegistry,
} from "../src/index.js";
import type { PMNode } from "../src/index.js";

/**
 * Phase 3 — editable container components.
 *
 * A registered `container` component is promoted from an opaque verbatim atom
 * to an editable `mdxContainer` node: the open/close tags are preserved
 * verbatim, the children become real, editable ProseMirror block content.
 *
 * Three properties under test:
 *  1. The registry decides container vs atom vs unknown-fallback.
 *  2. An *unedited* container still round-trips byte-equal (M1 + M2 hold).
 *  3. An *edited* container re-serializes to well-formed MDX, preserving the
 *     corpus's blank-line padding around its children.
 */

const REGISTRY = portfolioRegistry;

// ── 1. The component registry API ──────────────────────────────────────────

describe("Phase 3 — component registry", () => {
  it("ComponentRegistry.from builds a registry from configs", () => {
    const reg = ComponentRegistry.from([
      { name: "Section", kind: "container" },
      { name: "Figure", kind: "atom" },
    ]);
    expect(reg.isContainer("Section")).toBe(true);
    expect(reg.isContainer("Figure")).toBe(false);
    expect(reg.kindOf("Figure")).toBe("atom");
  });

  it("register() returns a new registry, leaving the receiver unchanged", () => {
    const base = ComponentRegistry.empty();
    const extended = base.register({ name: "Aside", kind: "container" });
    expect(base.isContainer("Aside")).toBe(false);
    expect(extended.isContainer("Aside")).toBe(true);
  });

  it("an unregistered component is neither container nor atom", () => {
    const reg = ComponentRegistry.empty();
    expect(reg.kindOf("Mystery")).toBeUndefined();
    expect(reg.isContainer("Mystery")).toBe(false);
  });

  it("portfolioRegistry has the eight containers and three atoms", () => {
    for (const c of [
      "Section",
      "Outcomes",
      "Emphasis",
      "Punch",
      "Aside",
      "NowReading",
      "NowListening",
      "NowWatching",
    ]) {
      expect(portfolioRegistry.isContainer(c)).toBe(true);
    }
    for (const a of ["Figure", "ImageGrid", "NowItem"]) {
      expect(portfolioRegistry.kindOf(a)).toBe("atom");
    }
  });
});

// ── 2. Container promotion ──────────────────────────────────────────────────

describe("Phase 3 — registered containers become editable nodes", () => {
  it("a registered container is an mdxContainer with editable children", () => {
    const doc = mdxToDoc(
      "<Section>\n\n## A heading\n\nA paragraph.\n\n</Section>\n",
      REGISTRY,
    );
    const container = doc.firstChild!;
    expect(container.type.name).toBe("mdxContainer");
    expect(container.attrs.componentName).toBe("Section");
    // The children are REAL editable nodes, not an opaque atom.
    const kinds: string[] = [];
    container.forEach((child) => kinds.push(child.type.name));
    expect(kinds).toEqual(["heading", "paragraph"]);
  });

  it("the open and close tags are captured verbatim", () => {
    const doc = mdxToDoc(
      "<Section>\n\n## H\n\nText.\n\n</Section>\n",
      REGISTRY,
    );
    const container = doc.firstChild!;
    expect(container.attrs.openTag).toBe("<Section>\n\n");
    expect(container.attrs.closeTag).toBe("\n\n</Section>");
  });

  it("with an empty registry every JSX construct stays a verbatim atom", () => {
    // No registry => Phase-2 behaviour, exactly.
    const doc = mdxToDoc("<Section>\n\ntext\n\n</Section>\n");
    expect(doc.firstChild!.type.name).toBe("mdxBlockAtom");
  });

  it("an unregistered container component falls back to a verbatim atom", () => {
    const reg = ComponentRegistry.from([{ name: "Figure", kind: "atom" }]);
    const doc = mdxToDoc("<Section>\n\ntext\n\n</Section>\n", reg);
    expect(doc.firstChild!.type.name).toBe("mdxBlockAtom");
  });

  it("an atom-kind component is NOT promoted — stays a verbatim atom", () => {
    const doc = mdxToDoc(
      '<Figure src="/a.png" caption="A caption." />\n',
      REGISTRY,
    );
    expect(doc.firstChild!.type.name).toBe("mdxBlockAtom");
    expect(doc.firstChild!.attrs.label).toBe("Figure");
  });

  it("a nested atom inside a promoted container stays a verbatim atom", () => {
    const doc = mdxToDoc(
      '<Section>\n\n## H\n\n<Figure src="/x.png" caption="c" />\n\n</Section>\n',
      REGISTRY,
    );
    const container = doc.firstChild!;
    expect(container.type.name).toBe("mdxContainer");
    const kinds: string[] = [];
    container.forEach((child) => kinds.push(child.type.name));
    // heading is editable; the Figure is still an opaque atom.
    expect(kinds).toEqual(["heading", "mdxBlockAtom"]);
  });

  it("unknown JSX (the safety net) always falls back to a verbatim atom", () => {
    const doc = mdxToDoc("<Wibble>\n\ntext\n\n</Wibble>\n", REGISTRY);
    expect(doc.firstChild!.type.name).toBe("mdxBlockAtom");
  });
});

// ── 3. Unedited round-trip is byte-equal (M1 + M2 unregressed) ──────────────

describe("Phase 3 — unedited containers round-trip byte-equal", () => {
  const FIXTURES = [
    "<Section>\n\n## A heading\n\nA paragraph.\n\n</Section>\n",
    "<Outcomes>\n- one\n- two\n</Outcomes>\n",
    "<Emphasis>\n\nWhose version of leadership is this?\n\n</Emphasis>\n",
    "<Punch>\n\nThe big closing line.\n\n</Punch>\n",
    '<Section>\n\n## Heading\n\n<Figure src="/x.png" caption="c" />\n\n</Section>\n',
    "<NowReading>\n<NowItem status=\"currently\">\n*A book* by Someone.\n</NowItem>\n</NowReading>\n",
    "# Title\n\n<Outcomes>\n- a\n- b\n</Outcomes>\n\nA paragraph with **bold**.\n\n<Section>\n\n## Section heading\n\nMore text.\n\n</Section>\n",
    // Significant whitespace: extra blank lines inside the container.
    "<Section>\n\n\n## Heading\n\n\nText with extra padding.\n\n\n</Section>\n",
    // Adjacent JSX children separated by a single newline (corpus pattern).
    "<NowWatching>\n<NowItem status=\"currently\">\n*One*.\n</NowItem>\n<NowItem status=\"just-finished\">\n*Two*.\n</NowItem>\n</NowWatching>\n",
  ];
  for (const [i, src] of FIXTURES.entries()) {
    it(`fixture ${i + 1}: ${JSON.stringify(src).slice(0, 56)}`, () => {
      expect(roundTrip(src, REGISTRY)).toBe(src);
    });
  }

  it("the empty-registry round-trip is unchanged (M2 baseline)", () => {
    const src = "<Section>\n\n## H\n\nText.\n\n</Section>\n";
    expect(roundTrip(src)).toBe(src);
  });
});

// ── 4. Edited containers re-serialize correctly ─────────────────────────────

/** Rebuild a doc with `container`'s child at `index` replaced by `replacement`. */
function replaceContainerChild(
  doc: PMNode,
  containerIndex: number,
  childIndex: number,
  replacement: PMNode,
): PMNode {
  const blocks: PMNode[] = [];
  doc.forEach((block, _offset, i) => {
    if (i !== containerIndex) {
      blocks.push(block);
      return;
    }
    const children: PMNode[] = [];
    block.forEach((child, _o, ci) => {
      children.push(ci === childIndex ? replacement : child);
    });
    blocks.push(block.copy(Fragment.from(children)));
  });
  return schema.nodes.doc!.create(null, Fragment.from(blocks));
}

/** Append `extra` to a container's block children. */
function appendContainerChild(
  doc: PMNode,
  containerIndex: number,
  extra: PMNode,
): PMNode {
  const blocks: PMNode[] = [];
  doc.forEach((block, _offset, i) => {
    if (i !== containerIndex) {
      blocks.push(block);
      return;
    }
    const children: PMNode[] = [];
    block.forEach((child) => children.push(child));
    children.push(extra);
    blocks.push(block.copy(Fragment.from(children)));
  });
  return schema.nodes.doc!.create(null, Fragment.from(blocks));
}

describe("Phase 3 — edited containers re-serialize to well-formed MDX", () => {
  it("editing a container child's text re-emits valid MDX", () => {
    const doc = mdxToDoc(
      "<Section>\n\n## Original heading\n\nOriginal text.\n\n</Section>\n",
      REGISTRY,
    );
    // Replace the paragraph (child 1) with edited text.
    const edited = replaceContainerChild(
      doc,
      0,
      1,
      schema.nodes.paragraph!.create(null, schema.text("Edited paragraph.")),
    );
    const out = docToMdx(edited);
    expect(out).toBe(
      "<Section>\n\n## Original heading\n\nEdited paragraph.\n\n</Section>\n",
    );
  });

  it("editing preserves the blank-line padding around children", () => {
    const doc = mdxToDoc(
      "<Section>\n\n## Heading\n\nBody.\n\n</Section>\n",
      REGISTRY,
    );
    const edited = replaceContainerChild(
      doc,
      0,
      0,
      schema.nodes.heading!.create({ level: 2 }, schema.text("New Heading")),
    );
    const out = docToMdx(edited);
    // Open tag still `<Section>\n\n`, close still `\n\n</Section>` — padding intact.
    expect(out.startsWith("<Section>\n\n")).toBe(true);
    expect(out.trimEnd().endsWith("\n\n</Section>")).toBe(true);
    expect(out).toBe(
      "<Section>\n\n## New Heading\n\nBody.\n\n</Section>\n",
    );
  });

  it("appending a child uses a canonical blank-line separator", () => {
    const doc = mdxToDoc(
      "<Section>\n\n## Heading\n\nFirst paragraph.\n\n</Section>\n",
      REGISTRY,
    );
    const edited = appendContainerChild(
      doc,
      0,
      schema.nodes.paragraph!.create(null, schema.text("Added paragraph.")),
    );
    const out = docToMdx(edited);
    // The new child joins with the corpus blank-line separator.
    expect(out).toBe(
      "<Section>\n\n## Heading\n\nFirst paragraph.\n\nAdded paragraph.\n\n</Section>\n",
    );
  });

  it("editing a tight container preserves its tight separators", () => {
    const doc = mdxToDoc("<Outcomes>\n- one\n- two\n</Outcomes>\n", REGISTRY);
    // Replace the bullet list with an edited one.
    const newList = schema.nodes.bulletList!.create(
      null,
      Fragment.from([
        schema.nodes.listItem!.create(
          null,
          schema.nodes.paragraph!.create(null, schema.text("edited")),
        ),
      ]),
    );
    const edited = replaceContainerChild(doc, 0, 0, newList);
    const out = docToMdx(edited);
    // The single-newline padding of <Outcomes> is preserved.
    expect(out).toBe("<Outcomes>\n- edited\n</Outcomes>\n");
  });
});

// ── 5. Attribute-bearing containers re-emit attributes intact ───────────────

describe("Phase 3 — container attributes", () => {
  it("a string attribute survives an unedited round-trip", () => {
    const src = '<Section label="Context">\n\nText.\n\n</Section>\n';
    expect(roundTrip(src, REGISTRY)).toBe(src);
  });

  it("attributes are extracted onto the node for consumers", () => {
    const doc = mdxToDoc(
      '<Section label="Context" featured>\n\nText.\n\n</Section>\n',
      REGISTRY,
    );
    const attrs = doc.firstChild!.attrs.attributes as Array<{
      name: string | null;
      value: string | null;
      expression: boolean;
    }>;
    expect(attrs).toEqual([
      { name: "label", value: "Context", expression: false },
      { name: "featured", value: null, expression: false },
    ]);
  });

  it("an expression-valued attribute is flagged and survives round-trip", () => {
    const src = "<Section count={3}>\n\nText.\n\n</Section>\n";
    expect(roundTrip(src, REGISTRY)).toBe(src);
    const doc = mdxToDoc(src, REGISTRY);
    const attrs = doc.firstChild!.attrs.attributes as Array<{
      name: string | null;
      value: string | null;
      expression: boolean;
    }>;
    expect(attrs[0]).toEqual({
      name: "count",
      value: "3",
      expression: true,
    });
  });

  it("editing a child keeps an attribute-bearing open tag verbatim", () => {
    const doc = mdxToDoc(
      '<Section label="Context">\n\nOld text.\n\n</Section>\n',
      REGISTRY,
    );
    const edited = replaceContainerChild(
      doc,
      0,
      0,
      schema.nodes.paragraph!.create(null, schema.text("New text.")),
    );
    const out = docToMdx(edited);
    expect(out).toBe(
      '<Section label="Context">\n\nNew text.\n\n</Section>\n',
    );
  });

  it("a section containing a bare tilde still promotes to a container", () => {
    // "~18%" used to demote the whole <Section> to a verbatim atom: the
    // serializer escaped the `~` to `\~`, so the byte-exact round-trip guard
    // refused the promotion. A lone `~` is now left untouched.
    const src =
      "<Section>\n\n## Results\n\nReturns dropped by ~18% in the pilot.\n\n</Section>\n";
    const doc = mdxToDoc(src, REGISTRY);
    expect(doc.firstChild!.type.name).toBe("mdxContainer");
    expect(roundTrip(src, REGISTRY)).toBe(src);
  });
});
