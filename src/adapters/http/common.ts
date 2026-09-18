/**
 * SR-1 R3B — the shared HTTP adapter contract and request helpers.
 *
 * The public wire types (`ApplicationRouteResult`, `ApplicationRouteInput`) and the error-to-status
 * mapping live here so the cluster modules can share them; `src/application/http.ts` re-exports the
 * same names on the path a caller already had (§18).
 *
 * Nothing here knows about a capability. A cluster declares descriptors and calls the application
 * façade; the adapter's job is the wire, and semantic policy never appears below this line (§22).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";

export interface ApplicationRouteResult {
  readonly status: number;
  readonly body: unknown;
}

export interface ApplicationRouteInput {
  readonly application: PalimpsestApplicationSurface;
  readonly method: string;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

export class InvalidRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRequest";
  }
}

export function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new InvalidRequest("request body must be a JSON object");
  return body as Record<string, unknown>;
}

export function str(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new InvalidRequest(`${what} must be a non-empty string`);
  return value;
}

export function queryRequired(query: URLSearchParams, name: string): string {
  const value = query.get(name);
  if (value === null || value === "") throw new InvalidRequest(`query parameter "${name}" is required`);
  return value;
}

/** Strict closed-enum validation; the value is never coerced. */
export function enumValue<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new InvalidRequest(`${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

/** Strict-parse a request body artifact; a malformed body is a 400, never an internal error. */
export function parseBody<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new InvalidRequest(error instanceof Error ? error.message : String(error));
  }
}

export function requireSurface<T>(surface: T | undefined, name: string): T {
  if (surface === undefined) {
    const error = new Error(`the ${name} surface is not configured for this installation`);
    (error as { kind?: string }).kind = "surface_absent";
    throw error;
  }
  return surface;
}

/** Map a semantic error kind to an HTTP status without leaking internals. */
export function applicationErrorStatus(error: unknown): number {
  const kind = typeof error === "object" && error !== null ? String((error as { kind?: unknown }).kind ?? "") : "";
  if (error instanceof InvalidRequest) return 400;
  if (kind === "surface_absent") return 501;
  if (kind === "") return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "InvalidRequest" ? 400 : 500;
  if (/^unknown_|_unknown$|^not_admitted$/.test(kind)) return 404;
  if (/stale|basis_mismatch|conflict|already_|head_mismatch|_closed$|retired_lineage/.test(kind)) return 409;
  if (/unauthenticated|not_a_participant|not_required|unauthorized|unverified|representation_not_admitted|_denied$/.test(kind)) return 403;
  // UX-B: a project↔peer binding mismatch is a refusal of the SENDER, exactly like
  // an unverified peer; an oversize packet is the caller's fault, not a server fault.
  if (/binding_mismatch/.test(kind)) return 403;
  if (/^invalid_|unknown_type|invalid_content|missing_|^oversized/.test(kind)) return 400;
  return 500;
}

/** The two methods a Palimpsest route may accept. `methods` on a descriptor is exactly this set. */
export type HttpMethod = "GET" | "POST";

/** What a route handler is given. `ok`/`requireGet`/`requirePost` are the historical helpers. */
export interface RouteScope {
  readonly application: PalimpsestApplicationSurface;
  readonly method: string;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
  readonly ok: (value: unknown) => ApplicationRouteResult;
  readonly requireGet: () => void;
  readonly requirePost: () => void;
}

/**
 * One HTTP route. Static, typed and deterministic (§19): the manifest is a literal array, there is
 * no registry, no filesystem discovery and no reflection.
 *
 * `methods` DECLARES the set the route accepts. The guard itself stays inside the handler, because
 * its position is part of the contract: for the `resolveFaceFirst` routes the face must be resolved
 * before the method is refused, so hoisting the check into the dispatcher would turn a 501
 * `surface_absent` into a 400 for a wrong method. The declaration is not trusted — the A13 closure
 * test probes every route with every method and checks that the two agree.
 *
 * `resolveFaceFirst` records that structural fact: the face is resolved BEFORE the method guard, so
 * an installation without the surface answers 501 `surface_absent` for every method rather than 400
 * for the wrong one. The canonical adapter did this deliberately for the external-asset bridge and
 * `/api/project/journal`, and the accepted-method sets in the golden fixture still show it.
 */
export interface ApplicationRouteDescriptor {
  readonly path: string;
  /** `exact` unless the canonical adapter matched with `startsWith` (§21). */
  readonly match: "exact" | "prefix";
  readonly methods: readonly HttpMethod[];
  /** The application face this route reads, or `null` for the discovery route. */
  readonly face: string | null;
  readonly resolveFaceFirst?: boolean;
  /**
   * For a `prefix` descriptor: the concrete paths inside the prefix it answers specially. A prefix
   * route still refuses an unknown sub-path (with the same 400 the canonical adapter threw), but
   * these are the paths a client can actually call, so the static route inventory can be an exact
   * set instead of a pattern nothing can be compared against.
   */
  readonly covers?: readonly string[];
  /** Builds the response through the scope's `ok`, exactly as the canonical switchboard did. */
  readonly handle: (scope: RouteScope) => Promise<ApplicationRouteResult>;
}

/** A small builder so a cluster reads as a route table rather than as object literals. */
export function route(input: {
  readonly path: string;
  readonly methods: readonly HttpMethod[];
  readonly face: string | null;
  readonly match?: "exact" | "prefix";
  readonly resolveFaceFirst?: boolean;
  readonly covers?: readonly string[];
  /** Builds the response through the scope's `ok`, exactly as the canonical switchboard did. */
  readonly handle: (scope: RouteScope) => Promise<ApplicationRouteResult>;
}): ApplicationRouteDescriptor {
  return {
    path: input.path,
    match: input.match ?? "exact",
    methods: input.methods,
    face: input.face,
    ...(input.resolveFaceFirst === undefined ? {} : { resolveFaceFirst: input.resolveFaceFirst }),
    ...(input.covers === undefined ? {} : { covers: input.covers }),
    handle: input.handle,
  };
}

/** One row of the STATIC route inventory (§19/§20). */
export interface ApplicationRouteInventoryEntry {
  readonly path: string;
  readonly methods: readonly HttpMethod[];
  readonly face: string | null;
  /** `exact` for a directly declared path, `prefix` for a concrete path inside a prefix route. */
  readonly match: "exact" | "prefix";
}

/**
 * Expand a manifest into the flat path/method inventory (§20).
 *
 * An exact descriptor contributes its own path. A prefix descriptor contributes itself plus its
 * declared `covers`, so the inventory is an exact set that can be compared with the canonical
 * baseline's path list rather than a pattern.
 */
export function routeInventory(
  manifest: readonly ApplicationRouteDescriptor[],
): readonly ApplicationRouteInventoryEntry[] {
  const out: ApplicationRouteInventoryEntry[] = [];
  for (const descriptor of manifest) {
    out.push({ path: descriptor.path, methods: descriptor.methods, face: descriptor.face, match: descriptor.match });
    for (const covered of descriptor.covers ?? []) {
      out.push({ path: covered, methods: descriptor.methods, face: descriptor.face, match: "prefix" });
    }
  }
  return out;
}
