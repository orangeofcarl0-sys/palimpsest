/**
 * G10-O typed application HTTP routes — the COMPATIBILITY import path (SR-1 §18).
 *
 * Every route is namespaced and STRICT; there is no generic `POST /api/advanced {service, method}`
 * tunnel, and no route imports a canonical store. HTTP authentication (the server's bearer token)
 * only admits a request to the server — it is never semantic authority.
 *
 * The switchboard that used to live here is now a set of cohesive capability route adapters under
 * `src/adapters/http/`, behind a static typed route manifest. This file keeps the existing import
 * path working and exposes exactly the four names the canonical entry exposed — nothing more:
 * `handleApplicationRequest`, `applicationErrorStatus`, `ApplicationRouteInput`,
 * `ApplicationRouteResult`.
 */

export { handleApplicationRequest } from "../adapters/http/router.js";
export { applicationErrorStatus } from "../adapters/http/common.js";
export type { ApplicationRouteInput, ApplicationRouteResult } from "../adapters/http/common.js";
