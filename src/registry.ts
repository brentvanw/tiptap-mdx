/**
 * Phase 3 — the component registry.
 *
 * The registry is the single configuration surface that tells `tiptap-mdx` how
 * to treat each JSX component it meets. Adding support for a component is a
 * config entry, never a code change to the library.
 *
 * Two kinds:
 *
 *  - `"container"` — a component that wraps Markdown / JSX children. It is
 *    promoted to an *editable node*: a styled wrapper whose open/close tags are
 *    preserved verbatim (so attributes and blank-line padding survive) while
 *    its children become real, editable ProseMirror content. See
 *    `container.ts`.
 *
 *  - `"atom"` — an attribute-heavy component (`Figure`, `ImageGrid`, `NowItem`)
 *    whose data lives in attributes, including JavaScript-expression
 *    attributes. These stay Phase-2 verbatim atoms: captured by exact source
 *    span and re-emitted unchanged. Rich form editing for them is deferred.
 *
 * Anything NOT in the registry falls through to the Phase-2 verbatim-atom path
 * — the universal safety net. An unknown `<Whatever>` can never be corrupted:
 * it is sliced and re-emitted byte-for-byte.
 */

/** How `tiptap-mdx` should treat a given JSX component. */
export type ComponentKind = "container" | "atom";

/** One component's configuration. */
export interface ComponentConfig {
  /** The JSX tag name, e.g. `"Section"`. */
  name: string;
  /** `"container"` (editable children) or `"atom"` (verbatim, form-edited). */
  kind: ComponentKind;
}

/**
 * The component registry. Immutable once built; `register()` returns a new
 * registry so a consumer can compose configurations without mutation surprises.
 */
export class ComponentRegistry {
  private readonly entries: ReadonlyMap<string, ComponentConfig>;

  private constructor(entries: ReadonlyMap<string, ComponentConfig>) {
    this.entries = entries;
  }

  /** An empty registry — every component falls back to a verbatim atom. */
  static empty(): ComponentRegistry {
    return new ComponentRegistry(new Map());
  }

  /**
   * Build a registry from a list of component configs.
   *
   *   ComponentRegistry.from([
   *     { name: "Section", kind: "container" },
   *     { name: "Figure",  kind: "atom" },
   *   ])
   */
  static from(configs: readonly ComponentConfig[]): ComponentRegistry {
    let registry = ComponentRegistry.empty();
    for (const config of configs) registry = registry.register(config);
    return registry;
  }

  /**
   * Return a new registry with `config` added (or replacing an existing entry
   * of the same name). The receiver is left unchanged.
   */
  register(config: ComponentConfig): ComponentRegistry {
    if (!config.name) {
      throw new Error("tiptap-mdx: a registered component must have a name.");
    }
    const next = new Map(this.entries);
    next.set(config.name, config);
    return new ComponentRegistry(next);
  }

  /** The kind registered for `name`, or `undefined` if it is unregistered. */
  kindOf(name: string | null | undefined): ComponentKind | undefined {
    if (name == null) return undefined;
    return this.entries.get(name)?.kind;
  }

  /** True when `name` is registered as an editable container component. */
  isContainer(name: string | null | undefined): boolean {
    return this.kindOf(name) === "container";
  }

  /** All registered component configs (insertion order). */
  list(): ComponentConfig[] {
    return [...this.entries.values()];
  }
}

/**
 * The default registry for the Portfolio component set, confirmed against
 * `~/Portfolio/src/components/mdx/MDXComponents.tsx`.
 *
 *  - Containers (Markdown/JSX children, editable in-canvas):
 *      Section, Outcomes, Emphasis, Punch, Aside, NowReading,
 *      NowListening, NowWatching
 *  - Atoms (attribute-heavy, verbatim + deferred side-panel form):
 *      Figure, ImageGrid, NowItem
 *
 * A consumer with a different component set builds its own registry; this one
 * is exported only as a convenience and as the fixture the test suite uses.
 */
export const portfolioRegistry: ComponentRegistry = ComponentRegistry.from([
  { name: "Section", kind: "container" },
  { name: "Outcomes", kind: "container" },
  { name: "Emphasis", kind: "container" },
  { name: "Punch", kind: "container" },
  { name: "Aside", kind: "container" },
  { name: "NowReading", kind: "container" },
  { name: "NowListening", kind: "container" },
  { name: "NowWatching", kind: "container" },
  { name: "Figure", kind: "atom" },
  { name: "ImageGrid", kind: "atom" },
  { name: "NowItem", kind: "atom" },
]);
