import { describe, it, expect } from "vitest";
import { roundTrip, mdxToDoc } from "../src/index.js";

/**
 * Phase 2 — JSX verbatim-atom round-trip identity.
 *
 * Every MDX-specific construct — block JSX, inline JSX, nested JSX, JS-expression
 * attributes, expressions, and ESM import/export — is captured as a verbatim
 * atom: the exact source span is sliced and re-emitted unchanged. These
 * fixtures assert `roundTrip(x) === x` for each, including the byte-exact
 * preservation of indentation and blank lines inside JSX flow elements, which
 * the parsed-subtree approach (Phase 1's passthrough) mangled.
 */

const FIXTURES: Record<string, string[]> = {
  "block JSX": [
    "<Figure src=\"/a.png\" caption=\"A caption.\" />\n",
    "<Section>\n\n## A heading\n\nA paragraph.\n\n</Section>\n",
    "<Outcomes>\n- one\n- two\n</Outcomes>\n",
  ],

  "self-closing block JSX": ["<NowListening />\n"],

  "nested JSX captured whole": [
    "<Section>\n\n## Heading\n\n<Figure src=\"/x.png\" caption=\"c\" />\n\n</Section>\n",
    "<NowReading>\n<NowItem status=\"currently\">\n*A book* by Someone.\n</NowItem>\n</NowReading>\n",
  ],

  "JS-expression attribute (the hard one)": [
    "<ImageGrid items={[\n  { src: '/a.jpg', caption: 'One.' },\n  { src: '/b.jpg', caption: 'Two.' },\n]} />\n",
  ],

  "blank lines and indentation inside JSX preserved verbatim": [
    "<Section>\n\n\nLeading blank lines.\n\n\n    indented line that is not code\n\n</Section>\n",
  ],

  "inline JSX": [
    "A paragraph with an <Icon name=\"star\" /> inline.\n",
    "Text <Em>emphasised by a component</Em> here.\n",
  ],

  "JSX mixed with standard Markdown": [
    "# Title\n\n<Outcomes>\n- a\n- b\n</Outcomes>\n\nA standard paragraph with **bold**.\n\n<Section>\n\n## Section heading\n\nMore text.\n\n</Section>\n",
  ],

  expressions: ["A value: {1 + 2} inline.\n", "{/* a comment block */}\n"],

  "ESM import/export": [
    "import Foo from './foo.js'\n\nA paragraph.\n",
    "export const meta = { title: 'X' }\n\nA paragraph.\n",
  ],
};

describe("Phase 2 — JSX verbatim-atom round-trip identity", () => {
  for (const [group, cases] of Object.entries(FIXTURES)) {
    describe(group, () => {
      for (const [i, input] of cases.entries()) {
        it(`case ${i + 1}: ${JSON.stringify(input).slice(0, 60)}`, () => {
          expect(roundTrip(input)).toBe(input);
        });
      }
    });
  }
});

describe("Phase 2 — verbatim atoms carry a placeholder label", () => {
  it("block JSX atom is labeled with the component name", () => {
    const doc = mdxToDoc("<Section>\n\ntext\n\n</Section>\n");
    const atom = doc.firstChild!;
    expect(atom.type.name).toBe("mdxBlockAtom");
    expect(atom.attrs.label).toBe("Section");
    expect(atom.attrs.value).toBe("<Section>\n\ntext\n\n</Section>");
  });

  it("inline JSX atom is labeled with the component name", () => {
    const doc = mdxToDoc("A line with <Icon name=\"star\" /> here.\n");
    const para = doc.firstChild!;
    let found: { label: unknown; value: unknown } | null = null;
    para.forEach((child) => {
      if (child.type.name === "mdxInlineAtom") {
        found = { label: child.attrs.label, value: child.attrs.value };
      }
    });
    expect(found).not.toBeNull();
    expect(found!.label).toBe("Icon");
    expect(found!.value).toBe("<Icon name=\"star\" />");
  });

  it("expression atom is labeled Expression", () => {
    const doc = mdxToDoc("{1 + 2}\n");
    expect(doc.firstChild!.attrs.label).toBe("Expression");
  });

  it("ESM atom is labeled Import/Export", () => {
    const doc = mdxToDoc("import X from './x.js'\n\ntext\n");
    expect(doc.firstChild!.attrs.label).toBe("Import/Export");
  });

  it("nested JSX is captured as one atom, not recursed into", () => {
    const src = "<Section>\n\n## H\n\n<Figure src=\"/x.png\" caption=\"c\" />\n\n</Section>\n";
    const doc = mdxToDoc(src);
    // The whole <Section> (including the nested <Figure>) is a single atom.
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild!.type.name).toBe("mdxBlockAtom");
    expect(doc.firstChild!.attrs.value).toBe(src.trimEnd());
  });
});
