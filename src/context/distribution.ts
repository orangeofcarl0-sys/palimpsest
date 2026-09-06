/**
 * PLMP-CTX-4 §1: the Boot/Pull distribution view over a context manifest.
 * Pure derivation - the manifest is never modified; every call recomputes
 * the split (exact references always boot, source/evidence entries fill the
 * byte budget in manifest order, the overflow becomes pull handles).
 */

export interface ContextDistributionEntry {
  readonly handle: string;
  readonly kind: "exact" | "source" | "evidence";
  readonly ref: string;
  readonly bytes: number;
}

export interface ContextDistribution {
  readonly boot: ReadonlyArray<ContextDistributionEntry>;
  readonly handles: ReadonlyArray<Pick<ContextDistributionEntry, "handle" | "kind" | "ref">>;
}

export const DEFAULT_BOOT_BUDGET_BYTES = 40_960;

export function distributeContext(
  manifest: import("./manifest.js").ContextManifest,
  options?: { readonly bootBudgetBytes?: number },
): ContextDistribution {
  const budget = options?.bootBudgetBytes ?? DEFAULT_BOOT_BUDGET_BYTES;
  const boot: ContextDistributionEntry[] = [];
  const handles: Array<Pick<ContextDistributionEntry, "handle" | "kind" | "ref">> = [];
  let used = 0;

  // Exact references always boot: they are the contracts the attempt must
  // honour (§9) - their bytes count against the budget but they never overflow.
  for (const exact of manifest.exact) {
    const bytes = Buffer.byteLength(`${exact.ref}${exact.digest}`, "utf8");
    boot.push({ handle: `@ctx/exact/${exact.ref}`, kind: "exact", ref: exact.ref, bytes });
    used += bytes;
  }
  for (const source of manifest.source) {
    const handle = `@ctx/source/${source.path}`;
    const bytes = Buffer.byteLength(source.snippet, "utf8") + Buffer.byteLength(source.path, "utf8");
    if (used + bytes <= budget) {
      boot.push({ handle, kind: "source", ref: source.path, bytes });
      used += bytes;
    } else {
      handles.push({ handle, kind: "source", ref: source.path });
    }
  }
  for (const evidenceId of manifest.evidence) {
    const handle = `@ctx/evidence/${evidenceId}`;
    const bytes = Buffer.byteLength(evidenceId, "utf8");
    if (used + bytes <= budget) {
      boot.push({ handle, kind: "evidence", ref: evidenceId, bytes });
      used += bytes;
    } else {
      handles.push({ handle, kind: "evidence", ref: evidenceId });
    }
  }
  return { boot, handles };
}

/** PLMP-CTX-4 §1.1: the three handle kinds and their prefixes. */
export function contextHandle(kind: "exact" | "source" | "evidence", ref: string): string {
  return kind === "exact" ? `@ctx/exact/${ref}` : kind === "source" ? `@ctx/source/${ref}` : `@ctx/evidence/${ref}`;
}
