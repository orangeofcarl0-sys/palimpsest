/**
 * PLMP-LEAN-1 §D3-d2 + §D5-0 — the ISOLATED REMATERIALIZATION runtime.
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
 * §D5-0 FINISHED THAT SENTENCE. The paragraph above was already true of the TARGET after D3-R2 and was
 * still false of the RESULT: `originSource`, `projectId`, `taskId` and `producedAssetRefs` arrived as
 * arguments, so a caller could name a genuine admission and hand it a different delta. The effect now
 * RESOLVES the result from the identity the admission recorded (`result_resolution.ts`) and refuses if what
 * it resolves to is not the result the admission was issued for, and the freshness observer it re-checks
 * against is a REQUIRED dependency rather than an optional one.
 *
 * ORDER IS THE SEMANTICS, as in D2-e1:
 *
 *     validate admission  ≺  resolve result  ≺  re-check target  ≺  create world  ≺  apply delta
 *       ≺  freeze candidate  ≺  record
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
import type { AuthoritativeResultResolver } from "./result_resolution.js";

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
   * Attempt a rematerialization.
   *
   * §D5-0: THE ONLY INPUT IS THE ADMISSION REF. Every fact the effect needs — which result, which project
   * and task, which delta to carry, which assets it produced — is RESOLVED from the durable records the
   * admission names, so a caller cannot stitch a genuine admission to a different result or a different
   * delta. The entry point is now what D3-d claimed it was.
   */
  rematerialize(input: {
    /** The ONE fact-carrying input. Everything else is recalled or resolved from the records it names. */
    readonly admissionRef: string;
  }): Promise<RematerializationResult>;
}

export function makeRematerializationRuntime(input: {
  readonly issuer: CompatibilityIssuer;
  readonly rematerializer: ResultRematerializerPort;
  /** §D3-d2: where a produced candidate is recorded, so later stages can name it by identity. */
  readonly candidates?: DerivedResultCandidateStore | undefined;
  /** §D3-R2: where admission decisions live. The effect recalls the target AND the result FROM this record. */
  readonly admissions?: CrossBasisAdmissionStore | undefined;
  /**
   * §D5-0: how the effect resolves the RESULT an admission is about.
   *
   * This is what closed the last caller-fact seam: `originSource`, `projectId`, `taskId` and
   * `producedAssetRefs` used to arrive as arguments, so an admission could authorize an effect about a
   * different result than the one it was issued for. They are resolved from the owner now, and the
   * resolved manifest digest is cross-checked against the admission's own record.
   *
   * ABSENT ⇒ `EFFECT_CAPABILITY_UNAVAILABLE`, never a fallback to caller-supplied facts. A deployment that
   * cannot resolve results cannot carry one forward, and saying so is the honest answer.
   */
  readonly results?: AuthoritativeResultResolver | undefined;
  /**
   * §D5-0: how the effect RE-OBSERVES the current world immediately before creating one.
   *
   * REQUIRED, and the change from optional is the point. `AdmissionStillApplies ≺ WorldCreation` was
   * enforced only when a caller happened to supply this, so a deployment without it silently skipped the
   * freshness re-check and effected against a world that might have moved. A structural invariant that a
   * composition can omit is not structural; absent now means the capability is unavailable.
   */
  readonly observeCurrentTarget: (taskId: string) => {
    readonly targetObservationDigest: string;
    readonly targetBasisRevision: string;
  };
  readonly clock?: (() => string) | undefined;
}): RematerializationRuntime {
  const now = (): string => (input.clock ?? (() => new Date().toISOString()))();

  return Object.freeze({
    adapterId: `result-rematerialization:${input.rematerializer.adapterId}`,

    async rematerialize(runInput: { readonly admissionRef: string }): Promise<RematerializationResult> {
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
       * §D5-0 — RESOLVE THE RESULT. This is the seam that closed: the result is no longer described by the
       * caller, it is looked up by the identity the admission recorded.
       *
       * THREE things must agree, and each failure is its own honest answer:
       *
       *   the deployment must be able to resolve results at all      → EFFECT_CAPABILITY_UNAVAILABLE
       *   the identity must resolve to something                     → EFFECT_CAPABILITY_UNAVAILABLE
       *   what it resolves to must BE this admission's result        → ADMISSION_REFUSED
       *
       * The last is the one that matters: a resolved result whose manifest or origin basis disagrees with
       * the admission means the admission is being pointed at a result it was not issued for, and that is a
       * refusal rather than a capability gap.
       */
      if (input.results === undefined) {
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "EFFECT_CAPABILITY_UNAVAILABLE" as const,
          candidate: null,
          admission: Object.freeze({
            schemaVersion: 1 as const,
            state: "ADMITTED" as const,
            admitted: true,
            moreEvidenceCouldHelp: false,
            issuanceDigest: admissionRecord.issuanceRef,
            detail: admissionRecord.detail,
          }),
          detail:
            "this deployment composes no authoritative result resolver, so it cannot establish which result this admission is about — a rematerialization would have to take the caller's word for the delta and the result identity, which is exactly what this effect no longer accepts",
        });
      }
      const resolved = input.results.resolve(admissionRecord.resultSubjectRef);
      if (resolved === null) {
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "EFFECT_CAPABILITY_UNAVAILABLE" as const,
          candidate: null,
          admission: Object.freeze({
            schemaVersion: 1 as const,
            state: "ADMITTED" as const,
            admitted: true,
            moreEvidenceCouldHelp: false,
            issuanceDigest: admissionRecord.issuanceRef,
            detail: admissionRecord.detail,
          }),
          detail: `this deployment cannot authoritatively resolve the result this admission names (${admissionRecord.resultSubjectRef.kind} ${admissionRecord.resultSubjectRef.ref}), so the delta to carry is unknown`,
        });
      }
      if (resolved.resultManifestDigest !== resultManifestDigest || resolved.originBasisDigest !== originBasisDigest) {
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "ADMISSION_REFUSED" as const,
          candidate: null,
          admission: Object.freeze({
            schemaVersion: 1 as const,
            state: "UNTRUSTED_PROOF" as const,
            admitted: false,
            moreEvidenceCouldHelp: false,
            issuanceDigest: admissionRecord.issuanceRef,
            detail: `the admission names result ${admissionRecord.resultSubjectRef.kind} ${admissionRecord.resultSubjectRef.ref}, which resolves to a DIFFERENT result than the one this admission was issued for`,
          }),
          detail: `no rematerialization was attempted: the admission's result identity does not match the result it resolves to (admission says manifest ${resultManifestDigest.slice(0, 12)} at basis ${originBasisDigest.slice(0, 12)}; the resolved result is manifest ${resolved.resultManifestDigest.slice(0, 12)} at basis ${resolved.originBasisDigest.slice(0, 12)})`,
        });
      }
      // The task the world is observed through comes from the RESOLVED result, so the freshness check below
      // asks about the result's own task rather than about whatever the caller named.
      const taskId = resolved.taskId;
      const projectId = resolved.projectId;
      const producedAssetRefs = resolved.producedAssetRefs;

      /**
       * RE-OBSERVE, and refuse if the world moved since the admission was recorded.
       *
       * This is the second half of the binding: the record says which world was admitted, and this says
       * which world exists NOW. A caller cannot make them agree by assertion, and a world that moved
       * between admission and effect produces no world, no candidate and no canonical mutation — the same
       * discipline as D2-d re-asserting its frozen request before any effect.
       */
      {
        const current = input.observeCurrentTarget(taskId);
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
      if (resolved.sourceResult === null) {
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "EFFECT_CAPABILITY_UNAVAILABLE" as const,
          candidate: null,
          admission,
          detail:
            "this result carries no source facet, so a source rematerializer has no delta to carry — the deployment composes no rematerializer for its remaining facets, and guessing one would claim a derivation that produced nothing",
        });
      }
      const originSource = resolved.sourceResult;

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
          /**
           * The delta is the RESULT'S OWN change: from the basis it was produced at to the revision it
           * produced. Read off the resolved source facet rather than supplied by a caller, so the effect
           * carries the change the admission's result actually expresses.
           */
          fromRevision: originSource.baseRevision,
          toRevision: originSource.resultRevision,
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
      //
      // §D5-0: project, task and produced assets come from the RESOLVED result, not from the caller. That is
      // what makes the candidate an artifact of the result the admission is about, rather than of whatever
      // identity a caller attached to the same admission.
      const candidate = materializeDerivedResultCandidate({
        projectId,
        taskId,
        derivation,
        sourceResult: {
          backend: originSource.backend,
          baseRevision: target.targetBasisRevision,
          resultRevision: outcome.resultRevision,
        },
        producedAssetRefs,
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
