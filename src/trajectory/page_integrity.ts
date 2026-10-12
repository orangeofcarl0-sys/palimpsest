/**
 * Trajectory-H1 §7 (C3) — SESSION PAGE INTEGRITY AND COVERAGE QUALIFICATION.
 *
 * H0 derived coverage from TWO numbers:
 *
 *     returnedCount >= knownEventCount  ->  FULL
 *
 * It never inspected the returned event array. So a page that CLAIMED fifty events while carrying
 * an empty array was reported FULL, and an attributed Preview built from it was COMPLETE — the
 * F2/F3/F4 falsifiers reproduce exactly that.
 *
 * The corrected rule is a structural validation of the PAGE ITSELF. Coverage is a conclusion drawn
 * only after the page's identity, counts, sequence positions, watermark and durability metadata have
 * been checked against one another. A page that contradicts itself is INVALID, and an INVALID page
 * produces NO coverage claim, admits NO events, and cannot complete a Handoff (§7.4 fail-closed).
 *
 * Four facts the ruling insists stay separate, and this module keeps separate:
 *
 *     page structural integrity   is the page internally consistent?
 *     observed event-range coverage   how much of the KNOWN range is present?
 *     Session termination         NOT established here
 *     canonical Work completion   NOT established here
 *
 * A FULL observed range is a statement about what the SOURCE reported at read time. It is not proof
 * that a live Session has terminated, and it is not proof that Work was verified or promoted.
 *
 * Layer: L2 (`src/trajectory/`). Pure, read-only, owns no store and decides no authority.
 */
import type { DshSessionEventPage, DshEventView } from "./execution.js";
import type { EventPageCoverage } from "./handoff_preview.js";

/**
 * §7.2: the page-integrity verdict.
 *
 *   VALID_FULL              the page is consistent AND covers the whole known Session-local range
 *   VALID_PARTIAL           the page is consistent AND covers part of it
 *   VALID_UNKNOWN_COVERAGE  the page is consistent but the source reported no total
 *   NOT_APPLICABLE          no attributed read happened, so no coverage is claimed
 *   INVALID                 the page contradicts itself; nothing about it may be trusted
 */
export const PAGE_INTEGRITY_STATES = ["VALID_FULL", "VALID_PARTIAL", "VALID_UNKNOWN_COVERAGE", "NOT_APPLICABLE", "INVALID"] as const;
export type PageIntegrityState = (typeof PAGE_INTEGRITY_STATES)[number];

/**
 * §7.4: the bounded, machine-readable reasons a page is INVALID.
 *
 * A consumer reports one of these instead of a prose guess, so an operator can tell a truncated
 * source from a contradictory watermark without re-deriving the page.
 */
export const PAGE_INTEGRITY_REASONS = [
  /** The page's read state is not a successful read. */
  "READ_STATE_NOT_OK",
  /** A successful read that identifies no session cannot be attributed. */
  "PAGE_SESSION_ID_MISSING",
  /** The page names a different session than the one established by verified binding evidence. */
  "SESSION_ID_MISMATCH",
  /** The page's own header names a different session than the page. */
  "HEADER_SESSION_MISMATCH",
  /** A returned event names a different session than the page. */
  "EVENT_SESSION_MISMATCH",
  /** `returnedCount` disagrees with the actual returned event array. */
  "RETURNED_COUNT_MISMATCH",
  /** The page claims more events than it was allowed to request. */
  "RETURNED_EXCEEDS_REQUESTED_MAX",
  /** A numeric field is negative, fractional, non-finite or not a safe integer. */
  "INVALID_NUMERIC_METADATA",
  /** The returned sequences are not contiguous. */
  "SEQUENCE_NOT_CONTIGUOUS",
  /** `throughSeq` disagrees with the final returned event. */
  "WATERMARK_MISMATCH",
  /** The first returned event is not at the cursor the page says it requested. */
  "CURSOR_MISMATCH",
  /** The persisted/synthetic metadata contradicts the returned events. */
  "DURABILITY_METADATA_CONTRADICTORY",
  /** The source's known total is smaller than what the page returned. */
  "KNOWN_COUNT_BELOW_RETURNED",
] as const;
export type PageIntegrityReason = (typeof PAGE_INTEGRITY_REASONS)[number];

/** §7.3: one named check and its outcome, so a reviewer sees WHICH property failed. */
export interface PageIntegrityCheck {
  readonly check: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** §7.2: the verdict. `coverage` is the ONLY value a consumer may use to claim range coverage. */
export interface PageIntegrityVerdict {
  readonly state: PageIntegrityState;
  /** The coverage a consumer may claim. `NOT_APPLICABLE` whenever no valid attributed coverage exists. */
  readonly coverage: EventPageCoverage;
  /** The bounded reason, present only when `state === "INVALID"`. */
  readonly reason: PageIntegrityReason | null;
  readonly detail: string;
  readonly checks: readonly PageIntegrityCheck[];
}

const isNonNegativeSafeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** §7.3: read a numeric field, treating `null` as absent and anything else as requiring validity. */
function numericProblem(value: unknown, allowNull: boolean): boolean {
  if (value === null) return !allowNull;
  if (value === undefined) return !allowNull;
  return !isNonNegativeSafeInteger(value);
}

function invalid(reason: PageIntegrityReason, detail: string, checks: readonly PageIntegrityCheck[]): PageIntegrityVerdict {
  return Object.freeze({ state: "INVALID" as const, coverage: "NOT_APPLICABLE" as const, reason, detail, checks: Object.freeze([...checks]) });
}

/**
 * §7: validate a complete `DshSessionEventPage` and derive the coverage a consumer may claim.
 *
 * `expectedSessionId` is the session established by VERIFIED BINDING evidence. When it is supplied,
 * the page must name that exact session; this is the check that stops a page for session Y from being
 * presented as session X's execution history (§7.3 "Session identity").
 *
 * `admitted` is the caller's admission decision. When it is false the validator makes no coverage
 * claim at all — an unattributed page is not evidence of this attempt's execution range.
 */
export function validateSessionEventPage(input: {
  /** Absent when no page was read through this path at all. */
  readonly page: DshSessionEventPage | undefined;
  readonly admitted: boolean;
  readonly expectedSessionId?: string | null | undefined;
}): PageIntegrityVerdict {
  const { page } = input;
  const checks: PageIntegrityCheck[] = [];
  const note = (check: string, ok: boolean, detail: string): void => {
    checks.push(Object.freeze({ check, ok, detail }));
  };

  /**
   * §7.6: no page means no coverage claim. This is NOT a defect report — it is the absence of a read,
   * which is a different fact from a malformed page.
   */
  if (page === undefined || !input.admitted) {
    note("attribution", false, "no admitted page exists for this attempt, so no coverage is claimed");
    return Object.freeze({
      state: "NOT_APPLICABLE" as const,
      coverage: "NOT_APPLICABLE" as const,
      reason: null,
      detail: "no verified binding attributes an event page to this attempt, so its event range coverage is not claimed",
      checks: Object.freeze([...checks]),
    });
  }

  /* ---------------------------------------------------------------- source read state */
  if (page.readState !== "READ_OK") {
    note("readState", false, `the source read state is ${page.readState}`);
    return invalid("READ_STATE_NOT_OK", `a page whose read state is ${page.readState} cannot establish event coverage`, checks);
  }
  note("readState", true, "the source read succeeded");

  /* ---------------------------------------------------------------- session identity */
  if (page.sessionId === null || page.sessionId.length === 0) {
    note("sessionId", false, "the page identifies no session");
    return invalid("PAGE_SESSION_ID_MISSING", "a successful read that names no session cannot be attributed", checks);
  }
  note("sessionId", true, `the page names session ${page.sessionId}`);

  if (input.expectedSessionId !== undefined && input.expectedSessionId !== null && page.sessionId !== input.expectedSessionId) {
    note("attributedSessionId", false, `the page names ${page.sessionId} but the verified binding establishes ${input.expectedSessionId}`);
    return invalid(
      "SESSION_ID_MISMATCH",
      `the page is for session ${page.sessionId}, not the session ${input.expectedSessionId} established for this attempt`,
      checks,
    );
  }
  note("attributedSessionId", true, "the page's session agrees with the verified binding");

  if (page.header !== null && page.header.sessionId !== page.sessionId) {
    note("headerSessionId", false, `the header names ${page.header.sessionId} but the page names ${page.sessionId}`);
    return invalid("HEADER_SESSION_MISMATCH", "the page and its own header disagree about which session was read", checks);
  }
  note("headerSessionId", true, page.header === null ? "the source supplied no header, so no header identity is claimed" : "the header and the page agree");

  for (const event of page.events) {
    if (event.sessionId !== page.sessionId) {
      note("eventSessionId", false, `an event at seq ${String(event.seq)} names session ${event.sessionId}`);
      return invalid("EVENT_SESSION_MISMATCH", `a returned event names session ${event.sessionId} while the page names ${page.sessionId}`, checks);
    }
  }
  note("eventSessionId", true, "every returned event names the page's session");

  /* ---------------------------------------------------------------- numeric metadata */
  const numericFields: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ["returnedCount", page.returnedCount, false],
    ["knownEventCount", page.knownEventCount, true],
    ["throughSeq", page.throughSeq, true],
    ["inheritedEventCount", page.inheritedEventCount, true],
    ["requestedFromSeq", page.requestedFromSeq, false],
    ["requestedMaxEvents", page.requestedMaxEvents, false],
    ["persistedEventCount", page.persistedEventCount, true],
    ["syntheticRecoveryEventCount", page.syntheticRecoveryEventCount, true],
  ];
  for (const [name, value, allowNull] of numericFields) {
    if (numericProblem(value, allowNull)) {
      note("numericMetadata", false, `${name} is ${String(value)}, which is not a valid non-negative safe integer`);
      return invalid("INVALID_NUMERIC_METADATA", `${name} is not a usable non-negative safe integer`, checks);
    }
  }
  note("numericMetadata", true, "every numeric field is a non-negative safe integer, or explicitly absent");

  /* ---------------------------------------------------------------- event count */
  if (page.returnedCount !== page.events.length) {
    note("returnedCount", false, `the page reports ${String(page.returnedCount)} returned events but carries ${String(page.events.length)}`);
    return invalid(
      "RETURNED_COUNT_MISMATCH",
      `the page claims ${String(page.returnedCount)} returned events while its event array holds ${String(page.events.length)}`,
      checks,
    );
  }
  note("returnedCount", true, "the reported count equals the returned event array length");

  if (page.returnedCount > page.requestedMaxEvents) {
    note("requestedMaxEvents", false, `the page returned ${String(page.returnedCount)} events but was allowed ${String(page.requestedMaxEvents)}`);
    return invalid("RETURNED_EXCEEDS_REQUESTED_MAX", "the page returned more events than its own request permitted", checks);
  }
  note("requestedMaxEvents", true, "the return respects the requested page maximum");

  if (page.knownEventCount !== null && page.returnedCount > page.knownEventCount) {
    note("knownEventCount", false, `the source reports ${String(page.knownEventCount)} events but the page returned ${String(page.returnedCount)}`);
    return invalid("KNOWN_COUNT_BELOW_RETURNED", "the source's known total is smaller than what the page returned", checks);
  }
  note("knownEventCount", true, "the source's known total is consistent with the return");

  /* ---------------------------------------------------------------- sequence and watermark */
  const events: readonly DshEventView[] = page.events;
  for (let index = 1; index < events.length; index += 1) {
    if (events[index]!.seq !== events[index - 1]!.seq + 1) {
      note("sequenceContiguity", false, `seq ${String(events[index]!.seq)} follows ${String(events[index - 1]!.seq)}`);
      return invalid("SEQUENCE_NOT_CONTIGUOUS", "the returned sequences are not contiguous, so the page is not one observed range", checks);
    }
  }
  note("sequenceContiguity", true, "the returned sequences are contiguous");

  if (events.length === 0) {
    if (page.throughSeq !== null) {
      note("watermark", false, `an empty page reports throughSeq ${String(page.throughSeq)}`);
      return invalid("WATERMARK_MISMATCH", "an empty page must not report a watermark", checks);
    }
    note("watermark", true, "an empty page reports no watermark");
  } else {
    const last = events[events.length - 1]!;
    if (page.throughSeq !== last.seq) {
      note("watermark", false, `throughSeq is ${String(page.throughSeq)} but the final returned event is seq ${String(last.seq)}`);
      return invalid("WATERMARK_MISMATCH", "the page's watermark disagrees with its own final returned event", checks);
    }
    note("watermark", true, "the watermark equals the final returned event's sequence");
    if (events[0]!.seq !== page.requestedFromSeq) {
      note("cursor", false, `the first returned event is seq ${String(events[0]!.seq)} but the page requested from ${String(page.requestedFromSeq)}`);
      return invalid("CURSOR_MISMATCH", "the page does not begin at the cursor it says it requested", checks);
    }
    note("cursor", true, "the page begins at the cursor it reports requesting");
    /**
     * §7.3: the watermark must lie INSIDE the range the source reports. A page whose final event is at
     * or beyond the known total is describing a range the source says does not exist.
     */
    if (page.knownEventCount !== null && last.seq >= page.knownEventCount) {
      note("watermarkInRange", false, `the final returned event is seq ${String(last.seq)} but the source reports ${String(page.knownEventCount)} events`);
      return invalid("WATERMARK_MISMATCH", "the page's final event lies beyond the range the source reports", checks);
    }
    note("watermarkInRange", true, "every returned event lies inside the range the source reports");
  }

  /* ---------------------------------------------------------------- durability metadata */
  if (page.durabilityProvenance === "PERSISTED_AND_SYNTHETIC_SEPARATED") {
    const persisted = page.persistedEventCount;
    const synthetic = page.syntheticRecoveryEventCount;
    if (persisted === null || synthetic === null) {
      note("durabilityMetadata", false, "the page claims a separated boundary but reports no counts");
      return invalid("DURABILITY_METADATA_CONTRADICTORY", "a separated durability boundary must report both counts", checks);
    }
    if (page.knownEventCount !== null && persisted + synthetic !== page.knownEventCount) {
      note("durabilityMetadata", false, `persisted ${String(persisted)} + synthetic ${String(synthetic)} != known ${String(page.knownEventCount)}`);
      return invalid("DURABILITY_METADATA_CONTRADICTORY", "the durability counts do not add up to the source's known total", checks);
    }
    for (const event of events) {
      const expected = event.seq < persisted ? "PERSISTED_DSH_EVENT" : "SYNTHETIC_RECOVERY_EVENT";
      if (event.durability !== expected) {
        note("durabilityMetadata", false, `the event at seq ${String(event.seq)} is labelled ${event.durability} but the boundary is ${String(persisted)}`);
        return invalid("DURABILITY_METADATA_CONTRADICTORY", "an event's durability label contradicts the page's own persisted boundary", checks);
      }
    }
    note("durabilityMetadata", true, `the boundary at ${String(persisted)} is consistent with every returned event`);
  } else {
    /**
     * §7.3: an unresolved boundary is NOT an error — it is an honest absence. It never becomes a
     * `PERSISTED_DSH_EVENT` claim, and it does not by itself make the page invalid.
     */
    note("durabilityMetadata", true, "the persisted/synthetic boundary is unresolved, so no event is asserted to have been durably stored");
  }

  /* ---------------------------------------------------------------- coverage */
  if (page.knownEventCount === null) {
    note("coverage", true, "the source reported no total, so coverage is unknown rather than assumed full");
    return Object.freeze({
      state: "VALID_UNKNOWN_COVERAGE" as const,
      coverage: "UNKNOWN" as const,
      reason: null,
      detail: "the page is internally consistent, but the source reported no event total so coverage cannot be claimed",
      checks: Object.freeze([...checks]),
    });
  }

  /**
   * §7.3 "Full-range coverage": a page claims FULL only when it begins at the START of the
   * Session-local range AND every position through the known end is present. A page starting at a
   * nonzero cursor therefore cannot independently claim full coverage of the whole history — the
   * F3 falsifier is exactly that case.
   */
  const beginsAtRangeStart = page.requestedFromSeq === 0 && (events.length === 0 || events[0]!.seq === 0);
  const reachesKnownEnd = page.returnedCount === page.knownEventCount && (page.knownEventCount === 0 || events[events.length - 1]!.seq === page.knownEventCount - 1);
  const full = beginsAtRangeStart && reachesKnownEnd;

  note("coverage", true, full ? "the page covers the whole known Session-local range" : "the page covers part of the known Session-local range");
  return Object.freeze({
    state: (full ? "VALID_FULL" : "VALID_PARTIAL") as PageIntegrityState,
    coverage: (full ? "FULL" : "PARTIAL") as EventPageCoverage,
    reason: null,
    detail: full
      ? `the page covers all ${String(page.knownEventCount)} known events from the start of the session's own range`
      : `the page covers ${String(page.returnedCount)} of ${String(page.knownEventCount)} known events${beginsAtRangeStart ? "" : " and does not begin at the start of the session's own range"}`,
    checks: Object.freeze([...checks]),
  });
}

/**
 * §7: derive only the coverage a validated page may claim.
 *
 * Kept as a named function because the Preview reads this one value, and it must never be able to
 * obtain `FULL` without the full validation above having passed.
 */
export function eventPageCoverageOfPage(input: {
  readonly page: DshSessionEventPage;
  readonly admitted: boolean;
  readonly expectedSessionId?: string | null | undefined;
}): EventPageCoverage {
  return validateSessionEventPage(input).coverage;
}
