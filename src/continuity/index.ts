/**
 * G10-D3 continuity package: the minimal PersistentPoint artifact and the ONE
 * canonical Palimpsest-owned durable identity store. Effect authority remains
 * Ordarium; continuity semantic truth remains Palimpsest.
 */

export {
  PersistentPointParseError,
  durableContinuityRefOf,
  materializePersistentPoint,
  parsePersistentPoint,
} from "./point.js";
export type { PersistentPoint, PersistentPointId } from "./point.js";
export {
  ContinuityStoreError,
  SqlitePersistentPointStore,
  defaultContinuityPath,
} from "./store.js";
export type { PersistentPointStore } from "./store.js";
