/**
 * PAL-FED-0 error taxonomy (EXPERIMENTAL).
 *
 * Every failure the federation leaf raises is a FederationError carrying a
 * stable machine code. Nothing here extends or replaces an Ordarium error:
 * an Ordarium failure (CAS conflict, invalid cursor, dangling StateRef) is
 * caught at the adapter boundary and re-surfaced as one of these codes with
 * the original cause preserved, so the operator always sees which layer
 * refused.
 */

export type FederationErrorCode =
  | "FED_DECODE"
  | "FED_INPUT"
  | "FED_FABRIC_MISSING"
  | "FED_FABRIC_MISMATCH"
  | "FED_PEER_UNKNOWN"
  | "FED_NOT_FOUND"
  | "FED_CONFLICT"
  | "FED_ACK_INVALID"
  | "FED_CURSOR_INVALID"
  | "FED_CONTRACT_STALE_DIGEST";

export class FederationError extends Error {
  readonly code: FederationErrorCode;

  constructor(code: FederationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FederationError";
    this.code = code;
  }
}

/** A durable record read from the coordination DB failed its strict decoder. */
export class FederationDecodeError extends FederationError {
  constructor(message: string) {
    super("FED_DECODE", message);
    this.name = "FederationDecodeError";
  }
}

/** Model/CLI input failed its strict envelope (unknown keys are rejected). */
export class FederationInputError extends FederationError {
  constructor(message: string) {
    super("FED_INPUT", message);
    this.name = "FederationInputError";
  }
}

/** The coordination DB has no fabric marker; explicit init is required. */
export class FabricMissingError extends FederationError {
  constructor(message: string) {
    super("FED_FABRIC_MISSING", message);
    this.name = "FabricMissingError";
  }
}

/** The marker disagrees with process configuration (protocol/fabric/peers). */
export class FabricMismatchError extends FederationError {
  constructor(message: string) {
    super("FED_FABRIC_MISMATCH", message);
    this.name = "FabricMismatchError";
  }
}

/** A peer referenced by configuration or input is not in the fabric. */
export class UnknownPeerError extends FederationError {
  constructor(message: string) {
    super("FED_PEER_UNKNOWN", message);
    this.name = "UnknownPeerError";
  }
}

export class FederationNotFoundError extends FederationError {
  constructor(message: string) {
    super("FED_NOT_FOUND", message);
    this.name = "FederationNotFoundError";
  }
}

/** An expectedRevision precondition lost; the caller must re-read and decide. */
export class FederationConflictError extends FederationError {
  readonly currentRevision: number | undefined;

  constructor(message: string, currentRevision?: number) {
    super("FED_CONFLICT", message);
    this.name = "FederationConflictError";
    this.currentRevision = currentRevision;
  }
}

/** The batchId does not match the pending/just-acked batch; cursor stays put. */
export class FederationAckError extends FederationError {
  constructor(message: string) {
    super("FED_ACK_INVALID", message);
    this.name = "FederationAckError";
  }
}

/**
 * A stored feed cursor was refused by Ordarium's high-water rules. Never
 * silently reset: this is surfaced for explicit operator recovery (§52/FED-C05).
 */
export class FederationCursorError extends FederationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("FED_CURSOR_INVALID", message, options);
    this.name = "FederationCursorError";
  }
}

/** Accepting a terms digest that is not the current one fails closed. */
export class StaleTermsDigestError extends FederationError {
  constructor(message: string) {
    super("FED_CONTRACT_STALE_DIGEST", message);
    this.name = "StaleTermsDigestError";
  }
}
