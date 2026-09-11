/**
 * PAL-FED-0D DSH plugin configuration (EXPERIMENTAL).
 *
 * The plugin is bound to one peer through trusted process/profile
 * configuration, never through model arguments: `selfPeer`, `fabricId` and the
 * coordination DB path come from the DSH profile patch. Validation is
 * fail-closed and rejects unknown keys.
 */

import { FederationInputError } from "../errors.js";
import { FABRIC_ID_MAX_CHARS, ID_MAX_CHARS } from "../limits.js";
import { isPeerRef, type PeerRef } from "../peers.js";
import { strictReader } from "../strict.js";
import { ADMISSION_MODES, type AdmissionBinding, type AdmissionMode } from "./admission.js";

const reader = strictReader((message) => new FederationInputError(message));

const ADMISSION_KEYS = [
  "mode",
  "runId",
  "ticketInitial",
  "resolutionOwner",
  "attemptLogPath",
] as const;

export interface PalFedDshModelOptions {
  readonly provider: string;
  readonly model: string;
}

export interface PalFedDshConfig {
  /** Trusted peer identity this DSH agent speaks as. */
  readonly selfPeer: PeerRef;
  readonly fabricId: string;
  /** Explicit coordination DB path outside both project worktrees. */
  readonly dbPath: string;
  /** Stable DSH session identity for the peer agent. */
  readonly sessionId: string;
  /** Agent workspace; the peer's own worktree. */
  readonly cwd: string;
  /** Resume the persisted session instead of creating it fresh. */
  readonly resume: boolean;
  readonly model?: PalFedDshModelOptions | undefined;
  /** Bounded local watcher poll interval in milliseconds. */
  readonly watchIntervalMs: number;
  /**
   * Optional one-shot operator seed, delivered as the agent's first user turn.
   * This stands in for the human user's opening message during an autonomous
   * dogfood run; it is never re-delivered once the session has a turn.
   */
  readonly initialPrompt?: string | undefined;
  /**
   * PAL-FED-0I experiment-only epistemic admission binding. When present the
   * focal agent also gets a `decision_submit` tool; absent means no admission
   * surface at all. All trusted ticket/mode context is bound here, never model
   * input.
   */
  readonly admission?: AdmissionBinding | undefined;
  /** Test/host hook invoked once the runtime is ready (never YAML-serializable). */
  readonly onReady?: ((runtime: unknown) => void) | undefined;
}

const CONFIG_KEYS = [
  "selfPeer",
  "fabricId",
  "dbPath",
  "sessionId",
  "cwd",
  "resume",
  "model",
  "watchIntervalMs",
  "initialPrompt",
  "admission",
  "onReady",
] as const;

const DEFAULT_WATCH_INTERVAL_MS = 2_000;
const MIN_WATCH_INTERVAL_MS = 200;
const MAX_WATCH_INTERVAL_MS = 60_000;

export function parsePalFedDshConfig(raw: unknown): PalFedDshConfig {
  const object = reader.asObject(raw, "pal-fed config");
  reader.exactKeys(object, CONFIG_KEYS, "pal-fed config");

  const selfPeerRaw = reader.required(object, "selfPeer", "pal-fed config");
  if (!isPeerRef(selfPeerRaw)) {
    throw new FederationInputError(
      `pal-fed config.selfPeer: '${String(selfPeerRaw)}' is not a PAL-FED-0 peer`,
    );
  }
  const fabricId = reader.asString(
    reader.required(object, "fabricId", "pal-fed config"),
    "pal-fed config.fabricId",
    1,
    FABRIC_ID_MAX_CHARS,
  );
  const dbPath = reader.asString(
    reader.required(object, "dbPath", "pal-fed config"),
    "pal-fed config.dbPath",
    1,
    4_096,
  );
  const sessionId = reader.asString(
    reader.required(object, "sessionId", "pal-fed config"),
    "pal-fed config.sessionId",
    1,
    ID_MAX_CHARS,
  );
  const cwd = reader.asString(
    reader.required(object, "cwd", "pal-fed config"),
    "pal-fed config.cwd",
    1,
    4_096,
  );
  const resumeRaw = reader.optional(object, "resume");
  if (resumeRaw !== undefined && typeof resumeRaw !== "boolean") {
    throw new FederationInputError("pal-fed config.resume: expected a boolean");
  }
  const intervalRaw = reader.optional(object, "watchIntervalMs");
  let watchIntervalMs = DEFAULT_WATCH_INTERVAL_MS;
  if (intervalRaw !== undefined) {
    if (
      typeof intervalRaw !== "number" ||
      !Number.isInteger(intervalRaw) ||
      intervalRaw < MIN_WATCH_INTERVAL_MS ||
      intervalRaw > MAX_WATCH_INTERVAL_MS
    ) {
      throw new FederationInputError(
        `pal-fed config.watchIntervalMs: expected an integer in [${MIN_WATCH_INTERVAL_MS}, ${MAX_WATCH_INTERVAL_MS}]`,
      );
    }
    watchIntervalMs = intervalRaw;
  }
  const initialPrompt = reader.optionalString(
    object,
    "initialPrompt",
    "pal-fed config",
    1,
    8_192,
  );
  const admissionRaw = reader.optional(object, "admission");
  let admission: AdmissionBinding | undefined;
  if (admissionRaw !== undefined) {
    const block = reader.asObject(admissionRaw, "pal-fed config.admission");
    reader.exactKeys(block, ADMISSION_KEYS, "pal-fed config.admission");
    const modeRaw = reader.asString(
      reader.required(block, "mode", "pal-fed config.admission"),
      "pal-fed config.admission.mode",
      1,
      2,
    );
    if (!(ADMISSION_MODES as readonly string[]).includes(modeRaw)) {
      throw new FederationInputError(
        `pal-fed config.admission.mode: expected one of ${ADMISSION_MODES.join(", ")}`,
      );
    }
    const ticketRaw = reader.asString(
      reader.required(block, "ticketInitial", "pal-fed config.admission"),
      "pal-fed config.admission.ticketInitial",
      1,
      16,
    );
    if (ticketRaw !== "NONE" && ticketRaw !== "OPEN") {
      throw new FederationInputError(
        "pal-fed config.admission.ticketInitial: expected 'NONE' or 'OPEN'",
      );
    }
    const resolutionOwnerRaw = reader.required(
      block,
      "resolutionOwner",
      "pal-fed config.admission",
    );
    if (!isPeerRef(resolutionOwnerRaw)) {
      throw new FederationInputError(
        `pal-fed config.admission.resolutionOwner: '${String(resolutionOwnerRaw)}' is not a PAL-FED-0 peer`,
      );
    }
    admission = {
      mode: modeRaw as AdmissionMode,
      runId: reader.asString(
        reader.required(block, "runId", "pal-fed config.admission"),
        "pal-fed config.admission.runId",
        1,
        ID_MAX_CHARS,
      ),
      ticketInitial: ticketRaw,
      resolutionOwner: resolutionOwnerRaw,
      attemptLogPath: reader.asString(
        reader.required(block, "attemptLogPath", "pal-fed config.admission"),
        "pal-fed config.admission.attemptLogPath",
        1,
        4_096,
      ),
    };
  }
  const modelRaw = reader.optional(object, "model");
  let model: PalFedDshModelOptions | undefined;
  if (modelRaw !== undefined) {
    const modelObject = reader.asObject(modelRaw, "pal-fed config.model");
    reader.exactKeys(modelObject, ["provider", "model"], "pal-fed config.model");
    model = {
      provider: reader.asString(
        reader.required(modelObject, "provider", "pal-fed config.model"),
        "pal-fed config.model.provider",
        1,
        128,
      ),
      model: reader.asString(
        reader.required(modelObject, "model", "pal-fed config.model"),
        "pal-fed config.model.model",
        1,
        128,
      ),
    };
  }
  const onReadyRaw = reader.optional(object, "onReady");
  if (onReadyRaw !== undefined && typeof onReadyRaw !== "function") {
    throw new FederationInputError("pal-fed config.onReady: expected a function");
  }
  return {
    selfPeer: selfPeerRaw,
    fabricId,
    dbPath,
    sessionId,
    cwd,
    resume: resumeRaw === true,
    watchIntervalMs,
    ...(model === undefined ? {} : { model }),
    ...(initialPrompt === undefined ? {} : { initialPrompt }),
    ...(admission === undefined ? {} : { admission }),
    ...(onReadyRaw === undefined ? {} : { onReady: onReadyRaw as (runtime: unknown) => void }),
  };
}
