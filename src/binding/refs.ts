/**
 * Artifact → reference adapters (G10-C0 §30–§31, B4 §10; moved to this module
 * in G10-C1 so both the binding compiler and the run definition composite
 * derive refs from one place without module cycles).
 *
 * `workRefOf` is the sanctioned Work-lineage mapping: the current production
 * representative of the UAS Work dimension is the ProjectIr revision chain.
 * `architectureRefOf` is the sanctioned Architecture-lineage mapping: the
 * ArchitectureDefinition artifact owns architecture identity. Both extract
 * identity/revision/digest only — never content, never task fields, and
 * nothing that could collapse Work into Architecture or vice versa.
 */

import type { ArchitectureDefinition } from "../architecture/index.js";
import type { ProjectIr } from "../schema/index.js";
import type { DefinitionRevisionRef } from "./contract.js";

/** Architecture artifact → Binding provenance ref (C0 §31). */
export function architectureRefOf(architecture: ArchitectureDefinition): DefinitionRevisionRef {
  return Object.freeze({
    definitionId: architecture.architectureDefinitionId,
    revision: architecture.revision,
    digest: architecture.digest,
  });
}

/** ProjectIr (authoritative Work artifact) → Binding provenance ref (B4 §10). */
export function workRefOf(project: ProjectIr): DefinitionRevisionRef {
  return Object.freeze({
    definitionId: project.project_id,
    revision: project.revision,
    digest: project.digest,
  });
}
