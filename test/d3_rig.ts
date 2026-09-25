/**
 * Rig harness for the D3-R tests. NOT a product component — it lives beside the other test helpers.
 *
 * It wires the observation authority, the issuer, the admission store, the candidate store and the
 * rematerialization runtime the way a COMPOSITION would, so a test exercises the shipped shape rather than
 * assembling its own. D3-R1 moved premise authority behind a recorder, so a test that wants an OBSERVED
 * premise must now go through a registered observer exactly as a deployment does; repeating that wiring in
 * every file would hide the property under test behind ceremony.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  admitCrossBasis,
  crossBasisAdmissionRefOf,
  makeCompatibilityIssuer,
  makeCrossBasisAdmissionStore,
  SqliteDerivedResultCandidateStore,
  makeObservationAuthority,
  makeRematerializationRuntime,
  type CompatibilityIssuer,
  type CrossBasisAdmissionRecord,
  type CrossBasisAdmissionStore,
  type DerivedResultCandidateStore,
  type ObservationAuthority,
  type ObservationRecorder,
  type PremiseReferences,
  type RematerializationRuntime,
  type ResultRematerializerPort,
} from "../src/project_world/index.js";
import type { ResourceSelector } from "../src/domain/world_basis.js";
import type { ObservationScope } from "../src/project_world/observation.js";

export interface D3Rig {
  readonly dir: string;
  readonly observations: ObservationAuthority;
  readonly issuer: CompatibilityIssuer;
  readonly admissions: CrossBasisAdmissionStore;
  readonly candidates: DerivedResultCandidateStore;
  readonly runtime: RematerializationRuntime | undefined;
  /** The identity a real deployment registers for its git source observer. */
  readonly sourceObserver: ObservationRecorder;
  readonly conservativeObserver: ObservationRecorder;
  observe(recorder: ObservationRecorder, selectors: readonly ResourceSelector[], scope?: ObservationScope): string;
  unavailable(recorder: ObservationRecorder, domain: "source" | "assets" | "environment" | "project_semantic", detail: string): string;
  admit(input: {
    readonly resultManifestDigest: string;
    readonly originBasisDigest: string;
    readonly targetObservationDigest: string;
    readonly targetBasisRevision: string;
    readonly observationRefs: PremiseReferences;
    readonly exactlyCurrent?: boolean | undefined;
    readonly unobservedFacets?: readonly string[] | undefined;
    readonly hasBasis?: boolean | undefined;
    readonly targetDetail?: string | undefined;
  }): {
    readonly certificate: ReturnType<CompatibilityIssuer["issue"]>;
    readonly admissionRef: string;
    readonly decision: ReturnType<typeof admitCrossBasis>;
    readonly record: CrossBasisAdmissionRecord;
  };
  close(): void;
}

export function makeD3Rig(input: {
  readonly rematerializer?: ResultRematerializerPort | undefined;
  readonly issuerId?: string | undefined;
  /**
   * How the effect re-observes the CURRENT world before creating one. A test supplies this because "now"
   * is the test's own notion of the world; a deployment reads it from the real repository.
   */
  readonly observeCurrentTarget?: ((taskId: string) => { readonly targetObservationDigest: string; readonly targetBasisRevision: string }) | undefined;
} = {}): D3Rig {
  const dir = mkdtempSync(join(tmpdir(), "d3rig-"));
  const observations = makeObservationAuthority({ databasePath: join(dir, "observations.sqlite") });
  const issuer = makeCompatibilityIssuer({
    issuerId: input.issuerId ?? "palimpsest-first-party",
    observations,
    databasePath: join(dir, "issuance.sqlite"),
    clock: () => "2026-09-24T00:00:00.000Z",
  });
  const admissions = makeCrossBasisAdmissionStore({ databasePath: join(dir, "admissions.sqlite") });
  const candidates = new SqliteDerivedResultCandidateStore(join(dir, "candidates.sqlite"));

  /**
   * The two identities the first-party deployment registers. A test may register MORE, which is how it
   * shows that naming the real observer's identity is no longer a route to authority.
   */
  const sourceObserver = observations.registerObserver({
    observerId: "git-source-change-observer",
    observerVersion: "1",
    mechanism: "RUNTIME_OBSERVED",
  });
  const conservativeObserver = observations.registerObserver({
    observerId: "world-materializer",
    observerVersion: "1",
    mechanism: "CONSERVATIVE_DOMAIN",
  });

  const runtime =
    input.rematerializer === undefined
      ? undefined
      : makeRematerializationRuntime({
          issuer,
          rematerializer: input.rematerializer,
          candidates,
          admissions,
          ...(input.observeCurrentTarget === undefined ? {} : { observeCurrentTarget: input.observeCurrentTarget }),
          clock: () => "2026-09-24T00:00:00.000Z",
        });

  return {
    dir,
    observations,
    issuer,
    admissions,
    candidates,
    runtime,
    sourceObserver,
    conservativeObserver,
    observe(recorder, selectors, scope) {
      return recorder.record({
        scope: scope ?? { domain: "source", scopeRef: "repo", from: "H0", to: "H1" },
        selectors,
      });
    },
    unavailable(recorder, domain, detail) {
      return recorder.unavailable({ domain, detail });
    },
    admit(admitInput) {
      const certificate = issuer.issue({
        resultManifestDigest: admitInput.resultManifestDigest,
        originBasisDigest: admitInput.originBasisDigest,
        targetObservationDigest: admitInput.targetObservationDigest,
        exactlyCurrent: admitInput.exactlyCurrent ?? false,
        observationRefs: admitInput.observationRefs,
        ...(admitInput.unobservedFacets === undefined ? {} : { unobservedFacets: admitInput.unobservedFacets }),
      });
      const admissionRef = crossBasisAdmissionRefOf({
        issuanceRef: certificate.issuanceDigest,
        targetObservationDigest: admitInput.targetObservationDigest,
      });
      const decision = admitCrossBasis({
        issuer,
        presented: certificate,
        resultManifestDigest: admitInput.resultManifestDigest,
        originBasisDigest: admitInput.originBasisDigest,
        targetObservationDigest: admitInput.targetObservationDigest,
        hasBasis: admitInput.hasBasis ?? true,
      });
      const record = admissions.record({
        schemaVersion: 1,
        admissionRef,
        issuanceRef: certificate.issuanceDigest,
        resultManifestDigest: admitInput.resultManifestDigest,
        originBasisDigest: admitInput.originBasisDigest,
        targetObservation: {
          targetObservationDigest: admitInput.targetObservationDigest,
          targetBasisRevision: admitInput.targetBasisRevision,
          detail: admitInput.targetDetail ?? "the observed target",
        },
        state: decision.state,
        admitted: decision.admitted,
        detail: decision.detail,
        recordedAt: "2026-09-24T00:00:00.000Z",
      });
      return { certificate, admissionRef, decision, record };
    },
    close() {
      try {
        admissions.close();
        candidates.close();
        issuer.close();
        observations.close();
      } finally {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // The OS reaps it.
        }
      }
    },
  };
}
