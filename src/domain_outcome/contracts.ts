import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { DomainContract, DomainContractContext, DomainContractResult } from "./types.js";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requiredKeys(parameters: Readonly<Record<string, unknown>>): readonly string[] {
  const value = parameters.requiredKeys;
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0)) {
    return [];
  }
  return value as readonly string[];
}

/** A structured artifact contract: parse JSON and require named keys. */
const jsonArtifact: DomainContract = {
  contractId: "json-artifact",
  version: "1",
  question: "Does the delivered JSON artifact contain every required key?",
  requiredInputs: ["artifactPath"],
  async evaluate(input, context): Promise<DomainContractResult> {
    if (input.artifactPath === null) {
      return { status: "uncertain", detail: "no artifact path was supplied", evidenceRefs: [], unmetRequirements: ["artifactPath"], investigationComplete: false };
    }
    const path = isAbsolute(input.artifactPath) ? input.artifactPath : resolve(context.repository ?? ".", input.artifactPath);
    let bytes: Buffer;
    try {
      bytes = context.readBytes(path);
    } catch (error) {
      return { status: "uncertain", detail: `the artifact cannot be read: ${error instanceof Error ? error.message : String(error)}`, evidenceRefs: [], unmetRequirements: [input.artifactPath], investigationComplete: false };
    }
    const digest = sha256(bytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      return { status: "infeasible", detail: "the artifact is not valid JSON", evidenceRefs: [`artifact:sha256:${digest}`], unmetRequirements: ["valid JSON"], investigationComplete: false };
    }
    const keys = requiredKeys(input.parameters);
    const missing = keys.filter((key) => typeof parsed !== "object" || parsed === null || !(key in (parsed as Record<string, unknown>)));
    if (missing.length > 0) {
      return { status: "infeasible", detail: `the artifact is missing required keys: ${missing.join(", ")}`, evidenceRefs: [`artifact:sha256:${digest}`], unmetRequirements: missing, investigationComplete: false };
    }
    return { status: "supported", detail: `the artifact is valid JSON and contains every required key${keys.length === 0 ? "" : ` (${keys.join(", ")})`}`, evidenceRefs: [`artifact:sha256:${digest}`], unmetRequirements: [], investigationComplete: true };
  },
};

/**
 * A negative investigation contract. An infeasible finding COMPLETES the investigation; it does not
 * complete the business objective, and it never claims the objective was attained.
 */
const negativeInvestigation: DomainContract = {
  contractId: "negative-investigation",
  version: "1",
  question: "Is there an accepted negative finding with the named unresolved requirements?",
  requiredInputs: ["journalEntryId"],
  async evaluate(input, context): Promise<DomainContractResult> {
    const entryId = input.parameters.journalEntryId;
    if (typeof entryId !== "string" || entryId === "") {
      return { status: "uncertain", detail: "no journal entry was named", evidenceRefs: [], unmetRequirements: ["journalEntryId"], investigationComplete: false };
    }
    const entry = await context.journalEntry(entryId);
    if (entry === undefined) {
      return { status: "uncertain", detail: `journal entry ${entryId} is not readable`, evidenceRefs: [`journal:${entryId}`], unmetRequirements: ["a recorded negative finding"], investigationComplete: false };
    }
    if (entry.kind !== "NEGATIVE_RESULT") {
      return { status: "uncertain", detail: `journal entry ${entryId} is ${entry.kind}, not a NEGATIVE_RESULT`, evidenceRefs: [`journal:${entryId}`], unmetRequirements: ["a NEGATIVE_RESULT entry"], investigationComplete: false };
    }
    const unmet = input.parameters.unmetRequirements;
    const unmetRequirements = Array.isArray(unmet) ? unmet.filter((value): value is string => typeof value === "string") : [];
    return {
      status: "infeasible",
      detail: `the investigation is complete and records a negative finding; ${unmetRequirements.length === 0 ? "no extra unmet requirement was named" : `the business objective remains unmet at: ${unmetRequirements.join(", ")}`}`,
      evidenceRefs: [`journal:${entryId}`, `journal-digest:${entry.digest}`],
      unmetRequirements,
      investigationComplete: true,
    };
  },
};

/** An explicit refusal to manufacture a truth label. */
const humanReview: DomainContract = {
  contractId: "human-review",
  version: "1",
  question: "Has a competent human reviewer accepted this conclusion for the stated purpose?",
  requiredInputs: [],
  async evaluate(input): Promise<DomainContractResult> {
    return {
      status: "uncertain",
      detail: "this question requires human judgement; the product records the question and does not convert it into a machine verdict",
      evidenceRefs: input.artifactPath === null ? [] : [`artifact:${input.artifactPath}`],
      unmetRequirements: ["an explicit human review record"],
      investigationComplete: false,
    };
  },
};

export const BUILT_IN_DOMAIN_CONTRACTS: readonly DomainContract[] = Object.freeze([jsonArtifact, negativeInvestigation, humanReview]);
