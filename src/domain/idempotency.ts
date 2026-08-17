/** Stable domain identities; callers do not choose Scheduler keys. */

import { canonicalDigest } from "../schema/index.js";

export function actionKey(
  purpose: string,
  fields: Record<string, unknown>,
): string {
  return canonicalDigest({ purpose, ...fields });
}

export function stableEntityId(prefix: string, digest: string): string {
  return `${prefix}-${digest.slice(0, 32)}`;
}
