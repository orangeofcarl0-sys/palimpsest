/**
 * SR-1 R3B — the HTTP route manifest and the aggregate dispatcher.
 *
 * The switchboard that used to live in `src/application/http.ts` is now these cluster modules. This
 * file owns exactly two things: the ORDERED manifest (§21) and the dispatch loop. It holds no route
 * logic of its own — each cluster owns its metadata, its parsing and its façade calls (§22).
 *
 * The manifest is a literal array of cluster manifests. Static, typed, deterministic: no registry,
 * no filesystem discovery, no reflection, no dynamic import (§19). A test asserts that no two
 * descriptors can match the same pathname, so the array order — kept identical to the canonical
 * switchboard anyway — cannot silently start deciding behaviour.
 */

import {
  InvalidRequest,
  applicationErrorStatus,
  routeInventory,
  type ApplicationRouteDescriptor,
  type ApplicationRouteInput,
  type ApplicationRouteInventoryEntry,
  type ApplicationRouteResult,
  type RouteScope,
} from "./common.js";
import { WORK_ROUTES } from "./work.js";
import { PRODUCT_ROUTES } from "./product.js";
import { FEDERATION_ROUTES } from "./federation.js";
import { ORGANIZATION_ROUTES } from "./organization.js";
import { COGNITION_ROUTES } from "./cognition.js";
import { PROJECTIONS_ROUTES } from "./projections.js";
import { PROOF_ROUTES } from "./proof.js";
import { PROJECT_ROUTES } from "./project.js";
import { EXTERNAL_ASSETS_ROUTES } from "./external_assets.js";
import { MANAGEMENT_ROUTES } from "./management.js";

/**
 * The complete route table, in the canonical dispatch order. Client-visible order is identical to
 * the switchboard this replaced; the A13 closure test pins the path and method sets against the
 * canonical baseline and the behavioural probe covers every route with every method.
 */
export const APPLICATION_ROUTE_MANIFEST: readonly ApplicationRouteDescriptor[] = [
  ...WORK_ROUTES,
  ...PRODUCT_ROUTES,
  ...FEDERATION_ROUTES,
  ...ORGANIZATION_ROUTES,
  ...COGNITION_ROUTES,
  ...PROJECTIONS_ROUTES,
  ...PROOF_ROUTES,
  ...PROJECT_ROUTES,
  ...EXTERNAL_ASSETS_ROUTES,
  ...MANAGEMENT_ROUTES,
];

/** The flat, typed route inventory (§20): the set a client can call, with its methods and face. */
export function applicationRouteInventory(): readonly ApplicationRouteInventoryEntry[] {
  return routeInventory(APPLICATION_ROUTE_MANIFEST);
}

function problem(status: number, detail: string): ApplicationRouteResult {
  return { status, body: { error: { status, detail } } };
}

/** First matching descriptor wins; the manifest has no overlapping descriptors (asserted by test). */
function matchRoute(pathname: string): ApplicationRouteDescriptor | undefined {
  for (const descriptor of APPLICATION_ROUTE_MANIFEST) {
    if (descriptor.match === "prefix" ? pathname.startsWith(descriptor.path) : pathname === descriptor.path) {
      return descriptor;
    }
  }
  return undefined;
}

async function dispatch(input: ApplicationRouteInput): Promise<ApplicationRouteResult | undefined> {
  const { method, pathname, query } = input;
  const descriptor = matchRoute(pathname);
  if (descriptor === undefined) return undefined;
  const ok = (value: unknown): ApplicationRouteResult => ({ status: 200, body: value === undefined ? null : value });
  const requireGet = (): void => {
    if (method !== "GET") throw new InvalidRequest(`route ${pathname} requires GET`);
  };
  const requirePost = (): void => {
    if (method !== "POST") throw new InvalidRequest(`route ${pathname} requires POST`);
  };
  const scope: RouteScope = {
    application: input.application,
    method,
    pathname,
    query,
    body: input.body,
    ok,
    requireGet,
    requirePost,
  };
  return await descriptor.handle(scope);
}

export async function handleApplicationRequest(input: ApplicationRouteInput): Promise<ApplicationRouteResult | undefined> {
  const { method, pathname, query } = input;
  if (!pathname.startsWith("/api/")) return undefined;
  try {
    return await dispatch(input);
  } catch (error) {
    const status = applicationErrorStatus(error);
    return problem(status, error instanceof Error ? error.message : String(error));
  }
}
