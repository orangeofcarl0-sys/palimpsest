/**
 * SR-1 R3A — the DSH tool aggregate.
 *
 * The single composition point for the tool catalogue. Static and explicit: there is no registry,
 * no discovery and no dynamic import (§11). The ORDER of these spreads is the order a host sees,
 * so it is kept identical to the switchboard this replaced and pinned by the golden parity fixture.
 */

import type { DshToolDefinition } from "../../tools/dsh_types.js";
import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import { defineWorkTools } from "./work.js";
import { defineFederationTools } from "./federation.js";
import { defineOrganizationTools } from "./organization.js";
import { defineCognitionTools } from "./cognition.js";
import { defineProductTools } from "./product.js";
import { defineProofTools } from "./proof.js";
import { defineProjectTools } from "./project.js";
import { defineGraphTools } from "./graph.js";

export function defineApplicationTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  return [
    ...defineWorkTools(application),
    ...defineFederationTools(application),
    ...defineOrganizationTools(application),
    ...defineCognitionTools(application),
    ...defineProductTools(application),
    ...defineProofTools(application),
    ...defineProjectTools(application),
    ...defineGraphTools(application),
  ];
}
