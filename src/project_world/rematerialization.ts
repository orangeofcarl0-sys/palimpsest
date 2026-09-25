/**
 * PLMP-LEAN-1 §D3-d2 — the ISOLATED REMATERIALIZATION runtime.
 *
 * The first effect in D3, and it is deliberately a CANDIDATE-SPACE effect: it creates a world, changes
 * files and freezes a revision, and it does NOT touch canonical Project state. Canonical source remains
 * the exclusive business of Promotion authority.
 *
 * THE ENTRY POINT TAKES AN ADMISSION IDENTITY, NOT A BAG OF FACTS. Not:
 *
 *     rematerialize({ result, targetBasis, compatible: true })        ← caller assembles the story
 *
 * but:
 *
 *     rematerialize({ admissionRef })                                  ← the system recalls the story
 *
 * so a caller cannot stitch a genuine result to a different target and a certificate that was about
 * neither. This continues the authority discipline D3-c established: `AdmissionRecord → Effect`, never
 * `CallerAssembledFacts → Effect`.
 *
 * ORDER IS THE SEMANTICS, as in D2-e1:
 *
 *     validate admission  ≺  create world  ≺  apply delta  ≺  freeze candidate  ≺  record
 *
 * with a RE-CHECK of the target immediately before the world exists. A certificate that was valid when
 * it was issued does not authorize an effect later: if the world moved from B1 to B2 in between, there
 * is no world, no candidate and no record. That is the same discipline as D2-d freezing its request
 * identity at `start` and re-asserting it before any effect.
 *
 * A FAILED REMATERIALIZATION IS A NEW FACT AND REWRITES NOTHING. The origin attempt stays COMPLETED, its
 * result stays R0, the compatibility assessment and the admission record stay historical facts, no
 * candidate exists and canonical state is unchanged. Later-stage failure does not rewrite earlier-stage
 * truth.
 *
 * THE EFFECT ENGINE NEVER EXCEEDS THE PROOF THAT AUTHORIZED IT. Compatibility was proved by D3-b and
 * admitted by D3-c; this runtime does not re-reason about it and does not invent a smarter application
 * when a clean one is impossible. A delta that cannot be applied unambiguously is `REMATERIALIZATION_FAILED`
 * — never a three-way merge, a rename heuristic or a partial application.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { admitCrossBasis, type CrossBasisAdmissionResult } from "./admission.js";
import {
  crossBasisAdmissionRefOf,
  type CrossBasisAdmissionStore,
  type CrossBasisAdmissionRecord,
} from "./admission_store.js";
import {
  materializeDerivedResultCandidate,
  materializeResultDerivation,
  type DerivedResultCandidate,
} from "./derivation.js";
import type { CompatibilityIssuer, IssuedCompatibilityAssessment } from "./issuance.js";
import type { DerivedResultCandidateStore } from "./candidate_store.js";

/* ================================================================== *
 * The port: one facet's mechanism, as a contract
 * ================================================================== */

/** The delta one rematerialization must carry, in whatever terms the facet's backend understands. */
export interface RematerializationDelta {
  readonly backend: string;
  readonly fromRevision: string;
  readonly toRevision: string;
}

export type RematerializationOutcome =
  | {
      readonly state: "MATERIALIZED";
      /** The new revision, based at the target basis. */
      readonly resultRevision: string;
      /** The world it was produced in — retained, because it may be the only copy of the work. */
      readonly worldPath: string;
    }
  /** The delta could not be applied cleanly. NOT a request for a smarter merge. */
  | { readonly state: "APPLY_FAILED"; readonly detail: string }
  /** The world could not be created or observed at all. */
  | { readonly state: "WORLD_UNAVAILABLE"; readonly detail: string };

/**
 * ONE facet's rematerializer.
 *
 * `GitSourceRematerializer` is the first implementation of the SOURCE facet. The concept is deliberately
 * wider than git: an asset rematerializer, a deterministic conversion or a format migration are all
 * derivations, and naming this contract after the mechanism would lock the old model back in.
 */
export interface ResultRematerializerPort {
  readonly adapterId: string;
  readonly mechanismVersion: string;
  /**
   * Produce a NEW revision based at `targetBasisRevision`, carrying the delta described.
   *
   * The implementation must be DETERMINISTIC and ALL-OR-NOTHING: it either produces a revision
   * containing the whole declared delta, or it reports `APPLY_FAILED`. A partially applied result must
   * never be returned as a revision, because a candidate is a claim that the work is complete.
   */
  rematerialize(input: {
    readonly delta: RematerializationDelta;
    readonly targetBasisRevision: string;
    readonly worldId: string;
  }): Promise<RematerializationOutcome>;
  /**
   * §D3-d2: make a candidate revision READABLE in the canonical object universe.
   *
   * The same seam D2-e1 established, for the same reason. A world owns its mutable git state and borrows
   * immutable objects read-only, so a revision it FROZE exists only inside the world until somebody
   * exports it — and a recorded candidate that names a revision the canonical repository cannot produce
   * would be a result identity nothing downstream can materialize.
   *
   *     object availability  ≠  canonical project state
   *
   * Exporting moves no ref, touches no working tree and revises no project state, so
   * `ΔCanonicalProjectState = 0` still holds. It only makes the bytes readable.
   */
  exportRevision(input: { readonly worldId: string; readonly revision: string }): Promise<{
    readonly imported: boolean;
    readonly detail: string;
  }>;
  /** Release a world this port created. Called only once its result is recorded or explicitly abandoned. */
  release(worldId: string): Promise<void>;
}

/* ================================================================== *
 * The runtime
 * ================================================================== */

export const REMATERIALIZATION_STATES = [
  /** A candidate was produced. */
  "MATERIALIZED",
  /** The certificate is stale or untrusted: no effect was attempted. */
  "ADMISSION_REFUSED",
  /** The delta could not be applied cleanly. No candidate, no record, nothing rewritten. */
  "REMATERIALIZATION_FAILED",
  /** This result's facets need a rematerializer the deployment does not compose. */
  "EFFECT_CAPABILITY_UNAVAILABLE",
] as const;
export type RematerializationState = (typeof REMATERIALIZATION_STATES)[number];

export interface RematerializationResult {
  readonly schemaVersion: 1;
  readonly state: RematerializationState;
  readonly candidate: DerivedResultCandidate | null;
  /** The admission decision, so a refusal can name WHY without re-deriving anything. */
  readonly admission: CrossBasisAdmissionResult;
  readonly detail: string;
}

export interface RematerializationRuntime {
  readonly adapterId: string;
  /**
   * Attempt a rematerialization. The ONLY input that carries facts is the certificate; everything else
   * is what the system already knows.
   */
  rematerialize(input: {
    /** §D3-R2: the ONLY fact-carrying input. Everything else is recalled from the record. */
    readonly admissionRef: string;
    /** The origin source facet, which is what the delta is taken from. */
    readonly originSource: { readonly backend: string; readonly fromRevision: string; readonly toRevision: string } | null;
    readonly projectId: string;
    readonly taskId: string;
    /** Authoritative outputs the derivation carries. A derivation never guesses these. */
    readonly producedAssetRefs?: readonly string[] | undefined;
  }): Promise<RematerializationResult>;
}

export function makeRematerializationRuntime(input: {
  readonly issuer: CompatibilityIssuer;
  readonly rematerializer: ResultRematerializerPort;
  /** §D3-d2: where a produced candidate is recorded, so later stages can name it by identity. */
  readonly candidates?: DerivedResultCandidateStore | undefined;
  /** §D3-R2: where admission decisions live. The effect recalls the target FROM this record. */
  readonly admissions?: CrossBasisAdmissionStore | undefined;
  /**
   * §D3-R2: how the effect RE-OBSERVES the current world immediately before creating one.
   *
   * `AdmissionStillApplies ≺ WorldCreation` cannot be satisfied by trusting the record alone: the record
   * says which world was admitted, and this says which world is CURRENT. If they disagree, the world moved
   * between admission and effect, and there is no world, no candidate and no canonical mutation.
   */
  readonly observeCurrentTarget?: ((taskId: string) => { readonly targetObservationDigest: string; readonly targetBasisRevision: string }) | undefined;
  readonly clock?: (() => string) | undefined;
}): RematerializationRuntime {
  const now = (): string => (input.clock ?? (() => new Date().toISOString()))();

  return Object.freeze({
    adapterId: `result-rematerialization:${input.rematerializer.adapterId}`,

    async rematerialize(runInput: {
      /**
       * §D3-R2: THE ONLY FACT-CARRYING INPUT IS THE ADMISSION REF.
       *
       * The result, the origin basis, the target digest and — crucially — the target REVISION all come from
       * the recorded admission, so a caller cannot admit against one world and effect in another. The
       * remaining fields are the operation's own description (which project/task, which source delta to
       * carry), not authority.
       */
      readonly admissionRef: string;
      readonly originSource: { readonly backend: string; readonly fromRevision: string; readonly toRevision: string } | null;
      readonly projectId: string;
      readonly taskId: string;
      readonly producedAssetRefs?: readonly string[] | undefined;
    }): Promise<RematerializationResult> {
      const admissionRecord = input.admissions?.recall(runInput.admissionRef) ?? null;
      if (admissionRecord === null) {
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "ADMISSION_REFUSED" as const,
          candidate: null,
          admission: Object.freeze({
            schemaVersion: 1 as const,
            state: "UNTRUSTED_PROOF" as const,
            admitted: false,
            moreEvidenceCouldHelp: false,
            issuanceDigest: null,
            detail: `admission "${runInput.admissionRef}" is not a record this authority holds, so it authorizes nothing`,
          }),
          detail: `no rematerialization was attempted: admission "${runInput.admissionRef}" is not a recorded decision`,
        });
      }
      if (!admissionRecord.admitted) {
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "ADMISSION_REFUSED" as const,
          candidate: null,
          admission: Object.freeze({
            schemaVersion: 1 as const,
            state: admissionRecord.state as "CONFLICT" | "INSUFFICIENT_PROOF" | "STALE_PROOF" | "UNTRUSTED_PROOF" | "NO_BASIS",
            admitted: false,
            moreEvidenceCouldHelp: admissionRecord.state === "INSUFFICIENT_PROOF" || admissionRecord.state === "STALE_PROOF",
            issuanceDigest: admissionRecord.issuanceRef,
            detail: admissionRecord.detail,
          }),
          detail: `no rematerialization was attempted: ${admissionRecord.detail}`,
        });
      }

      /**
       * THE TARGET COMES FROM THE RECORD — both halves of it.
       *
       * `targetBasisRevision` is read from the same observation record whose digest the certificate was
       * checked against, so the effect cannot be built at a revision the admission never named. That is the
       * binding the previous version only asserted in a comment.
       */
      const target = admissionRecord.targetObservation;
      const resultManifestDigest = admissionRecord.resultManifestDigest;
      const originBasisDigest = admissionRecord.originBasisDigest;

      /**
       * RE-OBSERVE, and refuse if the world moved since the admission was recorded.
       *
       * This is the second half of the binding: the record says which world was admitted, and this says
       * which world exists NOW. A caller cannot make them agree by assertion, and a world that moved
       * between admission and effect produces no world, no candidate and no canonical mutation — the same
       * discipline as D2-d re-asserting its frozen request before any effect.
       */
      if (input.observeCurrentTarget !== undefined) {
        const current = input.observeCurrentTarget(runInput.taskId);
        if (
          current.targetObservationDigest !== target.targetObservationDigest ||
          current.targetBasisRevision !== target.targetBasisRevision
        ) {
          return Object.freeze({
            schemaVersion: 1 as const,
            state: "ADMISSION_REFUSED" as const,
            candidate: null,
            admission: Object.freeze({
              schemaVersion: 1 as const,
              state: "STALE_PROOF" as const,
              admitted: false,
              moreEvidenceCouldHelp: true,
              issuanceDigest: admissionRecord.issuanceRef,
              detail: `the world moved between admission and effect: the admission named ${target.targetBasisRevision.slice(0, 12)}, and the current target is ${current.targetBasisRevision.slice(0, 12)}`,
            }),
            detail: `no rematerialization was attempted: the admission is stale against the current world (admitted at ${target.targetBasisRevision.slice(0, 12)}, now ${current.targetBasisRevision.slice(0, 12)})`,
          });
        }
      }
      const admission: CrossBasisAdmissionResult = Object.freeze({
        schemaVersion: 1 as const,
        state: "ADMITTED" as const,
        admitted: true,
        moreEvidenceCouldHelp: false,
        issuanceDigest: admissionRecord.issuanceRef,
        detail: admissionRecord.detail,
      });

      /**
       * STEP 2 — can this deployment carry this result's facets at all?
       *
       * A result with no source facet has nothing for a source rematerializer to move. Reporting
       * `EFFECT_CAPABILITY_UNAVAILABLE` is the honest answer; inventing an empty candidate would claim a
       * derivation that produced nothing.
       */
      if (runInput.originSource === null) {
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "EFFECT_CAPABILITY_UNAVAILABLE" as const,
          candidate: null,
          admission,
          detail:
            "this result carries no source facet, so a source rematerializer has no delta to carry — the deployment composes no rematerializer for its remaining facets, and guessing one would claim a derivation that produced nothing",
        });
      }
      const originSource = runInput.originSource;

      // STEP 3 — the effect. A world id derived from the operation identity, so a retry addresses the
      // SAME world rather than accumulating new ones.
      const derivation = materializeResultDerivation({
        kind: "REMATERIALIZATION",
        mechanism: input.rematerializer.adapterId,
        mechanismVersion: input.rematerializer.mechanismVersion,
        originResultManifestDigest: resultManifestDigest,
        originBasisDigest,
        targetBasisDigest: target.targetObservationDigest,
        admissionRef: admissionRecord.admissionRef,
      });
      /**
       * §D3-R3/R4: LOOK UP AN EXISTING CANDIDATE BEFORE EXECUTING.
       *
       * This is what makes replay converge AND release safe. Without the lookup, a retry would re-create the
       * world — which the release below has already collected — and produce a second candidate identity for
       * one operation, so `same operation → same canonical derivation` would be false exactly when the
       * release succeeded. With it, the operation is decided by its RECORD, and the world is only ever
       * materialized when there is genuinely nothing recorded yet.
       */
      const existing = input.candidates?.readByDerivation(derivation.derivationId) ?? [];
      if (existing.length > 0) {
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "MATERIALIZED" as const,
          candidate: existing[0]!,
          admission,
          detail: `this derivation already produced a candidate, so the recorded one stands and no world was created; canonical project state was not touched`,
        });
      }

      const outcome = await input.rematerializer.rematerialize({
        delta: {
          backend: originSource.backend,
          fromRevision: originSource.fromRevision,
          toRevision: originSource.toRevision,
        },
        targetBasisRevision: target.targetBasisRevision,
        worldId: derivation.derivationId,
      });

      if (outcome.state !== "MATERIALIZED") {
        /**
         * The effect failed. NOTHING is rewritten: the origin attempt, its result, the compatibility
         * assessment and the admission record are all earlier-stage facts, and a later-stage failure does
         * not reach back into them. No candidate is frozen, so a partial application cannot become an
         * authoritative result.
         */
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "REMATERIALIZATION_FAILED" as const,
          candidate: null,
          admission,
          detail:
            outcome.state === "APPLY_FAILED"
              ? `the admitted delta could not be applied cleanly (${outcome.detail}), and this runtime does not merge, rename or partially apply: no candidate was frozen and nothing else changed`
              : `the execution world could not be produced (${outcome.detail})`,
        });
      }

      /**
       * STEP 4 — EXPORT BEFORE RECORDING.
       *
       * The candidate names a revision that currently exists only inside the world. Recording it first
       * would produce a result identity the canonical repository cannot materialize, so verification and
       * every later stage would fail on a name nobody can resolve. Exporting moves no ref and changes no
       * project state: it makes the revision READABLE.
       */
      const exported = await input.rematerializer.exportRevision({
        worldId: derivation.derivationId,
        revision: outcome.resultRevision,
      });
      if (!exported.imported) {
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "REMATERIALIZATION_FAILED" as const,
          candidate: null,
          admission,
          detail: `the candidate revision could not be made readable in the canonical object universe (${exported.detail}), so recording it would name a revision nothing can materialize — no candidate was frozen`,
        });
      }

      // STEP 5 — freeze the candidate. Its base IS the target basis, which is what makes it an ordinary
      // same-basis candidate for verification, eligibility and promotion downstream.
      const candidate = materializeDerivedResultCandidate({
        projectId: runInput.projectId,
        taskId: runInput.taskId,
        derivation,
        sourceResult: {
          backend: originSource.backend,
          baseRevision: target.targetBasisRevision,
          resultRevision: outcome.resultRevision,
        },
        producedAssetRefs: runInput.producedAssetRefs ?? [],
        derivedAt: now(),
      });
      /**
       * Record it. A REPLAY of the same operation identity finds the candidate already present and keeps
       * THAT one, so a retry converges on one canonical candidate rather than accumulating identities for
       * the same work. Note what is not required: the two runs need not produce the same revision — D2-d
       * already measured that byte-identical commits from independent executions are legitimate, so the
       * convergence is on the RECORD, not on git's output.
       */
      const recorded = input.candidates?.appendOnce(candidate) ?? { state: "APPENDED" as const, candidate };
      /**
       * §D3-R4: RELEASE the world once its result is recorded.
       *
       * An ExecutionWorld is a materialized VIEW of an attempt's work, not an archive: its immutable
       * revision has been exported and its candidate recorded, so keeping the directory would accumulate
       * worlds without bound. A release failure is hygiene and must never rewrite the outcome — the
       * candidate is already durable.
       */
      try {
        await input.rematerializer.release(derivation.derivationId);
      } catch {
        /* hygiene only: the candidate is recorded, and the world can be collected later */
      }
      return Object.freeze({
        schemaVersion: 1 as const,
        state: "MATERIALIZED" as const,
        candidate: recorded.candidate,
        admission,
        detail:
          recorded.state === "APPENDED"
            ? `a candidate result was produced at ${target.targetBasisRevision.slice(0, 12)}, based on the target basis; canonical project state was not touched`
            : `this derivation had already produced this candidate, so the recorded one stands; canonical project state was not touched`,
      });
    },
  });
}
