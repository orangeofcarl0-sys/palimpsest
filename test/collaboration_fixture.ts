/**
 * E3-C §11/§18 test fixture: a DURABLE ContactNeed declaration.
 *
 * Before E3-C a `contact_need` commitment scope could name any string, because a need was a
 * memory-only artifact. §18 closed that: the generic commitment path now fails closed unless the
 * referenced need was durably declared, so every test that scopes a commitment to a contact need must
 * first put the declaration in history.
 *
 * This is a TEST fixture, not a product component: it appends the same `CONTACT_NEED_DECLARED` event the
 * Federation service appends, so the pre-E3-C tests keep exercising their own subject (coalitions,
 * attention, durable transport) instead of the need-declaration path.
 */
import { materializeContactNeed } from "../src/federation/index.js";
import type { ContactNeed, ContactNeedOrigin } from "../src/federation/index.js";
import type { CoordinationStore } from "../src/coordination/store.js";
import { canonicalDigest } from "../src/schema/canonical.js";

/** Append a durable manual declaration for `contactNeedId` (idempotent by eventId). */
export async function declareNeed(
  store: CoordinationStore,
  contactNeedId: string,
  options?: { readonly competenceTags?: readonly string[]; readonly origin?: ContactNeedOrigin },
): Promise<ContactNeed> {
  const need = materializeContactNeed({
    contactNeedId,
    origin: options?.origin ?? { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
    competenceTags: options?.competenceTags ?? ["optics"],
    reason: `fixture need ${contactNeedId}`,
  });
  const payload = { need, provenance: { kind: "manual" as const } };
  await store.append({
    eventId: canonicalDigest({
      domain: "palimpsest.coordination-event.v1",
      type: "CONTACT_NEED_DECLARED",
      scope: "federation",
      content: payload,
    }),
    projectId: "federation",
    type: "CONTACT_NEED_DECLARED",
    payload,
  } as never);
  return need;
}
