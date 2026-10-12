/**
 * Trajectory-P2-C §7.6 — THE RESEARCH ENTRY POINT FOR THE OFFICIAL DSH SESSION READER.
 *
 * The IMPLEMENTATION now lives in the shipped host package
 * (`host/deployment/runtime/session_reader.js`, published as `palimpsest-host-deployment`), so that the
 * product composition and the research gates share ONE reader. This module is a thin re-export kept for
 * every existing research/test importer, so no gate has to change its import path and no second
 * implementation exists.
 *
 * The reader is UNCHANGED: it mounts the official `JsonlSessionPersistence` in a bare Cordis context and
 * performs ONE official `open(id,'read')` + `handle.read(0, undefined)`, deriving the persisted/synthetic
 * boundary positionally and the synthetic closers with DSH's own `interruptedTurnClosers`. It is
 * read-only: no append, no flush, no resume, no model.
 */
export {
  resolveDshPackageRoot,
  sanitize,
  makeRealDshSessionReader,
  listSessionIds,
  SESSION_FILE_CANDIDATES,
  PAGE_DOES_NOT_PROVE,
  PAGE_PROVES,
} from "../../host/deployment/runtime/session_reader.js";
