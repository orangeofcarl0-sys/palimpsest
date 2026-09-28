/**
 * R1-R §6/§8 — SCENARIO C, THE STARTING POINT (H0).
 *
 * A DELIBERATELY INCOMPLETE BUT PLAUSIBLE implementation (§8 step 1). It reads the broad goal
 * literally — "apply an event stream to the current state" — and does the obvious thing: walk the array
 * and apply each event as it arrives.
 *
 * It therefore commits the pre-paid cognitive mistake this scenario measures:
 *
 *     mutate/reduce before replay/sequence validity is established
 *
 * THE MISTAKE IS OBSERVABLY DESTRUCTIVE HERE, which is what makes it measurable. The caller owns the
 * `state` object and may still be holding it when this function is called. Because this version mutates
 * as it validates, a history that turns out to be invalid part-way through leaves the caller's state
 * PARTIALLY APPLIED — the caller's own object is corrupted by a call that then reported failure. The
 * correct implementation establishes replay validity first and therefore never touches the caller's
 * object on a rejected history.
 *
 * The mistake is also SUBSTANTIVE rather than cosmetic because the result depends on the ORDER the
 * events are applied in: an entity written at one position and deleted at a later one ends up in
 * different states depending on which of the two is applied last. A reducer that folds the delivered
 * array rather than the log's own sequence order can therefore return a state the log does not imply.
 */

export class StreamError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StreamError";
    this.code = code;
  }
}

export interface Event {
  readonly id: string;
  /** The position the log assigned this event when it accepted it. */
  readonly seq: number;
  readonly op?: "SET" | "DELETE";
  readonly kind?: "SET" | "DELETE" | "PUT";
  readonly v?: unknown;
  readonly value?: unknown;
  readonly payload?: unknown;
  readonly data?: unknown;
}

export type State = Record<string, unknown>;

const opOf = (event: Event): string => event.op ?? event.kind ?? "SET";

const valueOf = (event: Event): unknown => {
  if ("v" in event) return event.v;
  if ("value" in event) return event.value;
  if ("payload" in event) return event.payload;
  if ("data" in event) return event.data;
  return null;
};

/** Apply an event stream to the current state. */
export function applyEventStream(state: State, events: readonly Event[]): State {
  for (const event of events) {
    // Apply each event as it arrives.
    if (event === null || typeof event !== "object") throw new StreamError("INVALID_EVENT", "every event must be an object");
    if (typeof event.id !== "string" || event.id.length === 0) throw new StreamError("INVALID_IDENTITY", "every event must carry a non-empty string id");
    if (opOf(event) === "DELETE") delete state[event.id];
    else state[event.id] = valueOf(event);
  }

  return state;
}
