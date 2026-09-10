/**
 * PAL-FED-0D invocation provenance (EXPERIMENTAL, §8/§32).
 *
 * When a collaboration write is performed by a real DSH tool call, the
 * Ordarium InvocationIdentity records that real call context. The stable peer
 * identity stays in the event/contract `from`/`proposedBy` fields; the two are
 * never collapsed. `PeerRef != DshSessionId != callId`.
 */

import type { InvocationIdentity } from "@ordarium/core";

/** The real DSH execution identity of one tool call. */
export interface DshCallIdentity {
  readonly callId: string;
  readonly rootCallId: string;
}

/**
 * Map a DSH tool execution onto Ordarium invocation provenance:
 * source = "dsh", scope = the agent's DSH session scope, callId/rootCallId from
 * the actual DSH call, actor = the configured PeerRef.
 */
export function dshInvocation(
  sessionScope: string,
  actor: string,
  call: DshCallIdentity,
  fabricId: string,
): InvocationIdentity {
  return {
    source: "dsh",
    scope: sessionScope,
    callId: call.callId,
    rootCallId: call.rootCallId,
    actor,
    lineage: ["pal-fed-0d", `fabric:${fabricId}`],
  };
}
