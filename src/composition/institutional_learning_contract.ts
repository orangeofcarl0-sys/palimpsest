/**
 * E4-L §24 — the INSTITUTIONAL LEARNING INSTALL CONTRACT.
 *
 * These two fields live in their own module for the same reason the delegation, continuation, intent and
 * collaboration contracts do: `install_contract.ts` is at its §25 size ceiling, and the honest response to
 * a size gate is to move a COHESIVE contract out rather than to compress the prose that explains it.
 *
 * They are NOT separately re-exported: a host supplies no option for this face (it composes from owners it
 * already supplies) and reads the service off `InstalledPalimpsest` (see that module's `extends` clause),
 * so this module adds no package export of its own.
 */

import type { InstitutionalLearningService } from "../institutional_learning/index.js";

export interface InstitutionalLearningInstallResult {
  /**
   * E4-L §24 (additive): the GOVERNED INSTITUTIONAL LEARNING face — present iff an evolution history AND
   * the empirical memory are both composed.
   *
   *     reconcileInterventions()       = idempotent projection of ACTIVATED structural change into memory
   *     interventions(lane?)           = derived read over OrganizationMemory
   *     intervention(lane, caseRef)    = the projection reconstructed from durable evolution history
   *     evaluations(interventionRef)   = the derived experiment/evaluation join
   *
   * The structural-mutation verbs (`advanceEvolution`, `advanceRuntimeEvolution`) are deliberately NOT
   * exposed here: the existing Evolution services stay authoritative, and learning only observes what they
   * did (§25). Nothing on this face can mutate an Organization or a RuntimeScope.
   */
  readonly institutionalLearning?: InstitutionalLearningService | undefined;
}
