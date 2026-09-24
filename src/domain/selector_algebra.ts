/**
 * PLMP-LEAN-1 §D3-b1 — the RESOURCE SELECTOR ALGEBRA.
 *
 * The question this module answers, for two selectors, is exactly one of three things:
 *
 *     DISJOINT   they provably name resources that cannot overlap
 *     OVERLAP    they provably share at least one resource
 *     UNKNOWN    neither was proven
 *
 * THREE-VALUED, NOT BOOLEAN, and that is the whole point:
 *
 *     ¬provedOverlap  ≠  provedDisjoint
 *
 * A `boolean overlaps(a, b)` returning `false` for "I cannot tell" would make the ABSENCE of analysis
 * read as its SUCCESS — the exact inversion this project refuses everywhere else. A compatibility
 * assessment consumes this relation, so a `false` here would become a `COMPATIBLE` there, and the
 * product would claim a non-interference nobody established.
 *
 * DELIBERATELY SMALL. This is not a symbol dependency engine and not a semantic analyser. It proves the
 * relations that are actually provable from the selectors themselves:
 *
 *   different domains                     → DISJOINT   (a source path is not an asset, ever)
 *   whole repository vs any source        → OVERLAP
 *   exact path vs a different exact path  → DISJOINT
 *   subtree vs a contained path/subtree   → OVERLAP
 *   two provably separate subtrees        → DISJOINT
 *   identical asset refs                  → OVERLAP; different refs → DISJOINT
 *   anything else                         → UNKNOWN
 *
 * ENVIRONMENT IS THE DELIBERATE EXCEPTION. Two differently-named environment components are NOT
 * reported DISJOINT, because nothing defines their independence: "compiler" and "python-runtime" may
 * share a libc, a lock file or a container image, and guessing that a name difference implies
 * independence is exactly the optimistic heuristic this slice must not contain. Two IDENTICAL
 * components overlap; everything else is UNKNOWN.
 *
 * Layer: L1 (domain), beside `world_basis.ts`. Not re-exported from the domain barrel.
 */
import { normalizeSourcePath, type ResourceSelector } from "./world_basis.js";

export const SELECTOR_RELATIONS = ["DISJOINT", "OVERLAP", "UNKNOWN"] as const;
export type SelectorRelation = (typeof SELECTOR_RELATIONS)[number];

/** Why a relation came out the way it did, so a witness can carry the proof rather than just its result. */
export interface SelectorRelationResult {
  readonly relation: SelectorRelation;
  readonly basis: string;
}

function result(relation: SelectorRelation, basis: string): SelectorRelationResult {
  return Object.freeze({ relation, basis });
}

/** True when `path` lies inside the subtree `prefix` (or IS it). Path-boundary aware. */
function isInsideSubtree(path: string, prefix: string): boolean {
  if (prefix === "") return true;
  if (path === prefix) return true;
  return path.startsWith(`${prefix}/`);
}

/** The `source` relation, given two normalized source selectors. */
function sourceRelation(
  left: Extract<ResourceSelector, { domain: "source" }>,
  right: Extract<ResourceSelector, { domain: "source" }>,
): SelectorRelationResult {
  // `repository` is the coarse scope: it stands for every source resource, so it overlaps anything.
  if (left.scope === "repository" || right.scope === "repository") {
    return result("OVERLAP", "the whole repository contains every source resource, so it overlaps any source selector");
  }
  if (left.scope === "path" && right.scope === "path") {
    const leftPath = normalizeSourcePath(left.path);
    const rightPath = normalizeSourcePath(right.path);
    return leftPath === rightPath
      ? result("OVERLAP", `both selectors name the source path "${leftPath}"`)
      : result("DISJOINT", `the source paths "${leftPath}" and "${rightPath}" are different files`);
  }
  if (left.scope === "subtree" && right.scope === "subtree") {
    const leftPrefix = normalizeSourcePath(left.prefix);
    const rightPrefix = normalizeSourcePath(right.prefix);
    if (isInsideSubtree(leftPrefix, rightPrefix) || isInsideSubtree(rightPrefix, leftPrefix)) {
      return result("OVERLAP", `the subtrees "${leftPrefix}" and "${rightPrefix}" nest, so they share resources`);
    }
    return result("DISJOINT", `the subtrees "${leftPrefix}" and "${rightPrefix}" are separate directories`);
  }
  // One path, one subtree: decidable by containment, and only by containment.
  const path = normalizeSourcePath(left.scope === "path" ? left.path : (right as { path: string }).path);
  const prefix = normalizeSourcePath(left.scope === "subtree" ? left.prefix : (right as { prefix: string }).prefix);
  return isInsideSubtree(path, prefix)
    ? result("OVERLAP", `the path "${path}" lies inside the subtree "${prefix}"`)
    : result("DISJOINT", `the path "${path}" does not lie inside the subtree "${prefix}"`);
}

/**
 * The relation between two selectors.
 *
 * Symmetric by construction: every branch is written so that swapping the arguments cannot change the
 * answer, and the tests assert that directly. An asymmetric disjointness proof would be a bug that
 * surfaces as a false `COMPATIBLE` in exactly one direction.
 */
export function relateSelectors(left: ResourceSelector, right: ResourceSelector): SelectorRelationResult {
  if (left.domain !== right.domain) {
    /**
     * Different domains are DIFFERENT RESOURCE UNIVERSES, not different resources within one. A source
     * path can never be an asset revision, so this is a proof rather than a conservative default — and
     * it is the reason the typed domain exists: with `string[]` paths, `src/a.ts` and an asset named
     * `src/a.ts` would be indistinguishable.
     */
    return result("DISJOINT", `"${left.domain}" and "${right.domain}" are different resource domains, so they cannot name the same resource`);
  }
  switch (left.domain) {
    case "project_semantic":
      return left.aspect === (right as { aspect: string }).aspect
        ? result("OVERLAP", `both selectors name the project semantic aspect "${left.aspect}"`)
        : result("DISJOINT", `the project semantic aspects "${left.aspect}" and "${(right as { aspect: string }).aspect}" are different obligations`);
    case "source":
      return sourceRelation(left, right as Extract<ResourceSelector, { domain: "source" }>);
    case "asset":
      return left.assetRef === (right as { assetRef: string }).assetRef
        ? result("OVERLAP", `both selectors name the canonical asset "${left.assetRef}"`)
        : result("DISJOINT", `the canonical asset refs "${left.assetRef}" and "${(right as { assetRef: string }).assetRef}" are different identities`);
    case "environment":
      /**
       * NOT disjoint on a name difference. Nothing here defines when two environment components are
       * independent, and assuming that distinct names cannot interact is precisely the optimistic
       * inference this slice refuses to make.
       */
      return left.component === (right as { component: string }).component
        ? result("OVERLAP", `both selectors name the environment component "${left.component}"`)
        : result(
            "UNKNOWN",
            `the environment components "${left.component}" and "${(right as { component: string }).component}" are differently named, and nothing here defines whether they are independent — a name difference is not an independence proof`,
          );
  }
}

/** The relation between one selector and a SET of them: OVERLAP as soon as any member overlaps. */
export function relateSelectorToSet(
  selector: ResourceSelector,
  others: readonly ResourceSelector[],
): { readonly relation: SelectorRelation; readonly witness: { readonly selector: ResourceSelector; readonly basis: string } | null } {
  let sawUnknown = false;
  let unknownBasis = "";
  for (const other of others) {
    const related = relateSelectors(selector, other);
    if (related.relation === "OVERLAP") return Object.freeze({ relation: "OVERLAP" as const, witness: Object.freeze({ selector: other, basis: related.basis }) });
    if (related.relation === "UNKNOWN") {
      sawUnknown = true;
      unknownBasis = related.basis;
    }
  }
  /**
   * A single UNKNOWN poisons the whole set: the set is disjoint only if EVERY member is provably
   * disjoint, because a set is not a disjunction. Returning DISJOINT after seeing one unprovable member
   * would be the boolean collapse this module exists to prevent.
   */
  return sawUnknown
    ? Object.freeze({ relation: "UNKNOWN" as const, witness: null })
    : Object.freeze({ relation: "DISJOINT" as const, witness: null });
}
