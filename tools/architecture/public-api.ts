/**
 * SR-1 §27 / SR1-A14 — the public export surface, captured from the BUILT declarations.
 *
 * The two package entry points are re-export barrels, so the names a consumer can import are
 * spread across the `.d.ts` graph. This module walks that graph from an entry point and
 * classifies each name as a value or a type, which is exactly what a parity check needs:
 * SR-1 may move code, but no name may disappear and no name may change kind.
 *
 * It reads declarations, not sources, so it measures what a consumer actually sees.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export type ExportKind = "value" | "type";

export interface PublicExport {
  readonly name: string;
  readonly kind: ExportKind;
  /** The declaration file the name was ultimately declared or used in. */
  readonly from: string;
}

export interface PublicApiSurface {
  readonly entry: string;
  readonly names: readonly PublicExport[];
}

const toPosix = (value: string): string => value.split(sep).join("/");

/** Resolve a `.js`-suffixed relative specifier inside a `.d.ts` to its declaration file. */
function resolveDeclaration(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = join(dirname(fromFile), specifier);
  const candidates = base.endsWith(".js")
    ? [`${base.slice(0, -3)}.d.ts`, `${base.slice(0, -3)}.ts`]
    : [`${base}.d.ts`, join(base, "index.d.ts")];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  return undefined;
}

const VALUE_KEYWORDS = /\b(?:declare\s+)?(?:const|let|var|function|class|enum|namespace)\s+/u;

/** Walk the declaration graph from `entryFile`, collecting every exported name. */
export function collectPublicApi(root: string, entryFile: string): PublicApiSurface {
  const seenFiles = new Set<string>();
  const names = new Map<string, PublicExport>();

  const record = (name: string, kind: ExportKind, file: string): void => {
    const existing = names.get(name);
    // A value export wins over a type export of the same name (a class is both).
    if (existing === undefined || (existing.kind === "type" && kind === "value")) {
      names.set(name, { name, kind, from: toPosix(relative(root, file)) });
    }
  };

  const walk = (absolute: string): void => {
    if (seenFiles.has(absolute)) return;
    seenFiles.add(absolute);
    const text = readFileSync(absolute, "utf8");

    for (const match of text.matchAll(/export\s+(?:type\s+)?\*[^;]*?from\s*"([^"]+)"/gu)) {
      const next = resolveDeclaration(absolute, match[1]!);
      if (next !== undefined) walk(next);
    }
    for (const match of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/gu)) {
      const kind: ExportKind = match[0].startsWith("export type") ? "type" : "value";
      for (const raw of match[1]!.split(",")) {
        const parts = raw.trim().split(/\s+as\s+/u);
        const name = (parts[parts.length - 1] ?? "").trim();
        if (name !== "") record(name, kind, absolute);
      }
      const next = resolveDeclaration(absolute, match[2]!);
      if (next !== undefined) seenFiles.add(next); // referenced, not re-exported wholesale
    }
    // Inline declarations: `export declare const X`, `export interface Y`, `export type Z = …`
    for (const match of text.matchAll(/export\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z0-9_$]+)/gu)) {
      record(match[1]!, "type", absolute);
    }
    for (const match of text.matchAll(/export\s+declare\s+[^;]*?\b([A-Za-z0-9_$]+)\s*[:(=<]/gu)) {
      if (VALUE_KEYWORDS.test(match[0])) record(match[1]!, "value", absolute);
    }
    for (const match of text.matchAll(/export\s*\{([^}]*)\}\s*;/gu)) {
      for (const raw of match[1]!.split(",")) {
        const parts = raw.trim().split(/\s+as\s+/u);
        const name = (parts[parts.length - 1] ?? "").trim();
        if (name !== "" && !name.startsWith("type ")) record(name, "value", absolute);
      }
    }
  };

  walk(join(root, entryFile));
  return {
    entry: toPosix(entryFile),
    names: [...names.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export interface PublicApiBaseline {
  readonly capturedFrom: string;
  readonly entries: Readonly<Record<string, readonly { readonly name: string; readonly kind: ExportKind }[]>>;
}

export interface PublicApiParityResult {
  readonly ok: boolean;
  readonly missing: readonly { readonly entry: string; readonly name: string; readonly kind: ExportKind }[];
  readonly changedKind: readonly { readonly entry: string; readonly name: string; readonly was: ExportKind; readonly now: ExportKind }[];
  readonly added: readonly { readonly entry: string; readonly name: string }[];
}

/** Compare a live surface against the baseline: nothing missing, nothing re-kinded. */
export function checkPublicApiParity(
  baseline: PublicApiBaseline,
  current: Readonly<Record<string, PublicApiSurface>>,
): PublicApiParityResult {
  const missing: { entry: string; name: string; kind: ExportKind }[] = [];
  const changedKind: { entry: string; name: string; was: ExportKind; now: ExportKind }[] = [];
  const added: { entry: string; name: string }[] = [];
  for (const [entry, expected] of Object.entries(baseline.entries)) {
    const live = current[entry];
    if (live === undefined) {
      for (const item of expected) missing.push({ entry, name: item.name, kind: item.kind });
      continue;
    }
    const byName = new Map(live.names.map((item) => [item.name, item]));
    for (const item of expected) {
      const found = byName.get(item.name);
      if (found === undefined) missing.push({ entry, name: item.name, kind: item.kind });
      else if (found.kind !== item.kind) changedKind.push({ entry, name: item.name, was: item.kind, now: found.kind });
    }
    const expectedNames = new Set(expected.map((item) => item.name));
    for (const item of live.names) if (!expectedNames.has(item.name)) added.push({ entry, name: item.name });
  }
  return { ok: missing.length === 0 && changedKind.length === 0, missing, changedKind, added };
}
