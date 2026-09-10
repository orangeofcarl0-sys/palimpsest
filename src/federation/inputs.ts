/**
 * PAL-FED-0 strict model/CLI input envelopes (EXPERIMENTAL, §31/§32/§35).
 *
 * The adapter — not the model — owns identity. `collab_post` input can never
 * carry `from`, and `contract_update` can never name an accepting peer: those
 * fields do not exist in the accepted envelopes, so an attempt to send them
 * is rejected as an unknown field (FED-A04 / FED-D05).
 */

import { decodeArtifactRefs, decodeContractTerms } from "./codec.js";
import { FederationDecodeError, FederationInputError } from "./errors.js";
import {
  ARTIFACTS_MAX,
  CONTRACT_TITLE_MAX_CHARS,
  CONTRACT_TITLE_MIN_CHARS,
  EVENT_BODY_MAX_CHARS,
  EVENT_BODY_MIN_CHARS,
  ID_MAX_CHARS,
} from "./limits.js";
import { isPeerRef, type PeerRef } from "./peers.js";
import { strictReader } from "./strict.js";
import { EVENT_KINDS, type ArtifactRef, type ContractTerms, type EventKind } from "./types.js";

const reader = strictReader((message) => new FederationInputError(message));

/** Re-map a durable-shape rejection raised while validating input. */
function asInput<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof FederationDecodeError) {
      throw new FederationInputError(error.message);
    }
    throw error;
  }
}

export interface PostEventInput {
  readonly to: PeerRef;
  readonly threadId?: string;
  readonly kind: EventKind;
  readonly body: string;
  readonly contractId?: string;
  readonly artifacts?: readonly ArtifactRef[];
  readonly replyToEventId?: string;
  readonly contractRef?: { readonly contractId: string; readonly revision: number };
}

const POST_KEYS = [
  "to",
  "threadId",
  "kind",
  "body",
  "contractId",
  "artifacts",
  "replyToEventId",
  "contractRef",
] as const;

export function parsePostEventInput(raw: unknown, selfPeer: PeerRef): PostEventInput {
  const object = reader.asObject(raw, "collab_post");
  reader.exactKeys(object, POST_KEYS, "collab_post");
  const toRaw = reader.required(object, "to", "collab_post");
  if (!isPeerRef(toRaw)) {
    throw new FederationInputError(
      `collab_post.to: '${String(toRaw)}' is not a PAL-FED-0 peer`,
    );
  }
  if (toRaw === selfPeer) {
    throw new FederationInputError(
      `collab_post.to: an event cannot be addressed to the sender (${selfPeer})`,
    );
  }
  const kind = reader.asEnum<EventKind>(
    reader.required(object, "kind", "collab_post"),
    EVENT_KINDS,
    "collab_post.kind",
  );
  const body = reader.asString(
    reader.required(object, "body", "collab_post"),
    "collab_post.body",
    EVENT_BODY_MIN_CHARS,
    EVENT_BODY_MAX_CHARS,
  );
  const threadId = reader.optionalString(object, "threadId", "collab_post", 1, ID_MAX_CHARS);
  const contractId = reader.optionalString(object, "contractId", "collab_post", 1, ID_MAX_CHARS);
  const replyToEventId = reader.optionalString(object, "replyToEventId", "collab_post", 1, ID_MAX_CHARS);
  const artifactsRaw = reader.optional(object, "artifacts");
  const artifacts =
    artifactsRaw === undefined
      ? undefined
      : asInput(() =>
          decodeArtifactRefs(
            reader.asArray(artifactsRaw, "collab_post.artifacts", ARTIFACTS_MAX),
            "collab_post.artifacts",
          ),
        );
  const contractRefRaw = reader.optional(object, "contractRef");
  let contractRef: PostEventInput["contractRef"];
  if (contractRefRaw !== undefined) {
    const ref = reader.asObject(contractRefRaw, "collab_post.contractRef");
    reader.exactKeys(ref, ["contractId", "revision"], "collab_post.contractRef");
    contractRef = {
      contractId: reader.asString(
        reader.required(ref, "contractId", "collab_post.contractRef"),
        "collab_post.contractRef.contractId",
        1,
        ID_MAX_CHARS,
      ),
      revision: reader.asPositiveRevision(
        reader.required(ref, "revision", "collab_post.contractRef"),
        "collab_post.contractRef.revision",
      ),
    };
  }
  return {
    to: toRaw,
    kind,
    body,
    ...(threadId === undefined ? {} : { threadId }),
    ...(contractId === undefined ? {} : { contractId }),
    ...(artifacts === undefined ? {} : { artifacts }),
    ...(replyToEventId === undefined ? {} : { replyToEventId }),
    ...(contractRef === undefined ? {} : { contractRef }),
  };
}

export interface ProposeContractInput {
  readonly action: "propose";
  readonly contractId: string;
  readonly expectedRevision: number;
  readonly title: string;
  readonly terms: ContractTerms;
  readonly basisEventIds?: readonly string[];
}

export interface AcceptContractInput {
  readonly action: "accept";
  readonly contractId: string;
  readonly expectedRevision: number;
  readonly expectedTermsDigest: string;
}

export type ContractUpdateInput = ProposeContractInput | AcceptContractInput;

const SHARED_CONTRACT_KEYS = ["action", "contractId", "expectedRevision"] as const;
const PROPOSE_KEYS = [...SHARED_CONTRACT_KEYS, "title", "terms", "basisEventIds"] as const;
const ACCEPT_KEYS = [...SHARED_CONTRACT_KEYS, "expectedTermsDigest"] as const;

export function parseContractUpdateInput(raw: unknown): ContractUpdateInput {
  const object = reader.asObject(raw, "contract_update");
  const action = reader.asEnum(
    reader.required(object, "action", "contract_update"),
    ["propose", "accept"] as const,
    "contract_update.action",
  );
  if (action === "propose") {
    reader.exactKeys(object, PROPOSE_KEYS, "contract_update");
    const title = reader.asString(
      reader.required(object, "title", "contract_update"),
      "contract_update.title",
      CONTRACT_TITLE_MIN_CHARS,
      CONTRACT_TITLE_MAX_CHARS,
    );
    const terms = asInput(() =>
      decodeContractTerms(reader.required(object, "terms", "contract_update"), "contract_update.terms"),
    );
    const basisRaw = reader.optional(object, "basisEventIds");
    const basisEventIds =
      basisRaw === undefined
        ? undefined
        : reader
            .asArray(basisRaw, "contract_update.basisEventIds", 256)
            .map((id, index) =>
              reader.asString(id, `contract_update.basisEventIds[${index}]`, 1, ID_MAX_CHARS),
            );
    return {
      action: "propose",
      contractId: reader.asString(
        reader.required(object, "contractId", "contract_update"),
        "contract_update.contractId",
        1,
        ID_MAX_CHARS,
      ),
      expectedRevision: reader.asPositiveRevision(
        reader.required(object, "expectedRevision", "contract_update"),
        "contract_update.expectedRevision",
      ),
      title,
      terms,
      ...(basisEventIds === undefined ? {} : { basisEventIds }),
    };
  }
  reader.exactKeys(object, ACCEPT_KEYS, "contract_update");
  return {
    action: "accept",
    contractId: reader.asString(
      reader.required(object, "contractId", "contract_update"),
      "contract_update.contractId",
      1,
      ID_MAX_CHARS,
    ),
    expectedRevision: reader.asPositiveRevision(
      reader.required(object, "expectedRevision", "contract_update"),
      "contract_update.expectedRevision",
    ),
    expectedTermsDigest: reader.asString(
      reader.required(object, "expectedTermsDigest", "contract_update"),
      "contract_update.expectedTermsDigest",
      64,
      64,
    ),
  };
}

export function parseBatchInput(raw: unknown, tool: string): { readonly batchId: string } {
  const object = reader.asObject(raw, tool);
  reader.exactKeys(object, ["batchId"], tool);
  return {
    batchId: reader.asString(reader.required(object, "batchId", tool), `${tool}.batchId`, 1, ID_MAX_CHARS),
  };
}

export function parseThreadInput(raw: unknown): { readonly threadId: string } {
  const object = reader.asObject(raw, "collab_thread");
  reader.exactKeys(object, ["threadId"], "collab_thread");
  return {
    threadId: reader.asString(
      reader.required(object, "threadId", "collab_thread"),
      "collab_thread.threadId",
      1,
      ID_MAX_CHARS,
    ),
  };
}

export function parseContractGetInput(raw: unknown): {
  readonly contractId: string;
  readonly history: boolean;
} {
  const object = reader.asObject(raw, "contract_get");
  reader.exactKeys(object, ["contractId", "history"], "contract_get");
  const contractId = reader.asString(
    reader.required(object, "contractId", "contract_get"),
    "contract_get.contractId",
    1,
    ID_MAX_CHARS,
  );
  const historyRaw = reader.optional(object, "history");
  if (historyRaw !== undefined && typeof historyRaw !== "boolean") {
    throw new FederationInputError("contract_get.history: expected a boolean");
  }
  return { contractId, history: historyRaw === true };
}

/** An empty-argument tool: any supplied key is a rejected unknown field. */
export function parseEmptyInput(raw: unknown, tool: string): void {
  reader.exactKeys(reader.asObject(raw, tool), [], tool);
}
