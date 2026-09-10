/**
 * PAL-FED-0 experimental federation — frozen protocol constants.
 *
 * This is an EXPERIMENTAL substrate (PAL-FED-0). Nothing here is UAS-frozen
 * and nothing here may be imported by the canonical project runtime. The
 * module is a removable leaf: deleting src/federation/ must leave the rest of
 * Palimpsest compiling and behaving identically.
 *
 * Size discipline (§36): collaboration is a boundary-delta channel, not a
 * file transfer protocol. The bounds below are deliberately far smaller than
 * Ordarium's 1 MiB state-value ceiling; they exist to discourage context
 * dumping, not to be maximal.
 */

/** The only protocol string this experiment writes into a fabric marker. */
export const PAL_FED_PROTOCOL = "PAL-FED-0" as const;

/** Durable record schema generation for every PAL-FED-0 object. */
export const PAL_FED_SCHEMA_VERSION = 1 as const;

/** Host-defined fabric identity marker (ordinary Ordarium state). */
export const NS_META = "plmp.collab.meta" as const;
export const FABRIC_KEY = "fabric" as const;

/** Immutable CollaborationEvent subjects; key = eventId, revision always 1. */
export const NS_EVENT = "plmp.collab.event" as const;

/** Revisioned BoundaryContract subjects; key = contractId. */
export const NS_CONTRACT = "plmp.collab.contract" as const;

/** Per-peer inbox/delivery-progress state; key = PeerRef. */
export const NS_PEERSTATE = "plmp.collab.peerstate" as const;

/** Page size for StateChangeFeed scans; the feed is scanned in bounded pages. */
export const FEED_PAGE_LIMIT = 200;

/** Bounded re-read/retry budget for peer-state CAS loops. */
export const PEERSTATE_CAS_RETRIES = 8;

// --- Boundary-delta bounds (§36) -------------------------------------------------

/** Event body: a boundary delta is a paragraph, never a document. */
export const EVENT_BODY_MIN_CHARS = 1;
export const EVENT_BODY_MAX_CHARS = 8_192;

/** Artifacts are provenance locators, not payloads. */
export const ARTIFACTS_MAX = 16;
export const ARTIFACT_LOCATOR_MAX_CHARS = 2_048;
export const ARTIFACT_LABEL_MAX_CHARS = 256;
export const ARTIFACT_DIGEST_MAX_CHARS = 128;

/** Event kind count is closed; the union lives in types.ts. */
export const EVENT_KIND_MAX_CHARS = 32;

/** Contract terms: small, complete, hand-negotiable. */
export const CONTRACT_TITLE_MIN_CHARS = 1;
export const CONTRACT_TITLE_MAX_CHARS = 512;
export const CONTRACT_TERM_MAX_ITEMS = 64;
export const CONTRACT_TERM_MIN_CHARS = 1;
export const CONTRACT_TERM_MAX_CHARS = 2_048;
export const CONTRACT_TERMS_LISTS = [
  "requirements",
  "constraints",
  "interfaceNotes",
  "acceptanceCriteria",
  "openQuestions",
] as const;

/** Identifier bounds: adapter-owned, opaque, bounded. */
export const ID_MAX_CHARS = 128;
export const ID_PREFIX_EVENT = "evt_";
export const ID_PREFIX_THREAD = "thr_";
export const ID_PREFIX_BATCH = "bat_";
export const ID_PREFIX_CONTRACT = "ctr_";
export const FABRIC_ID_MAX_CHARS = 128;

/** Contract revision is a positive safe integer; 0 means "create". */
export const REVISION_MAX = Number.MAX_SAFE_INTEGER;
