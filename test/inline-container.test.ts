import { describe, it, expect } from "vitest";
import {
  roundTrip,
  mdxToDoc,
  docToMdx,
  portfolioRegistry,
} from "../src/index.js";

/**
 * Phase 4 — editable inline container components.
 *
 * A registered `container` written as an inline JSX element
 * (`mdxJsxTextElement`, e.g. `<Emphasis>…</Emphasis>` on one line) is promoted
 * from an opaque inline atom to an editable `mdxInline` mark over its text.
 *
 * Properties under test:
 *  1. An *unedited* inline container round-trips byte-equal (the invariant).
 *  2. The registry decides mark-promotion vs. verbatim-atom fallback.
 *  3. Non-canonical inner Markdown gracefully stays a verbatim atom.
 *  4. An *edited* inline container re-serializes to well-formed MDX with its
 *     open/close tags intact.
 */

const REG = portfolioRegistry;

describe("Phase 4 — inline container round-trip identity", () => {
  const cases = [
    "<Emphasis>And in those moments, craft won't save you.</Emphasis>\n",
    "A line with <Emphasis>an emphasized phrase</Emphasis> in the middle.\n",
    "<Emphasis>Phrase with *italic* and **bold** woven in.</Emphasis>\n",
    "Two: <Emphasis>first one</Emphasis> then <Emphasis>second one</Emphasis>.\n",
    "Back to back <Emphasis>a</Emphasis><Emphasis>b</Emphasis> here.\n",
    "# Heading\n\nText then <Emphasis>a closing thought</Emphasis>.\n",
  ];
  for (const [i, input] of cases.entries()) {
    it(`case ${i + 1}: ${JSON.stringify(input).slice(0, 52)}`, () => {
      expect(roundTrip(input, REG)).toBe(input);
    });
  }
});

describe("Phase 4 — promotion vs. verbatim-atom fallback", () => {
  it("promotes a registered inline container to the mdxInline mark", () => {
    const doc = mdxToDoc("<Emphasis>hello there</Emphasis>\n", REG);
    const text = doc.firstChild!.firstChild!;
    expect(text.isText).toBe(true);
    expect(text.text).toBe("hello there");
    expect(text.marks.some((m) => m.type.name === "mdxInline")).toBe(true);
  });

  it("the mark carries the verbatim open and close tags", () => {
    const doc = mdxToDoc("<Emphasis>x</Emphasis>\n", REG);
    const mark = doc.firstChild!.firstChild!.marks.find(
      (m) => m.type.name === "mdxInline",
    )!;
    expect(mark.attrs.componentName).toBe("Emphasis");
    expect(mark.attrs.openTag).toBe("<Emphasis>");
    expect(mark.attrs.closeTag).toBe("</Emphasis>");
  });

  it("leaves an unregistered inline component as a verbatim atom", () => {
    const doc = mdxToDoc('Text <Icon name="star" /> here.\n', REG);
    const para = doc.firstChild!;
    let sawAtom = false;
    para.forEach((child) => {
      if (child.type.name === "mdxInlineAtom") sawAtom = true;
    });
    expect(sawAtom).toBe(true);
  });

  it("with an empty registry an inline container stays a verbatim atom", () => {
    const input = "<Emphasis>x</Emphasis>\n";
    expect(roundTrip(input)).toBe(input);
    const doc = mdxToDoc(input);
    expect(doc.firstChild!.firstChild!.type.name).toBe("mdxInlineAtom");
  });

  it("non-canonical inner Markdown falls back to a verbatim atom", () => {
    // `_italic_` is non-canonical (the serializer emits `*italic*`). The
    // round-trip guard rejects the promotion; the verbatim atom keeps it
    // byte-exact instead.
    const input = "<Emphasis>here is _italic_ text</Emphasis>\n";
    expect(roundTrip(input, REG)).toBe(input);
    const doc = mdxToDoc(input, REG);
    expect(doc.firstChild!.firstChild!.type.name).toBe("mdxInlineAtom");
  });
});

describe("Phase 4 — an edited inline container re-serializes", () => {
  it("keeps the open/close tags when the inner text changes", () => {
    const doc = mdxToDoc("<Emphasis>old text</Emphasis>\n", REG);
    const para = doc.firstChild!;
    const original = para.firstChild!;
    // Rebuild the run with new text, same marks — the shape an edit produces.
    const edited = original.type.schema.text("new words", original.marks);
    const newDoc = doc.type.create(
      doc.attrs,
      para.type.create(para.attrs, edited),
    );
    expect(docToMdx(newDoc)).toBe("<Emphasis>new words</Emphasis>\n");
  });
});
