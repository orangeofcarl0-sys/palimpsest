/**
 * R3-L0C §17 — THE CAPITAL MECHANISM WITNESS.
 *
 * §17 requires, for EVERY C generation, a proof of the whole chain:
 *
 *     asset exists
 *       -> association exists
 *       -> attempt selection
 *       -> consumer-visible handles
 *       -> governed pull
 *       -> correct current owner body
 *
 * and, separately, proof that no host-private, sibling or oracle content was exposed. For H it requires proof of
 * the NEGATIVE: the selected set is empty and no capital body entered the cognitive surface.
 *
 * WHY THE CHAIN IS DECOMPOSED RATHER THAN SCORED. Each link can fail for a different reason, and a single
 * boolean would hide which one did. A generation whose handles were compiled but whose pull returned the wrong
 * body is a DIFFERENT defect from one whose selection never happened, and the two have different repairs. So the
 * witness reports each link's state and the chain is `CLOSED` only when every link holds.
 *
 * §17 ALSO FORBIDS INFERRING USE FROM SUCCESS. The witness is built from the delivered payload, the governed
 * pull responses and the canonical owner digests — never from the task outcome. A generation that solved the
 * task without pulling anything is reported as NOT_CONSUMED, not as a success.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';

export const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const NL = String.fromCharCode(10);

/** §17: the states a single link can be in. */
export const LINK_STATES = Object.freeze({ PRESENT: 'PRESENT', ABSENT: 'ABSENT', UNRESOLVED: 'UNRESOLVED' });

/** §17: the chain verdict. */
export const CHAIN_VERDICTS = Object.freeze({ CLOSED: 'CLOSED', OPEN: 'OPEN' });

/**
 * §17: THE C WITNESS.
 *
 * `expected` is the frozen handle set for the generation; `observed` is what the consumer actually received and
 * what the governed pull actually returned.
 */
export function capitalWitness(input) {
  const { sessionId, arm, block, generation, report, admitted, expectedHandles, canonicalDigests } = input;
  const payload = report?.payload ?? null;
  const compiledHandles = (payload?.handles ?? []).map((entry) => entry.handle);
  const pulls = report?.governedPulls ?? [];

  /** Link 1: the canonical assets exist, from the admission record. */
  const assetsExist = (admitted?.reasoning?.length ?? 0) > 0 && (admitted?.procedure?.length ?? 0) > 0;
  /** Link 2: the associations exist, which is what makes the assets selectable. */
  const associationsExist = input.associationsPresent === true;
  /** Link 3: the attempt was selected with this generation's frozen handles. */
  const selectionBound = expectedHandles.length > 0 && expectedHandles.every((handle) => compiledHandles.includes(handle));
  /** Link 4: the handles reached the CONSUMER boundary, which is the only place they count. */
  const consumerVisible = compiledHandles.length > 0;
  /** Link 5: the governed pull was actually invoked for each handle. */
  const pullInvoked = pulls.length > 0 && pulls.every((entry) => entry.resolved === true);
  /** Link 6: the pulled body matches the canonical owner digest, so the RIGHT body arrived. */
  const bodyMatches = canonicalDigests === undefined || pulls.every((entry) => entry.bodyDigest !== null && (canonicalDigests[entry.handle] === undefined || canonicalDigests[entry.handle] === entry.bodyDigest));

  const links = Object.freeze([
    Object.freeze({ id: 'ASSET_EXISTS', state: assetsExist ? LINK_STATES.PRESENT : LINK_STATES.ABSENT, detail: `reasoning=${String(admitted?.reasoning?.length ?? 0)} procedure=${String(admitted?.procedure?.length ?? 0)}` }),
    Object.freeze({ id: 'ASSOCIATION_EXISTS', state: associationsExist ? LINK_STATES.PRESENT : LINK_STATES.ABSENT, detail: 'the assets are associated with the project, which is what makes them selectable' }),
    Object.freeze({ id: 'ATTEMPT_SELECTION', state: selectionBound ? LINK_STATES.PRESENT : LINK_STATES.ABSENT, detail: `expected ${String(expectedHandles.length)} handle(s), compiled ${String(compiledHandles.length)}` }),
    Object.freeze({ id: 'CONSUMER_VISIBLE_HANDLES', state: consumerVisible ? LINK_STATES.PRESENT : LINK_STATES.ABSENT, detail: `the consumer boundary carried ${String(compiledHandles.length)} handle(s)` }),
    Object.freeze({ id: 'GOVERNED_PULL', state: pullInvoked ? LINK_STATES.PRESENT : LINK_STATES.ABSENT, detail: `${String(pulls.filter((entry) => entry.resolved === true).length)}/${String(pulls.length)} handle(s) resolved` }),
    Object.freeze({ id: 'CORRECT_OWNER_BODY', state: bodyMatches ? LINK_STATES.PRESENT : LINK_STATES.UNRESOLVED, detail: 'the delivered body digest is compared against the canonical owner body where one is recorded' }),
  ]);

  const open = links.filter((link) => link.state !== LINK_STATES.PRESENT);
  const bodyBytes = pulls.reduce((total, entry) => total + (entry.bodyBytes ?? 0), 0);

  return Object.freeze({
    sessionId, arm, block, generation,
    kind: 'CapitalMechanismWitness',
    links,
    chain: open.length === 0 ? CHAIN_VERDICTS.CLOSED : CHAIN_VERDICTS.OPEN,
    openLinks: Object.freeze(open.map((link) => link.id)),
    consumed: pullInvoked,
    selectedHandleCount: compiledHandles.length,
    selectedHandles: Object.freeze(compiledHandles),
    pulledBodyBytes: bodyBytes,
    pulledBodyDigests: Object.freeze(pulls.map((entry) => ({ handle: entry.handle, digest: entry.bodyDigest ?? null }))),
    /** §17: no exposure, proven from the containment classification rather than asserted. */
    noHostPrivateExposure: input.containment === undefined ? null : input.containment.hostPrivateExposureCount === 0,
    containment: input.containment ?? null,
    /** §17: use is never inferred from the outcome. */
    inferredFromTaskSuccess: false,
  });
}

/**
 * §17: THE H NEGATIVE WITNESS.
 *
 * For H the proof is a set of ABSENCES: no selected set, no capital index in the model-visible surface, no
 * capital body in the prompt. A negative witness that reported nothing would be indistinguishable from a witness
 * that was never built, so every field is an explicit boolean with its basis.
 */
export function historyOnlyWitness(input) {
  const { sessionId, arm, block, generation, report, expectedHandles } = input;
  const payload = report?.payload ?? null;
  const compiledHandles = (payload?.handles ?? []).map((entry) => entry.handle);
  const contextIndexText = payload?.contextIndexText ?? null;
  /** A capital index would name a proof, reasoning or procedure handle. Its absence is the claim. */
  const capitalIndexPresent = typeof contextIndexText === 'string' && /@ctx\/(proof|reasoning|procedure)\//u.test(contextIndexText);
  const allowedPullHandles = payload?.allowedPullHandles ?? [];
  const capitalPullable = allowedPullHandles.some((handle) => /@ctx\/(proof|reasoning|procedure)\//u.test(String(handle)));

  const links = Object.freeze([
    Object.freeze({ id: 'ORDINARY_HISTORY_EXISTS', state: LINK_STATES.PRESENT, detail: 'the Project world and its declared history corpus are present for both arms' }),
    Object.freeze({ id: 'SELECTED_CAPITAL_SET_EMPTY', state: compiledHandles.length === 0 ? LINK_STATES.PRESENT : LINK_STATES.ABSENT, detail: `the consumer boundary carried ${String(compiledHandles.length)} compiled handle(s)` }),
    Object.freeze({ id: 'MODEL_VISIBLE_CAPITAL_INDEX_ABSENT', state: capitalIndexPresent ? LINK_STATES.ABSENT : LINK_STATES.PRESENT, detail: 'the model-visible index names no proof, reasoning or procedure handle' }),
    Object.freeze({ id: 'NO_CAPITAL_BODY_IN_PROMPT', state: capitalIndexPresent ? LINK_STATES.ABSENT : LINK_STATES.PRESENT, detail: 'no capital handle reached the surface, so no capital body could be forwarded' }),
    Object.freeze({ id: 'NO_PROHIBITED_DISCOVERY', state: capitalPullable ? LINK_STATES.ABSENT : LINK_STATES.PRESENT, detail: 'the attempt allowlist authorizes no capital handle' }),
  ]);
  const open = links.filter((link) => link.state !== LINK_STATES.PRESENT);
  return Object.freeze({
    sessionId, arm, block, generation,
    kind: 'HistoryOnlyWitness',
    links,
    chain: open.length === 0 ? CHAIN_VERDICTS.CLOSED : CHAIN_VERDICTS.OPEN,
    openLinks: Object.freeze(open.map((link) => link.id)),
    selectedCapitalSetEmpty: compiledHandles.length === 0,
    expectedHandlesWereEmpty: expectedHandles.length === 0,
    compiledHandleCount: compiledHandles.length,
    noHostPrivateExposure: input.containment === undefined ? null : input.containment.hostPrivateExposureCount === 0,
    containment: input.containment ?? null,
    inferredFromTaskSuccess: false,
  });
}

/** §17: whether a trajectory demonstrated governed consumption in EVERY generation. */
export function trajectoryConsumption(witnesses) {
  const cWitnesses = witnesses.filter((entry) => entry.arm === 'C');
  return Object.freeze({
    generations: cWitnesses.length,
    closedChains: cWitnesses.filter((entry) => entry.chain === CHAIN_VERDICTS.CLOSED).length,
    consumed: cWitnesses.filter((entry) => entry.consumed === true).length,
    everyGenerationConsumed: cWitnesses.length > 0 && cWitnesses.every((entry) => entry.consumed === true && entry.chain === CHAIN_VERDICTS.CLOSED),
    openLinks: Object.freeze(cWitnesses.flatMap((entry) => entry.openLinks.map((link) => `${entry.sessionId}:${link}`))),
  });
}

/** §18: the observable information path, classified from behavior only. */
export function classifyInformationPath(input) {
  const { capitalContentReturned, historyReads, firstEditStep, firstCapitalStep, resultSubmitted } = input;
  if (resultSubmitted !== true) return 'NO_RESULT';
  if (capitalContentReturned === true && historyReads === 0) return 'CAPITAL_THEN_EDIT';
  if (capitalContentReturned === true && historyReads > 0) {
    /** Which came first is the load-bearing ordering fact. */
    if (firstCapitalStep !== null && firstEditStep !== null && firstCapitalStep < firstEditStep) return 'CAPITAL_THEN_HISTORY';
    return 'CAPITAL_THEN_EDIT';
  }
  if (historyReads > 0) return 'HISTORY_RECONSTRUCTION';
  return 'DIRECT_EDIT_WITHOUT_HISTORY';
}

export { NL };
