/**
 * SR-1 §7/§8 — the module dependency graph, built from the real sources.
 *
 * Only INTRA-REPOSITORY edges are modelled: the TypeScript sources under `src/**` AND the
 * first-party host JavaScript under `host/**` (SR-1C §8). Bare specifiers
 * are recorded as external imports and are not part of the graph (they cannot create a
 * layering violation inside this repository).
 *
 * WHY NOT THE COMPILER API (§7 allows "compiler API/source parsing"): this toolchain ships
 * `typescript@7.0.2`, the NATIVE compiler. Its JavaScript API no longer exposes
 * `createSourceFile` — the package root exports only a version shim, and the AST entry
 * points sit behind an `unstable/` sync API that spawns the native binary. Rather than add
 * an AST or dependency-analysis framework (§7 discourages that, §33 forbids magic), R0 uses
 * the extractor below, which is:
 *
 *   - cover-tested against every specifier form this repository uses, plus comment/string/
 *     template cases that must NOT create an edge
 *     (`test/architecture/module_architecture_rules.test.ts`);
 *   - self-checking: a misparse yields an UNRESOLVED relative specifier, and `--check` fails
 *     on any unresolved import, so a broken extraction can never silently shrink the graph.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { isAllowedEdge, layerOf, type LogicalLayer } from "./layers.js";

export interface ModuleNode {
  /** Repo-relative POSIX path, e.g. `src/federation/index.ts`. */
  readonly file: string;
  /** Owning directory group, e.g. `src/federation` (or `src` for root files). */
  readonly group: string;
  readonly layer: LogicalLayer;
  readonly layerWhy: string;
  readonly loc: number;
  readonly bytes: number;
  /** Repo-relative files this module imports. */
  readonly imports: readonly string[];
  /** Repo-relative files that import this module. */
  readonly importers: readonly string[];
  /** External package specifiers (not part of the graph). */
  readonly externalImports: readonly string[];
  /** Relative specifiers that did not resolve to a source file (reported, never dropped). */
  readonly unresolvedImports: readonly string[];
  readonly fanOut: number;
  readonly fanIn: number;
}

export interface LayerEdge {
  readonly fromLayer: LogicalLayer;
  readonly toLayer: LogicalLayer;
  readonly count: number;
}

export interface DirectoryEdge {
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

export interface StronglyConnectedComponent {
  readonly size: number;
  readonly files: readonly string[];
  /** TRUE for a single module that imports itself. */
  readonly selfLoop: boolean;
}

export interface ModuleArchitecture {
  readonly root: string;
  readonly modules: readonly ModuleNode[];
  readonly layerEdges: readonly LayerEdge[];
  /**
   * SR-1C §4/§5: forbidden edges are reported BOTH ways — as concrete import edges (the unit of
   * an exception) and as layer-pair classes (reporting only, never exception authority).
   */
  readonly forbiddenImports: readonly {
    readonly from: string;
    readonly to: string;
    readonly fromLayer: LogicalLayer;
    readonly toLayer: LogicalLayer;
  }[];
  readonly forbiddenEdges: readonly LayerEdge[];
  readonly directoryEdges: readonly DirectoryEdge[];
  readonly stronglyConnectedComponents: readonly StronglyConnectedComponent[];
  readonly exportSurface: readonly { readonly file: string; readonly exports: readonly string[] }[];
  readonly totals: {
    readonly files: number;
    readonly loc: number;
    readonly bytes: number;
    readonly edges: number;
    readonly externalImports: number;
    readonly unresolvedImports: number;
  };
}

const toPosix = (value: string): string => value.split(sep).join("/");

/**
 * Every FIRST-PARTY source file the checker owns (SR-1C §8):
 *
 *   the `src` tree   TypeScript product sources (declaration files excluded)
 *   the `host` tree  the shipped DSH host bundle's JavaScript (`.js`, and `.mjs` when present)
 *
 * Deliberately excluded: build output, dependency trees and release evidence — none of them are
 * authored source, and scanning them would report edges nobody wrote.
 */
export function listSourceFiles(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      const isTypescript = entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts");
      const isHostJavascript = entry.name.endsWith(".js") || entry.name.endsWith(".mjs");
      if (!isTypescript && !isHostJavascript) continue;
      out.push(toPosix(relative(root, path)));
    }
  };
  walk(join(root, "src"));
  walk(join(root, "host"));
  return out.sort();
}

/**
 * Remove comments while respecting string and template literals, so that
 * `// import x from "./y.js"` and `const s = "import '../z.js'"` cannot create an edge.
 * Line breaks inside block comments are preserved so line counts stay honest.
 */
export function stripComments(text: string): string {
  let out = "";
  let i = 0;
  let state: "code" | "line" | "block" | "single" | "double" | "template" = "code";
  while (i < text.length) {
    const char = text[i]!;
    const next = text[i + 1];
    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (char === "'") state = "single";
      else if (char === '"') state = "double";
      else if (char === "`") state = "template";
      out += char;
      i += 1;
      continue;
    }
    if (state === "line") {
      if (char === "\n") {
        state = "code";
        out += char;
      }
      i += 1;
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        i += 2;
        continue;
      }
      if (char === "\n") out += char;
      i += 1;
      continue;
    }
    // Inside a literal: copy verbatim, honour escapes, stop at the closing delimiter.
    out += char;
    if (char === "\\" && next !== undefined) {
      out += next;
      i += 2;
      continue;
    }
    if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
      state = "code";
    }
    i += 1;
  }
  return out;
}

/**
 * Mask the CONTENTS of every string/template literal EXCEPT the ones that sit in a module
 * specifier position (right after `from`, `import`, `require(` or `import(`), so that
 * `const s = "import x from './nope.js'"` cannot create an edge while
 * `import x from "./real.js"` still can.
 */
export function maskNonSpecifierLiterals(text: string): string {
  const SPECIFIER_TAIL = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*$/u;
  let out = "";
  let i = 0;
  let inLine = false;
  let inBlock = false;
  while (i < text.length) {
    const char = text[i]!;
    const next = text[i + 1];
    if (inLine) {
      if (char === "\n") {
        inLine = false;
        out += char;
      }
      i += 1;
      continue;
    }
    if (inBlock) {
      if (char === "*" && next === "/") {
        inBlock = false;
        i += 2;
        continue;
      }
      if (char === "\n") out += char;
      i += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlock = true;
      i += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const keep = SPECIFIER_TAIL.test(out);
      out += char;
      i += 1;
      while (i < text.length) {
        const inner = text[i]!;
        if (inner === "\\") {
          if (keep) out += text.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (inner === char) {
          out += char;
          i += 1;
          break;
        }
        if (keep) out += inner;
        i += 1;
      }
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}

/** The text the extractor runs against: comments stripped, non-specifier literals masked. */
export function codeForExtraction(text: string): string {
  return maskNonSpecifierLiterals(stripComments(text));
}

const SPECIFIER_PATTERNS: readonly RegExp[] = [
  // import x from "y"; import { a as b } from "y"; import type { T } from "y"; import * as ns from "y"
  /\bimport\s+(?:type\s+)?[\w$*{}\s,]*?\sfrom\s*["']([^"']+)["']/gu,
  // import "y"   (side effect)
  /\bimport\s*["']([^"']+)["']/gu,
  // export * from "y"; export { a } from "y"; export type { T } from "y"
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/gu,
  // await import("y")
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
  // require("y")
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
];

/** Every module specifier a file depends on, deduplicated and order-stable. */
export function moduleSpecifiersOf(_fileName: string, text: string): readonly string[] {
  const code = codeForExtraction(text);
  const found = new Set<string>();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined && specifier !== "") found.add(specifier);
    }
  }
  return [...found];
}

/**
 * The exported names of a barrel, used only for the "public export surface" metric.
 * Deliberately shallow and never used for enforcement.
 */
export function exportSurfaceOf(_fileName: string, text: string): readonly string[] {
  const code = stripComments(text);
  const names = new Set<string>();
  for (const match of code.matchAll(/\bexport\s+(?:type\s+)?\*/gu)) {
    void match;
    names.add("*");
  }
  for (const match of code.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/gu)) {
    for (const raw of (match[1] ?? "").split(",")) {
      const parts = raw.trim().split(/\s+as\s+/u);
      const name = (parts[parts.length - 1] ?? "").trim();
      if (name !== "") names.add(name);
    }
  }
  for (const match of code.matchAll(/\bexport\s+(?:declare\s+)?(?:const|let|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gu)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

/**
 * Resolve a specifier to a first-party source file.
 *
 * Both conventions in this repository are supported: NodeNext TypeScript, where `./x.js` means
 * `x.ts`, and real host JavaScript, where `./x.js` means `x.js`. Bare specifiers are external
 * and are never resolved (SR-1C §10: no fabricated edges for runtime bindings).
 */
export function resolveSpecifier(root: string, fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(root, dirname(fromFile), specifier);
  const candidates: string[] = [];
  for (const suffix of [".js", ".mjs"] as const) {
    if (base.endsWith(suffix)) {
      const stem = base.slice(0, -suffix.length);
      candidates.push(`${stem}.ts`, `${stem}.js`, base);
    }
  }
  candidates.push(`${base}.ts`, `${base}.js`, join(base, "index.ts"), join(base, "index.js"));
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return toPosix(relative(root, candidate));
    } catch {
      /* try the next candidate */
    }
  }
  return undefined;
}

/** Tarjan's strongly connected components, iterative, over the file graph. */
export function stronglyConnectedComponents(
  files: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
): readonly StronglyConnectedComponent[] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let counter = 0;
  const components: StronglyConnectedComponent[] = [];

  for (const start of files) {
    if (index.has(start)) continue;
    const work: { node: string; childIndex: number }[] = [{ node: start, childIndex: 0 }];
    index.set(start, counter);
    low.set(start, counter);
    counter += 1;
    stack.push(start);
    onStack.add(start);
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const children = edges.get(frame.node) ?? [];
      if (frame.childIndex < children.length) {
        const next = children[frame.childIndex]!;
        frame.childIndex += 1;
        if (!index.has(next)) {
          index.set(next, counter);
          low.set(next, counter);
          counter += 1;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, childIndex: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(next)!));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent !== undefined) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node) === index.get(frame.node)) {
        const members: string[] = [];
        for (;;) {
          const member = stack.pop()!;
          onStack.delete(member);
          members.push(member);
          if (member === frame.node) break;
        }
        members.sort();
        const selfLoop = members.length === 1 && (edges.get(members[0]!) ?? []).includes(members[0]!);
        if (members.length > 1 || selfLoop) components.push({ size: members.length, files: members, selfLoop });
      }
    }
  }
  return components.sort((a, b) => b.size - a.size || a.files[0]!.localeCompare(b.files[0]!));
}

/** Build the whole architecture model for a repository root. */
export function analyseModuleArchitecture(root: string): ModuleArchitecture {
  const files = listSourceFiles(root);
  const imports = new Map<string, readonly string[]>();
  const external = new Map<string, readonly string[]>();
  const unresolved = new Map<string, readonly string[]>();
  const loc = new Map<string, number>();
  const bytes = new Map<string, number>();
  const exports = new Map<string, readonly string[]>();

  for (const file of files) {
    const absolute = join(root, file);
    const text = readFileSync(absolute, "utf8");
    loc.set(file, text.split("\n").length);
    bytes.set(file, Buffer.byteLength(text, "utf8"));
    const resolved = new Set<string>();
    const externals = new Set<string>();
    const missing = new Set<string>();
    for (const specifier of moduleSpecifiersOf(absolute, text)) {
      const target = resolveSpecifier(root, file, specifier);
      if (target === undefined) {
        if (specifier.startsWith(".")) missing.add(specifier);
        else externals.add(specifier);
        continue;
      }
      if (target !== file) resolved.add(target);
    }
    imports.set(file, [...resolved].sort());
    external.set(file, [...externals].sort());
    unresolved.set(file, [...missing].sort());
    exports.set(file, exportSurfaceOf(absolute, text));
  }

  const importers = new Map<string, Set<string>>();
  for (const file of files) importers.set(file, new Set());
  for (const file of files) {
    for (const target of imports.get(file) ?? []) importers.get(target)?.add(file);
  }

  const nodes: ModuleNode[] = files.map((file) => {
    const { layer, why } = layerOf(file);
    const parts = file.split("/");
    const outgoing = imports.get(file) ?? [];
    const incoming = [...(importers.get(file) ?? [])].sort();
    return {
      file,
      group: parts.length === 2 ? "src" : `src/${parts[1]!}`,
      layer,
      layerWhy: why,
      loc: loc.get(file) ?? 0,
      bytes: bytes.get(file) ?? 0,
      imports: outgoing,
      importers: incoming,
      externalImports: external.get(file) ?? [],
      unresolvedImports: unresolved.get(file) ?? [],
      fanOut: outgoing.length,
      fanIn: incoming.length,
    };
  });

  const layerEdgeCounts = new Map<string, { fromLayer: LogicalLayer; toLayer: LogicalLayer; count: number }>();
  const directoryEdgeCounts = new Map<string, { from: string; to: string; count: number }>();
  const byFile = new Map(nodes.map((node) => [node.file, node]));
  for (const node of nodes) {
    for (const target of node.imports) {
      const other = byFile.get(target);
      if (other === undefined) continue;
      const layerKey = `${node.layer}->${other.layer}`;
      const existing = layerEdgeCounts.get(layerKey);
      if (existing === undefined) layerEdgeCounts.set(layerKey, { fromLayer: node.layer, toLayer: other.layer, count: 1 });
      else existing.count += 1;
      if (node.group !== other.group) {
        const dirKey = `${node.group}->${other.group}`;
        const dirEdge = directoryEdgeCounts.get(dirKey);
        if (dirEdge === undefined) directoryEdgeCounts.set(dirKey, { from: node.group, to: other.group, count: 1 });
        else dirEdge.count += 1;
      }
    }
  }

  const layerEdges = [...layerEdgeCounts.values()].sort(
    (a, b) => b.count - a.count || `${a.fromLayer}->${a.toLayer}`.localeCompare(`${b.fromLayer}->${b.toLayer}`),
  );

  const edgeMap = new Map<string, readonly string[]>();
  for (const node of nodes) edgeMap.set(node.file, node.imports);

  return {
    root,
    modules: nodes,
    layerEdges,
    forbiddenImports: nodes.flatMap((node) =>
      node.imports
        .map((target) => ({
          from: node.file,
          to: target,
          fromLayer: node.layer,
          toLayer: byFile.get(target)?.layer ?? node.layer,
        }))
        .filter((edge) => !isAllowedEdge(edge.fromLayer, edge.toLayer)),
    ),
    forbiddenEdges: layerEdges.filter((edge) => !isAllowedEdge(edge.fromLayer, edge.toLayer)),
    directoryEdges: [...directoryEdgeCounts.values()].sort((a, b) => b.count - a.count),
    stronglyConnectedComponents: stronglyConnectedComponents(files, edgeMap),
    exportSurface: files
      .filter((file) => file.endsWith("/index.ts") || file === "src/index.ts" || file === "src/advanced.ts")
      .map((file) => ({ file, exports: exports.get(file) ?? [] })),
    totals: {
      files: nodes.length,
      loc: nodes.reduce((sum, node) => sum + node.loc, 0),
      bytes: nodes.reduce((sum, node) => sum + node.bytes, 0),
      edges: nodes.reduce((sum, node) => sum + node.imports.length, 0),
      externalImports: new Set(nodes.flatMap((node) => node.externalImports)).size,
      unresolvedImports: nodes.reduce((sum, node) => sum + node.unresolvedImports.length, 0),
    },
  };
}
