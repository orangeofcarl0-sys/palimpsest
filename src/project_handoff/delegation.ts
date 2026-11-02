/**
 * PC1-V1 R8 — the adapter from the REAL delegation runtime to the Handoff/Receipt contract.
 *
 * A delegation already freezes a read basis, runs an ephemeral reasoning branch and settles a
 * terminal conclusion. This module projects those observed facts into the existing contract; it
 * does not run an agent, does not create second evidence and does not promote a finding.
 *
 * Two honesty rules:
 *   - the read footprint is DECLARED from the frozen basis unless the host observed per-file reads;
 *   - a conclusion is marked as an exploratory hypothesis, so two receipts do not become independent
 *     verification merely because two branches returned prose.
 */
import type { ProjectBasisRef } from "./types.js";
import { makeHandoff, makeReceipt } from "./service.js";
import type { CollaborationReceipt, Handoff } from "./types.js";

export interface DelegationHandoffInput {
  readonly task: string;
  readonly basisCommit: string;
  readonly projectBasis: ProjectBasisRef;
  readonly workDir: string;
  readonly createdAt: string;
}

export function makeDelegationHandoff(input: DelegationHandoffInput): Handoff {
  return makeHandoff({
    task: input.task,
    intent: "Independent exploratory research over a frozen project basis",
    constraints: [
      "read-only against the frozen basis",
      "no canonical project effect (no Work, ProjectIR, Evidence or Promotion)",
      "findings remain exploratory and are not accepted truth",
      "stop at the host's branch limit",
    ],
    projectBasis: {
      ...input.projectBasis,
      headCommit: input.basisCommit,
    },
    sources: [
      {
        ref: `commit:${input.basisCommit}`,
        standing: "ACCEPTED_FOR_PURPOSE",
        digest: input.basisCommit,
      },
    ],
    allowedResources: [input.workDir],
    expectedArtifact: "an exploratory conclusion with source references",
    knownGaps: [
      "the branch's read footprint is declared from the frozen basis, not observed per file",
      "the handoff budget is a declaration; the host enforces its own branch limits",
    ],
    stopConditions: ["the branch reaches a terminal state", "the host reports a failure or interruption"],
    budget: { maxSteps: 1, maxWallSeconds: 900, maxTokens: null },
    decisionsNeeded: ["whether to cite, reject or re-run the finding"],
    createdAt: input.createdAt,
  });
}

export interface DelegationReceiptInput {
  readonly handoff: Handoff;
  readonly executorIdentity: string;
  readonly state: "COMPLETED" | "FAILED" | "INTERRUPTED" | "UNKNOWN";
  readonly conclusion: string | null;
  readonly detail: string;
  readonly createdAt: string;
}

export function makeDelegationReceipt(input: DelegationReceiptInput): CollaborationReceipt {
  const headCommit = input.handoff.projectBasis.headCommit;
  const receiptStatus: CollaborationReceipt["status"] =
    input.state === "COMPLETED"
      ? input.conclusion === null
        ? "PARTIAL"
        : "COMPLETE"
      : input.state === "FAILED" || input.state === "INTERRUPTED"
        ? "INTERRUPTED"
        : "PARTIAL";
  return makeReceipt({
    handoff: input.handoff,
    executor: "REASONING_BRANCH",
    executorIdentity: input.executorIdentity,
    findings:
      input.conclusion === null
        ? []
        : [
            {
              claim: input.conclusion,
              sources: [{ ref: `commit:${headCommit}`, rootId: `commit:${headCommit}`, digest: headCommit }],
              /**
               * Exploratory by construction. The receipt must not become the positive side of an
               * independence count merely because it produced a conclusion.
               */
              hypothesis: true,
              counterEvidence: [],
              uncertainty: "a single exploratory branch conclusion; not independent verification and not accepted project truth",
            },
          ],
    artifacts: [],
    readFootprint: [`declared-basis:${headCommit}`],
    status: receiptStatus,
    limitations: [
      "the read footprint is DECLARED from the frozen basis; per-file reads were not observed by the host",
      "an exploratory conclusion is not Evidence, Proof, accepted truth or a business verdict",
      input.detail,
    ],
    followUp: ["the principal decides whether to cite this finding; consuming it does not accept it"],
    createdAt: input.createdAt,
  });
}
