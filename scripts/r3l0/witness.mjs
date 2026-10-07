/**
 * R3-L0 §16/§17 — THE CAPITAL MECHANISM WITNESS AND THE HISTORY_ONLY NEGATIVE WITNESS.
 *
 * §16 requires a `MechanismWitness` for every CAPITALIZED generation, proving as applicable that the asset
 * revision exists, the project association exists, the selection is attempt-bound, the ACTUAL
 * consumer-visible session contains the expected handles, the selected-handle digest is recorded, the governed
 * pull was invoked, the attempt allowlist authorized it, the canonical owner body digest is recorded, and no
 * direct-store/control-payload bypass occurred. It then classifies the capital state:
 *
 *   AVAILABLE  →  VISIBLE  →  PULLED  →  CONSUMED
 *
 * and says plainly: **a behavioural difference without governed consumption cannot be attributed to capital
 * content.** That sentence is the reason this module exists.
 *
 * §17 requires the mirror for every H generation: ordinary project history exists, the selected capital set is
 * EMPTY, the model-visible capital index is absent or empty as designed, no capital body entered the prompt, and
 * no prohibited backing-store discovery occurred. §17 also says, importantly:
 *
 *   Project history itself is NOT leakage. It is the control condition.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';

export const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/** §16: the ordered capital states. Each is a STRONGER claim than the one before it. */
export const CAPITAL_STATES = Object.freeze({
  ABSENT: 'ABSENT',
  AVAILABLE: 'AVAILABLE',
  VISIBLE: 'VISIBLE',
  PULLED: 'PULLED',
  CONSUMED: 'CONSUMED',
});

/**
 * §16: build the witness for ONE capitalized generation.
 *
 * `facts` are read from the generation's own report: the payload the consumer was handed, the governed pull
 * results, and the admitted capital's owner references. Nothing here is inferred from the task outcome.
 */
export function capitalWitness(input) {
  const { report, admittedCapital, expectedHandles, lessonExposed } = input;

  /** AVAILABLE: the asset revision and its project association both exist in the durable owners. */
  const assetRevisionExists = (admittedCapital?.proof ?? []).every((entry) => typeof entry.claimId === 'string' && entry.claimId.length > 0)
    && (admittedCapital?.procedure ?? []).every((entry) => entry.published === true && entry.revision !== null);
  const projectAssociationExists = input.associationsPresent === true;

  /** VISIBLE: the ACTUAL consumer-visible session carried the expected handles. */
  const visibleHandles = (report?.payload?.handles ?? []).map((entry) => entry.handle);
  const consumerVisibleHandles = expectedHandles.filter((handle) => visibleHandles.includes(handle));
  const visible = consumerVisibleHandles.length > 0;
  const modelVisibleCapitalIndexPresent = typeof report?.payload?.contextIndexText === 'string' && report.payload.contextIndexText.length > 0;

  /** PULLED: the governed pull was actually invoked for a capital handle, and the attempt allowlist permitted it. */
  const pulls = report?.governedPulls ?? [];
  const capitalPulls = pulls.filter((entry) => consumerVisibleHandles.includes(entry.handle));
  const governedPullInvoked = capitalPulls.length > 0;
  const attemptAllowlistAuthorized = capitalPulls.every((entry) => entry.resolved === true);

  /** CONSUMED: a canonical owner body came back for a capital handle. */
  const consumed = capitalPulls.some((entry) => entry.resolved === true && entry.bodyBytes > 0);

  const state = consumed ? CAPITAL_STATES.CONSUMED
    : governedPullInvoked ? CAPITAL_STATES.PULLED
      : visible ? CAPITAL_STATES.VISIBLE
        : assetRevisionExists && projectAssociationExists ? CAPITAL_STATES.AVAILABLE
          : CAPITAL_STATES.ABSENT;

  return Object.freeze({
    kind: 'CapitalMechanismWitness',
    generation: report?.generation ?? null,
    arm: 'C',
    assetRevisionExists,
    projectAssociationExists,
    selectionAttemptBound: report?.attemptId !== null && report?.attemptId !== undefined,
    consumerVisibleHandles: Object.freeze(consumerVisibleHandles),
    selectedHandleDigest: sha256(JSON.stringify(consumerVisibleHandles)),
    modelVisibleCapitalIndexPresent,
    governedPullInvoked,
    attemptAllowlistAuthorized,
    canonicalOwnerBodyDigest: sha256(JSON.stringify(capitalPulls.map((entry) => [entry.handle, entry.bodyBytes]))),
    noBypass: input.bypassClean === true,
    lessonExposed: lessonExposed === true,
    /** §16: the classification, which is what a behavioural difference must be attributable to. */
    capitalState: state,
    /** §16: the sentence that governs every interpretation of this experiment. */
    attributionRule: 'a behavioural difference without governed consumption cannot be attributed to capital content',
    /** §23: whether this generation is a genuine governed consumption EVENT. */
    consumptionEvent: consumed,
  });
}

/**
 * §17: build the negative witness for ONE HISTORY_ONLY generation.
 *
 * §17 is explicit that project history is NOT leakage — it is the control condition — so this witness checks
 * only that the CAPITAL layer was absent, not that the project had no past.
 */
export function historyOnlyWitness(input) {
  const { report, expectedHandles } = input;
  const visibleHandles = (report?.payload?.handles ?? []).map((entry) => entry.handle);
  const leakedHandles = expectedHandles.filter((handle) => visibleHandles.includes(handle));

  return Object.freeze({
    kind: 'HistoryOnlyNegativeWitness',
    generation: report?.generation ?? null,
    arm: 'H',
    /** §17/§8: the project retains ordinary durable history. */
    ordinaryHistoryExists: report?.startingRevision !== undefined && report.startingRevision !== null,
    /** §17: the selected capital set is EMPTY, and the index carries no capital handle. */
    selectedCapitalSetEmpty: leakedHandles.length === 0,
    modelVisibleCapitalIndexAbsent: (report?.payload?.compiledHandleCount ?? 0) === 0,
    noCapitalBodyInPrompt: leakedHandles.length === 0,
    noProhibitedDiscovery: input.bypassClean === true,
    leakedHandles: Object.freeze(leakedHandles),
    /** §17: stated in the record so a reader cannot mistake ordinary history for leakage. */
    note: 'project history itself is NOT leakage; it is the control condition',
  });
}

/** §16: whether a trajectory contains at least one governed consumption event. */
export function trajectoryConsumption(witnesses) {
  const events = witnesses.filter((witness) => witness.consumptionEvent === true);
  return Object.freeze({
    consumptionEvents: events.length,
    generations: witnesses.length,
    /** §23: a trajectory CONSUMES when at least one generation actually pulled a canonical body. */
    consumes: events.length > 0,
    generationsWithConsumption: Object.freeze(events.map((witness) => witness.generation)),
    /** §23: the generations where the declared lesson was exposed but no consumption happened. */
    exposedWithoutConsumption: Object.freeze(witnesses.filter((witness) => witness.lessonExposed === true && witness.consumptionEvent !== true).map((witness) => witness.generation)),
  });
}
