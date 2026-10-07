/**
 * R3-S0 §"Constitutional law"/§"Truth layers"/§"Canonical graph audit" — THE FROZEN SYSTEMIC CONTRACT.
 *
 * This module is the MACHINE-READABLE form of the canonical semantics this stage audits. It is DATA plus pure
 * predicates: it introduces NO canonical owner, NO store, NO runtime behaviour. Nothing here is product code.
 *
 * WHAT IT FREEZES, before any systemic scenario or mutation runs:
 *
 *   · the constitutional law (`Task Success != System Correctness`, and an outcome cannot repair an invalid
 *     mechanism trace);
 *   · the four truth layers, with the rule that G_C/G_R correctness is NEVER inferred from Y;
 *   · the consumer-boundary law;
 *   · the four canonical lineages, expressed as ORDERED nodes;
 *   · per-node requirements: canonical owner, project scope, basis/authority;
 *   · the owner/authority/orphan invariants the audit reports PASS/FAIL on, one by one;
 *   · the durable event families with their producer, consumer/reconciler, retry behaviour and restart
 *     survival, and the four defect flags.
 *
 * NAMING HONESTY (important). The ruling names lineage nodes CONCEPTUALLY — `SovereignRemoteWorkRef`,
 * `LocalAdoption`, `RevisionReceipt`, `AuthorityDecision`, `CognitiveCandidate`, `FutureSelection` do not
 * exist as identifiers anywhere in this repository. Each conceptual node below therefore records BOTH the
 * conceptual name and the REAL identifier(s) that implement it, so the audit can assert against code rather
 * than against a vocabulary the repository never adopted. Where a concept has no single implementing type,
 * `implementedBy` lists the real types and the note says so.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/* ================================================================ §Constitutional law */

/** §"Constitutional law": the two laws, frozen as data so a report cannot restate them loosely. */
export const CONSTITUTIONAL_LAW = Object.freeze({
  taskSuccessIsNotSystemCorrectness: Object.freeze({
    id: 'TASK_SUCCESS_NE_SYSTEM_CORRECTNESS',
    statement: 'Task Success != System Correctness',
    meaning: 'a benchmark or task PASS is a statement about a behavioural outcome, never about the mechanism that produced it',
    consequence: 'no behavioural experiment may support a mechanism claim while SYSTEM_VALID is false',
  }),
  outcomeCannotRepairMechanism: Object.freeze({
    id: 'OUTCOME_SUCCESS_CANNOT_REPAIR_INVALID_MECHANISM_TRACE',
    statement: 'Outcome Success Cannot Repair an Invalid Mechanism Trace',
    meaning: 'a graph, loop, authority, runtime or mechanism-witness failure is not overridden by a successful outcome',
    consequence: 'a load-bearing mechanism failure makes the system invalid regardless of Y',
  }),
});

/* ================================================================ §Truth layers */

/**
 * §"Truth layers": FOUR explicitly separate layers.
 *
 * G_C canonical project graph, G_R runtime realization graph, G_E evidence/observation graph, Y behavioral
 * outcome. §"Truth layers" forbids inferring the correctness of G_C or G_R from Y, so the layer records carry
 * the inference rules as data rather than leaving them to prose.
 */
export const TRUTH_LAYERS = Object.freeze({
  CANONICAL_TRUTH: Object.freeze({
    id: 'CANONICAL_TRUTH',
    symbol: 'G_C',
    definition: 'the canonical project graph: the durable, append-only, hash-chained owner facts',
    observedBy: 'the canonical stores and their read models, addressed by durable identity',
    mustNotBeInferredFrom: Object.freeze(['BEHAVIORAL_OUTCOME', 'RUNTIME_TRUTH']),
  }),
  RUNTIME_TRUTH: Object.freeze({
    id: 'RUNTIME_TRUTH',
    symbol: 'G_R',
    definition: 'the runtime realization graph: what the shipped runtime actually composed and executed',
    observedBy: 'the runtime payload, the session artifact and the host telemetry',
    mustNotBeInferredFrom: Object.freeze(['BEHAVIORAL_OUTCOME']),
  }),
  EVIDENCE_TRUTH: Object.freeze({
    id: 'EVIDENCE_TRUTH',
    symbol: 'G_E',
    definition: 'the evidence/observation graph: what was recorded about an execution, with digests',
    observedBy: 'the experimental trace and its digests',
    mustNotBeInferredFrom: Object.freeze(['BEHAVIORAL_OUTCOME']),
  }),
  BEHAVIORAL_OUTCOME: Object.freeze({
    id: 'BEHAVIORAL_OUTCOME',
    symbol: 'Y',
    definition: 'the behavioral outcome: what a task produced, judged by an acceptance oracle',
    observedBy: 'an acceptance/verification module',
    mustNotBeInferredFrom: Object.freeze([]),
  }),
});

/** §"Truth layers": the forbidden inference directions, as executable data. */
export const FORBIDDEN_INFERENCES = Object.freeze([
  Object.freeze({ from: 'BEHAVIORAL_OUTCOME', to: 'CANONICAL_TRUTH', id: 'Y_IMPLIES_GC', why: 'a passing task does not prove the canonical graph is well-formed' }),
  Object.freeze({ from: 'BEHAVIORAL_OUTCOME', to: 'RUNTIME_TRUTH', id: 'Y_IMPLIES_GR', why: 'a passing task does not prove the runtime realized the intended mechanism' }),
  Object.freeze({ from: 'BEHAVIORAL_OUTCOME', to: 'EVIDENCE_TRUTH', id: 'Y_IMPLIES_GE', why: 'a passing task does not prove the evidence chain is complete' }),
  Object.freeze({ from: 'RUNTIME_TRUTH', to: 'CANONICAL_TRUTH', id: 'GR_IMPLIES_GC', why: 'what ran is not what is canonically true' }),
]);

/* ================================================================ §Consumer-boundary law */

/**
 * §"Consumer-boundary law": `Consumer Boundary Is the Authoritative Observation Boundary`.
 *
 * Each entry names the mechanism, the PRODUCER-side claim that is NOT sufficient, and the CONSUMER-side
 * observation that is required. §"Consumer-boundary law" gives four examples; all four are frozen here.
 */
export const CONSUMER_BOUNDARY_LAW = Object.freeze({
  id: 'CONSUMER_BOUNDARY_IS_AUTHORITATIVE_OBSERVATION_BOUNDARY',
  statement: 'Consumer Boundary Is the Authoritative Observation Boundary',
  rules: Object.freeze([
    Object.freeze({
      mechanism: 'CONTEXT_DELIVERY',
      insufficient: 'producer intent — the host believing it put a body in the payload',
      required: 'the actual consumer-visible session: the model-visible prompt and the governed pull response',
      observationPoint: 'the durable worker session artifact and the pull response',
    }),
    Object.freeze({
      mechanism: 'PROMOTION',
      insufficient: 'function invocation — the promotion function having been called',
      required: 'post-transaction canonical state: the canonical revision and the committed promotion fact',
      observationPoint: 'the canonical ledger after the transaction',
    }),
    Object.freeze({
      mechanism: 'ADOPTION',
      insufficient: 'remote fulfillment alone — the peer having delivered something',
      required: 'local project state and future use: an explicit local act and a later local Work that consumes it',
      observationPoint: 'the local project read model before and after, and the later local Work',
    }),
    Object.freeze({
      mechanism: 'INTENT_EVOLUTION',
      insufficient: 'proposal approval alone — an authority having said yes',
      required: 'future Work inheritance: a later attempt actually receiving the revised intent',
      observationPoint: 'the requirements delivered to a later attempt',
    }),
  ]),
});

/* ================================================================ §Canonical lineages */

/**
 * §"Canonical graph audit": THE FOUR LINEAGES.
 *
 * `conceptual` is the ruling's vocabulary. `implementedBy` names the REAL types that carry the node, so the
 * audit asserts against code. `owner` is the canonical module. `authority` is the required basis where the
 * node cannot be written without one.
 */
export const LINEAGES = Object.freeze({
  WORK: Object.freeze({
    id: 'WORK',
    name: 'Work lineage',
    conceptualPath: 'Project -> Work -> Attempt -> Result -> Verification -> Promotion -> ProjectWorld',
    nodes: Object.freeze([
      Object.freeze({
        node: 'Project',
        conceptual: 'Project',
        implementedBy: Object.freeze(['ProjectIr']),
        owner: 'src/schema',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'PROJECT_CREATED',
        note: 'the intent root; projectId scopes every other node',
      }),
      Object.freeze({
        node: 'Work',
        conceptual: 'Work',
        implementedBy: Object.freeze(['TaskEnvelope', 'TaskSpec']),
        owner: 'src/schema',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'TASK_CREATED',
        note: 'a declared unit of work; the TaskEnvelope carries its policy binding',
      }),
      Object.freeze({
        node: 'Attempt',
        conceptual: 'Attempt',
        implementedBy: Object.freeze(['AttemptRef', 'AttemptReport']),
        identifierOwners: Object.freeze({ AttemptRef: 'src/identity', AttemptReport: 'src/schema' }),
        owner: 'src/identity',
        projectScoped: true,
        requiredAuthority: 'resolveAttemptAuthorization',
        producedBy: 'ATTEMPT_CREATED',
        note: 'an attempt is authorized before it may execute',
      }),
      Object.freeze({
        node: 'Result',
        conceptual: 'Result',
        implementedBy: Object.freeze(['ResultSubjectRef', 'ResultDerivation', 'DerivedResultCandidate']),
        owner: 'src/result',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'ATTEMPT_COMPLETED',
        note: 'the observed outcome of an attempt, addressed by a durable subject ref',
      }),
      Object.freeze({
        node: 'Verification',
        conceptual: 'Verification',
        implementedBy: Object.freeze(['ProjectVerificationRun', 'ProjectVerificationRunEvent']),
        owner: 'src/project_verification',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'TASK_VERIFYING',
        note: 'INDEPENDENT of the producing attempt: a separate service judges it',
      }),
      Object.freeze({
        node: 'Promotion',
        conceptual: 'Promotion',
        implementedBy: Object.freeze(['PromotionFact', 'PromotionTerminalShape']),
        owner: 'src/domain',
        projectScoped: true,
        requiredAuthority: 'promotion eligibility (verified result + head basis)',
        producedBy: 'PROMOTION_COMMITTED',
        note: 'the ONLY path from an attempt result to canonical project state',
      }),
      Object.freeze({
        node: 'ProjectWorld',
        conceptual: 'ProjectWorld',
        implementedBy: Object.freeze(['ProjectWorldState', 'ProjectWorldBasis', 'AssetRevisionBinding']),
        owner: 'src/domain',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'PROMOTION_COMMITTED',
        note: 'the canonical world basis a later attempt inherits',
      }),
    ]),
  }),

  KNOWLEDGE: Object.freeze({
    id: 'KNOWLEDGE',
    name: 'Knowledge lineage',
    conceptualPath: 'CognitiveCandidate -> Admission -> AssetRevision -> ProjectAssetAssociation -> FutureSelection',
    nodes: Object.freeze([
      Object.freeze({
        node: 'CognitiveCandidate',
        conceptual: 'CognitiveCandidate',
        implementedBy: Object.freeze(['ProofClaimCandidate', 'ReasoningCandidate', 'ProcedureCandidate']),
        /**
         * §"Canonical graph audit": this concept is realized by THREE owners, not one. The per-identifier map
         * records the truth instead of pretending a single module owns all three; the audit resolves each
         * identifier against its own owner.
         */
        identifierOwners: Object.freeze({
          ProofClaimCandidate: 'src/proof_asset',
          ReasoningCandidate: 'src/reasoning_cell',
          ProcedureCandidate: 'src/procedures',
        }),
        owner: 'src/proof_asset',
        projectScoped: false,
        requiredAuthority: null,
        producedBy: 'CANDIDATE_PROPOSED',
        note: 'per-owner candidate types; there is no single CognitiveCandidate type in the repository',
      }),
      Object.freeze({
        node: 'Admission',
        conceptual: 'Admission',
        implementedBy: Object.freeze(['ProofPublicationDecisionRecord', 'ReasoningAdmissionDecision', 'ProcedureAdmissionOutcome']),
        identifierOwners: Object.freeze({
          ProofPublicationDecisionRecord: 'src/proof_asset',
          ReasoningAdmissionDecision: 'src/reasoning_cell',
          ProcedureAdmissionOutcome: 'src/procedures',
        }),
        owner: 'src/proof_asset',
        projectScoped: false,
        requiredAuthority: 'an admission/verification policy decision',
        producedBy: 'CLAIM_PUBLISHED',
        note: 'admission is a DECISION record, per owner; it is not called AdmissionDecision',
      }),
      Object.freeze({
        node: 'AssetRevision',
        conceptual: 'AssetRevision',
        implementedBy: Object.freeze(['ClaimAssessmentRevision', 'ProcedureRevision', 'AssetRevisionBinding']),
        identifierOwners: Object.freeze({
          ClaimAssessmentRevision: 'src/proof_asset',
          ProcedureRevision: 'src/procedures',
          AssetRevisionBinding: 'src/domain',
        }),
        owner: 'src/procedures',
        projectScoped: false,
        requiredAuthority: null,
        producedBy: 'ASSESSMENT_REVISED',
        note: 'the durable, revisioned capital body',
      }),
      Object.freeze({
        node: 'ProjectAssetAssociation',
        conceptual: 'ProjectAssetAssociation',
        implementedBy: Object.freeze(['ProjectAssetAssociation', 'CanonicalAssetRef']),
        owner: 'src/project_workspace',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'ASSET_ASSOCIATED',
        note: 'the ONLY thing that makes capital eligible for a project; without it the asset is unreachable',
      }),
      Object.freeze({
        node: 'FutureSelection',
        conceptual: 'FutureSelection',
        implementedBy: Object.freeze(['KnowledgeSelectionRequest', 'ProofKnowledgeBinding', 'ReasoningKnowledgeBinding', 'ProcedureKnowledgeBinding']),
        owner: 'src/context',
        projectScoped: true,
        requiredAuthority: 'the Context owner revalidates the selection during compilation',
        producedBy: 'CONTEXT_MANIFEST_ADDED',
        note: 'selection is a request plus its resolved bindings, not a FutureSelection type',
      }),
    ]),
  }),

  COLLABORATION: Object.freeze({
    id: 'COLLABORATION',
    name: 'Collaboration lineage',
    conceptualPath: 'Project reality/Need ground -> Need -> Commitment -> SovereignRemoteWorkRef -> Fulfillment -> LocalAdoption -> LocalContinuation',
    nodes: Object.freeze([
      Object.freeze({
        node: 'ProjectReality',
        conceptual: 'project reality / dependency (the need GROUND)',
        implementedBy: Object.freeze(['CollaborationProjectBasis', 'BlockedTaskGround', 'FailedAttemptGround']),
        owner: 'src/project_collaboration',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'TASK_BLOCKED / ATTEMPT_FAILED',
        note: 'the OBSERVED local reality a need must be grounded on. NEED_GROUND_KINDS is exactly [BLOCKED_TASK, FAILED_ATTEMPT], so a need cannot be authored from nothing; the ground is a checkable observation carrying a digest',
      }),
      Object.freeze({
        node: 'Need',
        conceptual: 'Need',
        implementedBy: Object.freeze(['CollaborationNeedCandidate', 'AcceptedNeedDeclaration', 'ContactNeed']),
        identifierOwners: Object.freeze({
          CollaborationNeedCandidate: 'src/project_collaboration',
          AcceptedNeedDeclaration: 'src/project_collaboration',
          ContactNeed: 'src/federation',
        }),
        owner: 'src/federation',
        projectScoped: true,
        requiredAuthority: 'a need admission decision (NeedAdmissionDecision) plus a currentness assessment of the ground',
        producedBy: 'CONTACT_NEED_DECLARED',
        note: 'the candidate and its acceptance receipt are owned by project_collaboration; the DURABLE canonical need is the federation ContactNeed, idempotent on the candidate digest',
      }),
      Object.freeze({
        node: 'Commitment',
        conceptual: 'Commitment',
        implementedBy: Object.freeze(['CommitmentOffer', 'CommitmentTerms', 'CommitmentState']),
        owner: 'src/federation',
        projectScoped: true,
        requiredAuthority: 'a durable need AND a prior contact request to the holder',
        producedBy: 'COMMITMENT_ACCEPTED',
        note: 'a commitment is a promise; it is NOT work authority over the peer',
      }),
      Object.freeze({
        node: 'SovereignRemoteWorkRef',
        conceptual: 'SovereignRemoteWorkRef',
        implementedBy: Object.freeze(['AttemptRef', 'PeerRef']),
        owner: 'src/identity',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'ATTEMPT_COMPLETED (in the REMOTE project ledger)',
        note: 'NO such type exists. The remote peer\'s Work stays in the peer\'s own canonical ledger; the local side holds only an opaque peer/attempt ref. This absence is the mechanism, not a gap.',
      }),
      Object.freeze({
        node: 'Fulfillment',
        conceptual: 'Fulfillment',
        implementedBy: Object.freeze(['CommitmentFulfillmentSubmission', 'FulfillmentAdmissionDecision']),
        owner: 'src/federation',
        projectScoped: true,
        requiredAuthority: 'the submitter must be the current authenticated holder',
        producedBy: 'FULFILLMENT_SUBMITTED',
        note: 'a fulfillment is a delivery claim, NOT an adoption',
      }),
      Object.freeze({
        node: 'LocalAdoption',
        conceptual: 'LocalAdoption',
        implementedBy: Object.freeze(['ProjectJournalEntry', 'promoteOpportunity']),
        owner: 'src/project_workspace',
        projectScoped: true,
        requiredAuthority: 'an explicit local act',
        producedBy: 'JOURNAL_ENTRY_RECORDED',
        note: 'NO such type exists. Adoption is an explicit local journal entry and, if it becomes work, a local promotion. Fulfillment alone never writes local truth.',
      }),
      Object.freeze({
        node: 'LocalContinuation',
        conceptual: 'LocalContinuation',
        implementedBy: Object.freeze(['TaskSpec']),
        identifierOwners: Object.freeze({ TaskSpec: 'src/schema' }),
        owner: 'src/schema',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'TASK_CREATED',
        note: 'NO such type exists in this sense. Continuation is ordinary local Work that the local project owns outright; ResultContinuationService is a DIFFERENT (D5 rework) concept and is not this node.',
      }),
    ]),
  }),

  EVOLUTION: Object.freeze({
    id: 'EVOLUTION',
    name: 'Evolution lineage',
    conceptualPath: 'Observation/Basis -> Proposal -> AuthorityDecision -> RevisionReceipt -> RevisedIntent/Organization/Runtime -> FutureWork',
    nodes: Object.freeze([
      Object.freeze({
        node: 'Observation/Basis',
        conceptual: 'Observation/Basis',
        implementedBy: Object.freeze(['OrganizationDynamicsSnapshot', 'StructuralDiagnosis', 'InterventionRecord', 'ProofClaimCandidate']),
        identifierOwners: Object.freeze({
          OrganizationDynamicsSnapshot: 'src/organization_dynamics',
          StructuralDiagnosis: 'src/organization_dynamics',
          InterventionRecord: 'src/organization_memory',
          ProofClaimCandidate: 'src/proof_asset',
        }),
        owner: 'src/organization_dynamics',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'varies by basis kind',
        note: 'a basis must be a durable, addressable fact; the intent path binds proofs, reasoning and negative results',
      }),
      Object.freeze({
        node: 'Proposal',
        conceptual: 'Proposal',
        implementedBy: Object.freeze(['ProjectIntentProposal', 'OrganizationDynamicsProposal', 'CompleteEvolutionCandidate', 'CompleteRuntimeEvolutionCandidate']),
        identifierOwners: Object.freeze({
          ProjectIntentProposal: 'src/project_intent',
          OrganizationDynamicsProposal: 'src/organization_dynamics',
          CompleteEvolutionCandidate: 'src/organization_evolution',
          CompleteRuntimeEvolutionCandidate: 'src/runtime_evolution',
        }),
        owner: 'src/project_intent',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'CANDIDATE_PROPOSED',
        note: 'a proposal is NOT canonical truth; prepare writes nothing',
      }),
      Object.freeze({
        node: 'AuthorityDecision',
        conceptual: 'AuthorityDecision',
        implementedBy: Object.freeze(['IntentAdmissionDecision', 'OrganizationEvolutionAuthorityOutcome', 'RuntimeStructuralEvolutionAuthorityOutcome', 'PROCEDURE_ADMISSION_DECISIONS']),
        identifierOwners: Object.freeze({
          IntentAdmissionDecision: 'src/project_intent',
          OrganizationEvolutionAuthorityOutcome: 'src/organization_evolution',
          RuntimeStructuralEvolutionAuthorityOutcome: 'src/runtime_evolution',
          PROCEDURE_ADMISSION_DECISIONS: 'src/procedures',
        }),
        owner: 'src/project_intent',
        projectScoped: true,
        requiredAuthority: 'an INDEPENDENT authority port; absent authority must mean UNRESOLVED, never approval',
        producedBy: 'n/a (a decision, not an event)',
        note: 'there is no single AuthorityDecision type; each owner has its own outcome union',
      }),
      Object.freeze({
        node: 'RevisionReceipt',
        conceptual: 'RevisionReceipt',
        implementedBy: Object.freeze(['AcceptedIntentReconciliationReceipt', 'AcceptedNeedDeclaration', 'EvolutionCaseRecord']),
        identifierOwners: Object.freeze({
          AcceptedIntentReconciliationReceipt: 'src/project_intent',
          AcceptedNeedDeclaration: 'src/project_collaboration',
          EvolutionCaseRecord: 'src/organization_evolution',
        }),
        owner: 'src/project_intent',
        projectScoped: true,
        requiredAuthority: 'the accepted admission decision it records (the receipt re-derives its own digest, so it cannot be forged)',
        producedBy: 'PROJECT_REVISED (payload key intent_reconciliation)',
        note: 'no single RevisionReceipt type; the intent receipt is carried on PROJECT_REVISED',
      }),
      Object.freeze({
        node: 'RevisedIntent/Organization/Runtime',
        conceptual: 'RevisedIntent/Organization/Runtime',
        implementedBy: Object.freeze(['ProjectIr', 'OrganizationDefinition', 'RuntimeScopeDefinition']),
        identifierOwners: Object.freeze({
          ProjectIr: 'src/schema',
          OrganizationDefinition: 'src/organization',
          RuntimeScopeDefinition: 'src/runtime_scope',
        }),
        owner: 'src/schema',
        projectScoped: true,
        requiredAuthority: 'the receipt that authorized the revision',
        producedBy: 'PROJECT_REVISED',
        note: 'the revised intent is a NEW ProjectIr revision, not a RevisedIntent type',
      }),
      Object.freeze({
        node: 'FutureWork',
        conceptual: 'FutureWork',
        implementedBy: Object.freeze(['TaskSpec', 'WorkWorkerTaskContext']),
        identifierOwners: Object.freeze({ TaskSpec: 'src/schema', WorkWorkerTaskContext: 'src/context' }),
        owner: 'src/work',
        projectScoped: true,
        requiredAuthority: null,
        producedBy: 'TASK_CREATED',
        note: 'the proof of evolution is that a LATER attempt receives the revised intent',
      }),
    ]),
  }),
});

/* ================================================================ §Durable event families */

/**
 * §"Event / producer-consumer audit": THE LOAD-BEARING DURABLE EVENT/RECORD FAMILIES.
 *
 * For each: the canonical owner, the producer, the consumer/reconciler, the retry/reconciliation behaviour,
 * and whether it survives a process restart. §"Event / producer-consumer audit" asks for four defect flags;
 * `flags` records the ones that APPLY, and an empty list is a positive finding rather than an omission.
 */
export const DURABLE_EVENT_FAMILIES = Object.freeze([
  Object.freeze({
    family: 'ORCHESTRATION_LEDGER',
    eventTypes: Object.freeze(['PROJECT_CREATED', 'PROJECT_REVISED', 'TASK_CREATED', 'TASK_BLOCKED', 'TASK_READY', 'TASK_STARTED', 'TASK_VERIFYING', 'TASK_SATISFIED', 'TASK_FAILED', 'TASK_STALE', 'TASK_REAUTHORIZED', 'ATTEMPT_CREATED', 'ATTEMPT_LEASED', 'ATTEMPT_STARTED', 'ATTEMPT_COMPLETED', 'ATTEMPT_FAILED', 'ATTEMPT_EXPIRED', 'ATTEMPT_CANCELLED', 'ATTEMPT_LATE_RESULT', 'EVIDENCE_ADDED', 'EVIDENCE_STALE', 'SCHEDULER_PAUSED', 'SCHEDULER_RESUMED', 'MANUAL_APPROVAL_RECORDED', 'PROMOTION_PREPARED', 'PROMOTION_GIT_STARTED', 'PROMOTION_GIT_COMPLETED', 'PROMOTION_COMMITTED', 'PROMOTION_FAILED', 'JUDGE_DECLARED', 'CANDIDATE_SELECTED', 'GATE_DEFINED', 'ROLE_TABLE_DEFINED', 'STAGE_GRAPH_DEFINED', 'CONTEXT_MANIFEST_ADDED', 'HOLD_SET', 'HOLD_CLEARED']),
    canonicalOwner: 'src/schema (EVENT_TYPES) + src/state (projection)',
    store: 'orchestration sqlite, table `events`',
    producer: 'src/tools/controller.ts (the ONE command surface)',
    consumer: 'src/state projection then the WorkReadModel read model (src/work/read_model.ts)',
    retry: 'append is CAS-guarded by expected head; a conflicting append is REFUSED, not retried blindly',
    survivesRestart: true,
    flags: Object.freeze([]),
    note: 'every event type in EVENT_TYPES has a strict payload parser, so an unknown or malformed payload is refused at the boundary',
  }),
  Object.freeze({
    family: 'PROJECT_WORKSPACE',
    eventTypes: Object.freeze(['PROJECT_WORKSPACE_OPENED', 'ASSET_ASSOCIATED']),
    canonicalOwner: 'src/project_workspace',
    store: 'association sqlite, table `project_asset_association_events`',
    producer: 'SqliteProjectAssetAssociationStore.appendAtomic',
    consumer: 'src/context resolveKnowledgeBindings (eligibility) and the workspace read model',
    retry: 'appendAtomic is CAS-guarded on the prior chain digest',
    survivesRestart: true,
    flags: Object.freeze([]),
    note: 'ASSET_ASSOCIATED is the event that makes capital ELIGIBLE; omitting it leaves the asset admitted but unreachable',
  }),
  Object.freeze({
    family: 'PROOF_PLANE',
    eventTypes: Object.freeze(['PROOF_PLANE_OPENED', 'SOURCE_REVISION_RECORDED', 'CANDIDATE_PROPOSED', 'CANDIDATE_SUBMITTED', 'VERIFICATION_RECORDED', 'CANDIDATE_ACCEPTED', 'CANDIDATE_REJECTED', 'CLAIM_PUBLISHED', 'ASSESSMENT_REVISED']),
    canonicalOwner: 'src/proof_asset',
    store: 'proof sqlite + content-addressed blob directory',
    producer: 'proof service (importSource/recordEvidence/prepareCandidate/verify/decidePublication)',
    consumer: 'src/context proof binding resolution, and the proof asset view',
    retry: 'event id is derived from type+scope+payload, so a duplicate append is idempotent',
    survivesRestart: true,
    flags: Object.freeze([]),
    note: 'the blob store is a directory, so the BYTES survive a restart even though they are not in sqlite',
  }),
  Object.freeze({
    family: 'REASONING_PLANE',
    eventTypes: Object.freeze(['REASONING_CELL_OPENED', 'CANDIDATE_SUBMITTED', 'CANDIDATE_ACCEPTED', 'CANDIDATE_REJECTED']),
    canonicalOwner: 'src/reasoning_cell',
    store: 'cells sqlite',
    producer: 'reasoning service (openCell/openBranch/submitCandidate/evaluateCandidate)',
    consumer: 'src/context reasoning binding resolution, and the reasoning frontier read',
    retry: 'chain-digest guarded; reasoningChainDigest over the prior event chain',
    survivesRestart: true,
    flags: Object.freeze([]),
    note: 'admission can later move to INACTIVE; the compile-time binding stays immutable while `current` moves',
  }),
  Object.freeze({
    family: 'COORDINATION_FEDERATION',
    eventTypes: Object.freeze(['INVOCATION_RECORDED', 'PARTICIPATION_STARTED', 'PARTICIPATION_ENDED', 'CONTACT_REQUESTED', 'CONTACT_NEED_DECLARED', 'MESSAGE_PREPARED', 'MESSAGE_DELIVERED', 'MESSAGE_RECEIVED', 'WAKE_SENT', 'ACK_RECORDED', 'COMMITMENT_OFFERED', 'COMMITMENT_ACCEPTED', 'COMMITMENT_REJECTED', 'COMMITMENT_RELEASED', 'COMMITMENT_SUPERSEDED', 'HANDOFF_OFFERED', 'HANDOFF_ACCEPTED', 'HANDOFF_REJECTED', 'FULFILLMENT_SUBMITTED', 'FULFILLMENT_DECIDED', 'COMMITMENT_FULFILLED']),
    canonicalOwner: 'src/coordination (store) + src/federation (services)',
    store: 'coordination sqlite',
    producer: 'federation service (declareContactNeed/requestContact/offerCommitment/submitFulfillment/decideFulfillment)',
    consumer: 'the federation read services and durableContactNeedScopeGuard (src/federation/federation_service.ts), which replays history',
    retry: 'per-type payload parsers; the scope guard replays history rather than trusting a caller',
    survivesRestart: true,
    flags: Object.freeze([]),
    note: 'ONE physical store carries BOTH participation and collaboration streams, kept separate by typed parsers',
  }),
  Object.freeze({
    family: 'BOUNDARY_MEMORY',
    eventTypes: Object.freeze(['WORKSPACE_OPENED', 'WORKSPACE_CLOSED', 'ARTIFACT_CREATED', 'MEMBERSHIP_PROPOSED', 'MEMBERSHIP_APPROVED', 'MEMBERSHIP_REVISION_ACCEPTED', 'REVISION_ACCEPTED']),
    canonicalOwner: 'src/boundary_memory',
    store: 'boundary sqlite',
    producer: 'BoundaryMemoryService (src/boundary_memory/service.ts)',
    consumer: 'the fulfillment output admission (a boundary_revision must be an EXACT accepted revision)',
    retry: 'event id derived from type+workspace+payload',
    survivesRestart: true,
    flags: Object.freeze([]),
    note: 'the accepted-revision set is the authority a fulfillment output is validated against',
  }),
  Object.freeze({
    family: 'PROJECT_JOURNAL',
    eventTypes: Object.freeze(['JOURNAL_ENTRY_RECORDED']),
    canonicalOwner: 'src/project_workspace',
    store: 'journal sqlite',
    producer: 'projectWorkspace.recordJournalEntry',
    consumer: 'the workspace view and promoteOpportunity (src/project_workspace), which turns an OPPORTUNITY into local Work',
    retry: 'append-only; entryId is durable',
    survivesRestart: true,
    flags: Object.freeze([]),
    note: 'this is the LOCAL ADOPTION act in code; a fulfillment without a journal entry has not been adopted',
  }),
]);

/** §"Event / producer-consumer audit": the four defect flags this audit can raise. */
export const EVENT_DEFECT_FLAGS = Object.freeze({
  WRITE_ONLY_EVENT: 'an event is produced durably but nothing ever consumes or reconciles it',
  UNCONSUMED_RECEIPT: 'a receipt is written but no later read observes it',
  CONSUMER_WITHOUT_OWNER: 'something consumes a record that has no canonical owner',
  ORPHANED_RUNTIME_PROJECTION: 'a runtime projection exists with no canonical owner behind it',
});

/* ================================================================ §System-validity gate */

/**
 * §"System-validity gate": the six load-bearing categories. `SYSTEM_VALID` is true only when ALL are green.
 * §"Gate structure" S1–S4 map onto these categories, and the mapping is recorded so a report cannot quietly
 * drop one.
 */
export const SYSTEM_VALID_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'graph_integrity', gate: 'S1', question: 'are the canonical lineages well-formed, scoped, owned and receipted?' }),
  Object.freeze({ id: 'loop_conformance', gate: 'S2', question: 'do the four loops and their cross-loop seams hold on every exercised load-bearing path?' }),
  Object.freeze({ id: 'runtime_conformance', gate: 'S2', question: 'does the shipped runtime realize the configured mechanism, with the experimental flags off?' }),
  Object.freeze({ id: 'authority_checks', gate: 'S1', question: 'is every authority-bearing write preceded by an independent decision?' }),
  Object.freeze({ id: 'evidence_chain_checks', gate: 'S2', question: 'does every conformance run record digests sufficient to re-establish what was tested?' }),
  Object.freeze({ id: 'forbidden_bypass_checks', gate: 'S3', question: 'are the known prohibited bypasses blocked, and do mutations get detected?' }),
]);

/**
 * §"System-validity gate": the allowed cell values for a loop matrix. §"Loop conformance matrix" forbids
 * collapsing into one score, and §"Gate structure" S2 requires a load-bearing NOT_EXERCISED to be called out.
 */
export const MATRIX_CELLS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', NOT_APPLICABLE: 'NOT_APPLICABLE', NOT_EXERCISED: 'NOT_EXERCISED' });

/** §"Forbidden-bypass witness": the known bypass checks, with the honest ceiling on what they prove. */
export const BYPASS_CHECKS = Object.freeze([
  Object.freeze({ id: 'NO_DIRECT_BACKING_STORE_READ', question: 'can a consumer read the backing store directly, bypassing the governed channel?' }),
  Object.freeze({ id: 'NO_UNLISTED_HANDLE_USE', question: 'can a consumer resolve a handle that was never compiled into its attempt?' }),
  Object.freeze({ id: 'NO_WRONG_ATTEMPT_REUSE', question: 'can a consumer use another attempt\'s identity or context?' }),
  Object.freeze({ id: 'NO_CONTROL_PAYLOAD_DISCOVERY', question: 'can a worker reach the host control payload where that is prohibited?' }),
  Object.freeze({ id: 'NO_AUTHORITY_BYPASS', question: 'can a write land without its required authority decision?' }),
  Object.freeze({ id: 'NO_DIRECT_REMOTE_TO_LOCAL_OWNERSHIP_CONVERSION', question: 'can a remote fulfillment become local canonical truth without an explicit local act?' }),
]);

/**
 * §"Forbidden-bypass witness": the honest claim word. §"Forbidden-bypass witness" says: do not claim
 * mathematical proof that no unknown bypass exists. This constant exists so a report cannot upgrade the claim.
 */
export const BYPASS_CLAIM = Object.freeze({
  allowed: 'KNOWN_BYPASSES_BLOCKED',
  forbidden: 'NO_BYPASS_EXISTS',
  reason: 'the checks enumerate known bypasses and block them; they are not a proof about unknown ones',
});

/* ================================================================ §Mechanism witness */

/**
 * §"Mechanism Witness": the ordered chain a mechanism claim must be able to prove. §"Mechanism Witness" says
 * that if the task succeeds without a complete required witness, the record must say
 * `TASK_SUCCESS` + `MECHANISM_NOT_DEMONSTRATED` — which is NOT mechanism success.
 */
export const MECHANISM_WITNESS_CHAIN = Object.freeze([
  Object.freeze({ step: 'canonical_precondition', question: 'what canonical fact had to be true before the mechanism could act?' }),
  Object.freeze({ step: 'runtime_projection', question: 'what did the runtime actually compose from it?' }),
  Object.freeze({ step: 'actual_consumer_visible_state', question: 'what did the CONSUMER actually see, at the boundary?' }),
  Object.freeze({ step: 'allowed_action_or_tool', question: 'which action/tool was the consumer permitted to use?' }),
  Object.freeze({ step: 'authorized_owner_interaction', question: 'which owner authorized the interaction?' }),
  Object.freeze({ step: 'durable_consequence', question: 'what durable fact resulted, addressable after a restart?' }),
]);

/** §"Mechanism Witness": the two verdicts a witness can produce, and the rule that ties them to the law. */
export const WITNESS_VERDICTS = Object.freeze({
  DEMONSTRATED: 'MECHANISM_DEMONSTRATED',
  NOT_DEMONSTRATED: 'MECHANISM_NOT_DEMONSTRATED',
  taskSuccessWithoutWitness: Object.freeze({
    outcome: 'TASK_SUCCESS',
    mechanism: 'MECHANISM_NOT_DEMONSTRATED',
    ruling: 'this is NOT mechanism success, and it may not support a mechanism claim',
  }),
});

/* ================================================================ §Loop conformance matrix */

/**
 * §"Loop conformance matrix": THE PATHS every loop is measured over.
 *
 * §"Loop conformance matrix" names six applicable paths. A loop need not have all six, so each loop declares
 * which apply; a path that APPLIES but was not driven is `NOT_EXERCISED`, and §"Gate structure" S2 requires a
 * load-bearing NOT_EXERCISED to be called out rather than silently passed.
 */
export const MATRIX_PATHS = Object.freeze([
  Object.freeze({ id: 'happy', label: 'happy path' }),
  Object.freeze({ id: 'rejection', label: 'rejection path' }),
  Object.freeze({ id: 'stale', label: 'stale/conflict path' }),
  Object.freeze({ id: 'crash', label: 'crash/reconciliation path' }),
  Object.freeze({ id: 'coldRestart', label: 'cold restart' }),
  Object.freeze({ id: 'nextGeneration', label: 'next-generation consumption/effect' }),
]);

/**
 * §"Loop conformance matrix": which paths are LOAD-BEARING for each loop.
 *
 * `notApplicable` records a path a loop genuinely does not have, WITH the reason. Everything else is
 * load-bearing, so it must reach PASS — or be called out as NOT_EXERCISED with the risk stated.
 */
export const LOOP_MATRIX_PLAN = Object.freeze({
  WORK: Object.freeze({
    name: 'Work loop',
    applies: Object.freeze(['happy', 'rejection', 'stale', 'crash', 'coldRestart', 'nextGeneration']),
    notApplicable: Object.freeze([]),
  }),
  KNOWLEDGE: Object.freeze({
    name: 'Knowledge loop',
    applies: Object.freeze(['happy', 'rejection', 'stale', 'coldRestart', 'nextGeneration']),
    /** §"Loop conformance matrix": a crash mid-knowledge-append is a STORE concern, not a loop path. */
    notApplicable: Object.freeze([Object.freeze({ path: 'crash', reason: 'the knowledge stores are append-only with CAS-guarded writes; a crash mid-append is covered by the store suites, not by this loop matrix' })]),
  }),
  COLLABORATION: Object.freeze({
    name: 'Collaboration loop',
    applies: Object.freeze(['happy', 'rejection', 'stale', 'coldRestart', 'nextGeneration']),
    notApplicable: Object.freeze([Object.freeze({ path: 'crash', reason: 'the coordination store is append-only and the federation services re-derive from history; a crash mid-append is a store concern' })]),
  }),
  EVOLUTION: Object.freeze({
    name: 'Evolution loop',
    applies: Object.freeze(['happy', 'rejection', 'stale', 'coldRestart', 'nextGeneration']),
    notApplicable: Object.freeze([Object.freeze({ path: 'crash', reason: 'the revision is one canonical append, so a crash either committed it or did not; the stale path already covers the move between prepare and apply' })]),
  }),
});

/** §"Cross-loop closure scenarios": the three seams the ruling calls load-bearing. */
export const CROSS_LOOP_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'WORK_TO_KNOWLEDGE_TO_FUTURE_WORK',
    statement: 'a completed/verified project outcome becomes admitted durable capital and is consumable by a later cold-started attempt',
    from: 'WORK',
    via: 'KNOWLEDGE',
    to: 'WORK',
  }),
  Object.freeze({
    id: 'COLLABORATION_TO_LOCAL_WORK',
    statement: 'a remote fulfillment affects future local cognition only after explicit local adoption',
    from: 'COLLABORATION',
    via: 'COLLABORATION',
    to: 'WORK',
  }),
  Object.freeze({
    id: 'EVOLUTION_TO_FUTURE_WORK',
    statement: 'a governed revision actually changes future work inputs',
    from: 'EVOLUTION',
    via: 'EVOLUTION',
    to: 'WORK',
  }),
]);

/* ================================================================ §Mutation testing */

/**
 * §"Mutation testing": THE PREREGISTERED LOAD-BEARING MUTATIONS.
 *
 * §"Gate structure" S3 requires "all preregistered load-bearing mutations detected", so the list is frozen
 * HERE, before the harness runs. Each entry names the mutation, the seam it is injected through, and the
 * systemic invariant that MUST catch it — so a mutation that escapes names a real gap rather than a missing
 * expectation.
 *
 * §"Mutation testing" forbids mutating production source permanently, so every `seam` is a test seam, a fake or
 * a dependency-injection point.
 */
export const PREREGISTERED_MUTATIONS = Object.freeze([
  Object.freeze({
    id: 'M1_DROP_CONTEXT_INDEX',
    description: 'drop the worker contextIndexText, so the model-visible prompt loses the index',
    seam: 'the worker port boundary in the test harness',
    detectedBy: 'CONSUMER_BOUNDARY_PROOF',
    loadBearing: true,
  }),
  Object.freeze({
    id: 'M2_BYPASS_ATTEMPT_ALLOWLIST',
    description: 'remove or bypass the per-attempt handle allowlist, so any handle resolves',
    seam: 'the pull resolver the host binds to the attempt',
    detectedBy: 'FORBIDDEN_BYPASS_NO_UNLISTED_HANDLE_USE',
    loadBearing: true,
  }),
  Object.freeze({
    id: 'M3_PROMOTE_WITHOUT_VERIFICATION',
    description: 'attempt promotion without a successful independent verification',
    seam: 'the promotion eligibility seam',
    detectedBy: 'WORK_LOOP_REJECTION_PATH',
    loadBearing: true,
  }),
  Object.freeze({
    id: 'M4_ACCEPT_STALE_RESULT',
    description: 'accept a stale result where optimistic concurrency should reject or continue',
    seam: 'the settlement / OCC seam',
    detectedBy: 'WORK_LOOP_STALE_PATH',
    loadBearing: true,
  }),
  Object.freeze({
    id: 'M5_OMIT_PROJECT_ASSET_ASSOCIATION',
    description: 'omit the ProjectAssetAssociation after asset admission, so the capital is unreachable',
    seam: 'the association store the harness injects',
    detectedBy: 'KNOWLEDGE_LOOP_SELECTION',
    loadBearing: true,
  }),
  Object.freeze({
    id: 'M6_EVOLUTION_RECEIPT_OLD_INTENT',
    description: 'write an evolution receipt but feed the OLD intent to future Work',
    seam: 'the intent port that supplies requirement statements to a later attempt',
    detectedBy: 'EVOLUTION_TO_FUTURE_WORK_CLOSURE',
    loadBearing: true,
  }),
]);

/** §"Mutation testing": the two outcomes a mutation can have. */
export const MUTATION_VERDICTS = Object.freeze({ DETECTED: 'MUTATION_DETECTED', ESCAPED: 'MUTATION_ESCAPED' });

/** §"Historical-defect regression": the historical defect classes this suite must be able to detect. */
export const HISTORICAL_DEFECTS = Object.freeze([
  Object.freeze({
    id: 'R1L_R2U_MISSING_INDEX_FORWARDING',
    description: 'the worker index was not forwarded to the model-visible prompt, so a selected body never reached the consumer',
    caughtBy: 'CONSUMER_BOUNDARY_PROOF',
    how: 'the proof reads the model-visible session and fails when the index/body is absent, instead of trusting that the producer put it in the payload',
  }),
  Object.freeze({
    id: 'VACUOUS_CONDITION_OR_TRUE_GATE',
    description: 'a gate whose assertion was written so it could never fail (the literal unconditional form)',
    caughtBy: 'ANTI_VACUITY_SCAN',
    how: 'the anti-vacuity scanner forbids the unconditional literal form in gate code, and this stage keeps its gates under a scanned directory',
  }),
  Object.freeze({
    id: 'R3A_NESTED_CLASSPASS_INTEGRATION',
    description: 'the qualification engine read trial[classId] instead of trial.classPass[classId], so every class collapsed into one group',
    caughtBy: 'EVIDENCE_CORRECTNESS_INTEGRATION',
    how: 'the engine is driven with REAL nested records end to end, and the analysis must reproduce from the preserved trials',
  }),
]);

/* ================================================================ the frozen contract */

/** §"Canonical graph audit": the whole contract, as one frozen value the audit and the tests both read. */
export const SYSTEMIC_CONTRACT = Object.freeze({
  schemaVersion: 1,
  stage: 'R3-S0',
  kind: 'systemic behavior closure contract (experimental; introduces no canonical owner)',
  constitutionalLaw: CONSTITUTIONAL_LAW,
  truthLayers: TRUTH_LAYERS,
  forbiddenInferences: FORBIDDEN_INFERENCES,
  consumerBoundaryLaw: CONSUMER_BOUNDARY_LAW,
  lineages: LINEAGES,
  durableEventFamilies: DURABLE_EVENT_FAMILIES,
  eventDefectFlags: EVENT_DEFECT_FLAGS,
  systemValidCategories: SYSTEM_VALID_CATEGORIES,
  matrixCells: MATRIX_CELLS,
  matrixPaths: MATRIX_PATHS,
  loopMatrixPlan: LOOP_MATRIX_PLAN,
  crossLoopScenarios: CROSS_LOOP_SCENARIOS,
  preregisteredMutations: PREREGISTERED_MUTATIONS,
  mutationVerdicts: MUTATION_VERDICTS,
  historicalDefects: HISTORICAL_DEFECTS,
  bypassChecks: BYPASS_CHECKS,
  bypassClaim: BYPASS_CLAIM,
  mechanismWitnessChain: MECHANISM_WITNESS_CHAIN,
  witnessVerdicts: WITNESS_VERDICTS,
});

/* ================================================================ pure predicates */

/** Every lineage node that claims a canonical owner, flattened. */
export function ownedNodes() {
  const out = [];
  for (const lineage of Object.values(LINEAGES)) {
    for (const node of lineage.nodes) out.push({ lineage: lineage.id, ...node });
  }
  return Object.freeze(out);
}

/** §"Canonical graph audit": nodes whose write requires an authority basis. */
export function authorityBearingNodes() {
  return ownedNodes().filter((node) => node.requiredAuthority !== null);
}

/**
 * §"Canonical graph audit": a node is PROJECT-SCOPED when its owner stores it per project. A project-scoped
 * node that no project owns is an orphan, which is what the audit's orphan check looks for.
 */
export function projectScopedNodes() {
  return ownedNodes().filter((node) => node.projectScoped === true);
}

/** §"Canonical graph audit": the ordered conceptual path of a lineage, for the lineage-shape check. */
export function lineagePath(lineageId) {
  const lineage = LINEAGES[lineageId];
  if (lineage === undefined) throw new Error(`unknown lineage ${lineageId}`);
  return Object.freeze(lineage.nodes.map((node) => node.node));
}

/** §"Truth layers": whether an inference direction is forbidden by the frozen law. */
export function inferenceForbidden(from, to) {
  return FORBIDDEN_INFERENCES.some((entry) => entry.from === from && entry.to === to);
}

/**
 * §"Mechanism Witness": judge a witness record.
 *
 * A witness is DEMONSTRATED only when every REQUIRED step is present and non-empty. A witness with an
 * incomplete chain is NOT_DEMONSTRATED regardless of whether the task succeeded — that is the whole point of
 * the law.
 */
export function judgeWitness(witness, requiredSteps = MECHANISM_WITNESS_CHAIN.map((entry) => entry.step)) {
  const missing = requiredSteps.filter((step) => {
    const value = witness?.[step];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim() === '';
    return false;
  });
  const complete = missing.length === 0;
  return Object.freeze({
    verdict: complete ? WITNESS_VERDICTS.DEMONSTRATED : WITNESS_VERDICTS.NOT_DEMONSTRATED,
    complete,
    missingSteps: Object.freeze(missing),
    /** §"Mechanism Witness": a successful task with an incomplete witness is NOT mechanism success. */
    taskSuccessWithoutWitness: !complete && witness?.taskOutcome === 'TASK_SUCCESS',
    ruling: complete ? null : WITNESS_VERDICTS.taskSuccessWithoutWitness.ruling,
  });
}

/**
 * §"System-validity gate": SYSTEM_VALID only when every load-bearing category is green.
 *
 * `categoryResults` is a record of category id -> boolean. A category that is absent counts as NOT green, so
 * this fails closed exactly as the ruling requires.
 */
export function systemValid(categoryResults) {
  const categories = SYSTEM_VALID_CATEGORIES.map((category) => Object.freeze({
    id: category.id,
    gate: category.gate,
    green: categoryResults?.[category.id] === true,
  }));
  const notGreen = categories.filter((category) => !category.green).map((category) => category.id);
  return Object.freeze({
    SYSTEM_VALID: notGreen.length === 0,
    categories: Object.freeze(categories),
    notGreen: Object.freeze(notGreen),
    note: 'a behavioural experiment may run with SYSTEM_VALID false for DIAGNOSIS, but may not support a mechanism claim',
  });
}
