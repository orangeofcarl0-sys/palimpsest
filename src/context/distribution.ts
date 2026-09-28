/**
 * PLMP-CTX-4 §1: the Boot/Pull distribution view over a context manifest.
 * Pure derivation - the manifest is never modified; every call recomputes
 * the split (exact references always boot, source/evidence entries fill the
 * byte budget in manifest order, the overflow becomes pull handles).
 *
 * E1-K §9: knowledge bindings add two PULL-ONLY kinds (`proof`, `reasoning`). They are never boot
 * content — the worker receives the handle and pulls the body through the canonical owner — but their
 * index bytes ARE accounted against the same boot budget (§7.8), which is why the accounting below
 * charges them right after the always-boot exact references.
 */

import { knowledgeHandleBytes, type KnowledgeBinding } from "./knowledge.js";

export interface ContextDistributionEntry {
  readonly handle: string;
  readonly kind: "exact" | "source" | "evidence" | "proof" | "reasoning" | "procedure";
  readonly ref: string;
  readonly bytes: number;
}

export interface ContextDistribution {
  readonly boot: ReadonlyArray<ContextDistributionEntry>;
  readonly handles: ReadonlyArray<Pick<ContextDistributionEntry, "handle" | "kind" | "ref">>;
}

export const DEFAULT_BOOT_BUDGET_BYTES = 40_960;

/** E1-K §7.9 / E5-P §16: the knowledge index entry is minimal — `kind · ref · handle`, no body. */
export function knowledgeIndexRefOf(binding: KnowledgeBinding): string {
  if (binding.kind === "proof") return binding.proof_claim_id;
  if (binding.kind === "reasoning") return `${binding.cell_id}/${binding.claim_id}`;
  return `${binding.procedure_id}@${binding.procedure_revision}`;
}

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
  // E1-K §7.8: the knowledge index is NOT a Work contract, so it never boots — the worker receives
  // only the pull handle — but its bytes count against the SAME budget, charged here so the number is
  // identical to the one the compile-time refusal computed.
  for (const binding of manifest.knowledge ?? []) {
    const bytes = knowledgeHandleBytes(binding.handle);
    handles.push({ handle: binding.handle, kind: binding.kind, ref: knowledgeIndexRefOf(binding) });
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

/** PLMP-CTX-4 §1.1 (E1-K §9 / E5-P §17): the handle kinds and their prefixes. */
export function contextHandle(
  kind: "exact" | "source" | "evidence" | "proof" | "reasoning" | "procedure",
  ref: string,
): string {
  switch (kind) {
    case "exact":
      return `@ctx/exact/${ref}`;
    case "source":
      return `@ctx/source/${ref}`;
    case "evidence":
      return `@ctx/evidence/${ref}`;
    case "proof":
      return `@ctx/proof/${ref}`;
    case "reasoning":
      return `@ctx/reasoning/${ref}`;
    case "procedure":
      return `@ctx/procedure/${ref}`;
  }
}

