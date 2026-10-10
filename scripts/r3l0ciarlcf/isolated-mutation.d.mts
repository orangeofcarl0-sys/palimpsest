/**
 * R3-L0C-I-A-R-L-C-F §3 — TYPES FOR THE ISOLATED REAL-BYTE MUTATIONS.
 */

export interface IsolatedCheckout {
  readonly root: string;
  readonly head: string;
  readonly links: readonly { readonly name: string; readonly linkPath: string; readonly target: string }[];
}

export interface RealClosureChangeProof {
  readonly id: string;
  readonly authorityBearingFunction: string;
  readonly checkoutReproducesCommittedBytes: boolean;
  readonly committedByteComparison: Readonly<Record<string, any>>;
  readonly checkoutDigestAtHead: string;
  readonly sharedTreeDigestBefore: string;
  readonly mutationApplied: boolean;
  readonly mutatedFile: string;
  readonly bytesAdded: number;
  readonly checkoutDigestAfterMutation: string;
  readonly digestMoved: boolean;
  readonly sharedTreeDigestAfter: string;
  readonly sharedTreeUnchanged: boolean;
  readonly detectedByActualRecomputation: boolean;
  readonly injectedFakeDigest: boolean;
  readonly PROVEN: boolean;
  readonly law: string;
}

export interface RealRouteChangeProof {
  readonly id: string;
  readonly authorityBearingFunction: string;
  readonly mutatedFile: string;
  readonly mutationApplied: boolean;
  readonly mutationDetail?: Readonly<Record<string, any>>;
  readonly effectiveBefore: Readonly<Record<string, any>>;
  readonly effectiveAfter: Readonly<Record<string, any>>;
  readonly effectiveIdentityMoved: boolean;
  readonly detectedByActualRecomputation: boolean;
  readonly injectedFakeDigest: boolean;
  readonly PROVEN: boolean;
  readonly law: string;
}

export const MUTABLE_TRACKED_FILES: readonly string[];
export const NL: string;

export function createIsolatedCheckout(): IsolatedCheckout;
export function destroyIsolatedCheckout(checkout: IsolatedCheckout): Readonly<Record<string, any>>;
export function applyByteMutation(input: Readonly<Record<string, any>>): Readonly<Record<string, any>>;
export function applyValueMutation(input: Readonly<Record<string, any>>): Readonly<Record<string, any>>;
export function restoreTrackedFile(input: Readonly<Record<string, any>>): boolean;
export function computeClosureInCheckout(checkout: IsolatedCheckout): Readonly<Record<string, any>>;
export function sharedTreeClosureDigest(): Promise<string>;
export function checkoutMatchesCommittedBytes(input: Readonly<Record<string, any>>): Readonly<Record<string, any>>;
export function proveRealClosureChangeDetection(input?: Readonly<Record<string, any>>): Promise<RealClosureChangeProof>;
export function proveRealRouteChangeDetection(input?: Readonly<Record<string, any>>): Promise<RealRouteChangeProof>;
