import { defineConfig } from "tsup";

/**
 * Build config for tiptap-mdx.
 *
 * The library is consumed by React + Tiptap apps, which are ESM, so ESM is the
 * only output format. `dts: true` emits hand-off-quality `.d.ts` declarations.
 *
 * All runtime dependencies (Tiptap, remark, the unified ecosystem) are left
 * external — they are declared in `package.json` and resolved by the consumer's
 * own install, never bundled into `dist/`.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  outDir: "dist",
});
