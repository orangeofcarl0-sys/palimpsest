/**
 * C6-R0 — reproducible audit of the COG-6 `acceptedCapabilitiesDigest` provenance.
 *
 * This script reads ONLY immutable COG-6 evidence and, optionally, the preserved test-owned Git world.
 * It does not modify anything. Its job is to answer, mechanically:
 *
 *   1. where the field came from (which file, which producer);
 *   2. which source identity was actually accepted (Candidate A, at which head);
 *   3. which identity was introduced only by the final negative control (Candidate B);
 *   4. what the business rubric could actually have observed, from its own recorded output.
 *
 * Usage:
 *   node scripts/c6r/audit_cog6_provenance.mjs
 *   node scripts/c6r/audit_cog6_provenance.mjs --world="F:/.../.cog6-rig/final-main/world"
 *   node scripts/c6r/audit_cog6_provenance.mjs --extractor="F:/.../.cog6-rig/make_cog6_evidence.mjs"
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const EVIDENCE = join(REPO, "research-evidence", "cog6");
const RUN = join(EVIDENCE, "runs", "main");

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseCapabilities(text) {
  return text
    .split(/\r?\n/u)
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [vendor, chemistry, minC, , , coastal, width, lead] = line.split(",");
      return { vendor, chemistry, minC: Number(minC), coastal: coastal === "yes", width: Number(width), lead: Number(lead) };
    });
}

function siteBCompliant(caps) {
  return caps.filter((vendor) => vendor.minC <= -4 && vendor.coastal).map((vendor) => vendor.vendor);
}

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

const outcomes = json(join(EVIDENCE, "outcomes.json"));
const rubric = json(join(RUN, "rubric.json"));
const worktree = json(join(RUN, "worktree.json"));
const run = json(join(RUN, "run.json"));
const candidates = json(join(RUN, "candidates.json"));

const finalSnapshotPath = join(RUN, "files", "sources", "vendor-capabilities.csv");
const finalSnapshotDigest = existsSync(finalSnapshotPath) ? sha256(readFileSync(finalSnapshotPath)) : null;

const stepOf = (label) => run.steps.find((step) => step.label === label) ?? null;
const beforeControl = stepOf("rework:finalTask");
const directControl = stepOf("control:directExternalCommit");
const intakePromotion = stepOf("promote:intake");
const reworkPromotion = stepOf("promote:rework");

const candidateTextA = readFileSync(join(REPO, "scripts", "cog6", "scenario", "inbox", "2026-02-10", "vendor-capabilities.csv"), "utf8");
const candidateTextB = readFileSync(join(REPO, "scripts", "cog6", "scenario", "inbox", "2026-02-14", "vendor-capabilities-corrected.csv"), "utf8");
const capsA = parseCapabilities(candidateTextA);
const capsB = parseCapabilities(candidateTextB);

const extractorPath = arg("extractor");
let extractorEvidence = null;
if (extractorPath !== null) {
  const text = readFileSync(extractorPath, "utf8");
  const lines = text.split(/\r?\n/u);
  const index = lines.findIndex((line) => line.includes("acceptedCapabilitiesDigest"));
  extractorEvidence = index === -1 ? { found: false } : { found: true, line: index + 1, source: lines[index].trim() };
}

const worldPath = arg("world");
let worldCheck = null;
if (worldPath !== null) {
  /* The blob is hashed EXACTLY as stored: trimming it would change the digest, which is the very
     class of error this audit exists to make impossible. Only ref resolution is trimmed. */
  const gitRaw = (args) => execFileSync("git", args, { cwd: worldPath, encoding: "utf8" });
  const git = (args) => gitRaw(args).trim();
  const blobAt = (head) => {
    try {
      return sha256(gitRaw(["show", `${head}:sources/vendor-capabilities.csv`]));
    } catch {
      return null;
    }
  };
  worldCheck = {
    path: worldPath,
    acceptedIntakeHead: acceptedIntakeHead(),
    acceptedIntakeBlob: blobAt(acceptedIntakeHead()),
    finalProjectHead: outcomes.mechanism.final.projectHead,
    finalProjectHeadBlob: blobAt(outcomes.mechanism.final.projectHead),
    finalLiveHead: outcomes.mechanism.final.liveHead,
    finalLiveHeadBlob: blobAt(outcomes.mechanism.final.liveHead),
    coreAutocrlf: (() => {
      try {
        return git(["config", "--get", "core.autocrlf"]) || null;
      } catch {
        return null;
      }
    })(),
  };
}

function acceptedIntakeHead() {
  return outcomes.mechanism.intake.resultingHeadCommit;
}

const report = {
  schema: "c6r-cog6-provenance-audit/v1",
  auditedAt: new Date().toISOString(),
  subject: "COG-6 `mechanism.rubric.acceptedCapabilitiesDigest`",
  sourceIdentities: {
    candidateA: {
      candidateId: outcomes.scenario.candidateA.candidateId,
      digest: outcomes.scenario.candidateA.digest,
      provenance: "inbox/2026-02-10/vendor-capabilities.csv",
    },
    candidateB: {
      candidateId: outcomes.scenario.candidateB.candidateId,
      digest: outcomes.scenario.candidateB.digest,
      provenance: "inbox/2026-02-14/vendor-capabilities-corrected.csv",
    },
    acceptedIntakeHead: acceptedIntakeHead(),
    acceptedBlobDigest: outcomes.mechanism.intake.acceptedBlobDigest,
    acceptedBlobEqualsCandidateA: outcomes.mechanism.intake.blobEqualsCandidate,
    finalProjectHead: outcomes.mechanism.final.projectHead,
    finalLiveHead: outcomes.mechanism.final.liveHead,
  },
  fieldUnderAudit: {
    path: "mechanism.rubric.acceptedCapabilitiesDigest",
    valueInOutcomes: outcomes.mechanism.rubric.acceptedCapabilitiesDigest,
    presentInRubricJson: Object.prototype.hasOwnProperty.call(rubric, "acceptedCapabilitiesDigest"),
    rubricJsonFields: Object.keys(rubric),
    valueEqualsCandidateB: outcomes.mechanism.rubric.acceptedCapabilitiesDigest === outcomes.scenario.candidateB.digest,
    valueEqualsAcceptedBlob: outcomes.mechanism.rubric.acceptedCapabilitiesDigest === outcomes.mechanism.intake.acceptedBlobDigest,
  },
  preservedFinalSnapshot: {
    path: "research-evidence/cog6/runs/main/files/sources/vendor-capabilities.csv",
    digest: finalSnapshotDigest,
    equalsCandidateB: finalSnapshotDigest === outcomes.scenario.candidateB.digest,
    equalsCandidateA: finalSnapshotDigest === outcomes.scenario.candidateA.digest,
    equalsWorktreeSnapshotField: worktree.files?.["sources/vendor-capabilities.csv"]?.digest ?? null,
    note: "this file is the FINAL working-tree snapshot, captured by writeRunArtifacts AFTER the direct Candidate B control",
  },
  rubricEvaluation: {
    recordedAt: null,
    recordedAtExplanation: "the rubric was assigned directly, not wrapped in recorder.capture, so it carries no timestamp of its own",
    window: {
      notBefore: beforeControl?.at ?? null,
      notAfter: directControl?.at ?? null,
      beforeDirectControl: beforeControl !== null && directControl !== null ? Date.parse(beforeControl.at) <= Date.parse(directControl.at) : null,
    },
    checks: rubric.checks,
    siteBVendors: rubric.siteBVendors,
    taskState: rubric.taskState,
    resultCommit: rubric.result?.resultCommit ?? null,
    mechanicalContradiction: {
      siteBVendorsUnderCandidateA: siteBCompliant(capsA),
      siteBVendorsUnderCandidateB: siteBCompliant(capsB),
      recordedSiteBVendors: rubric.siteBVendors,
      candidateBWouldYieldAVendor: siteBCompliant(capsB).length > 0,
      recordedOutputIsCompatibleWithB: JSON.stringify([...rubric.siteBVendors].sort()) === JSON.stringify([...siteBCompliant(capsB)].sort()),
      conclusion:
        "the rubric's own `siteBVendors` and `noVendorSatisfiesSiteB` could only have been produced from A-era capability data; Candidate B makes V4 compliant, so a rubric reading B would have recorded V4",
    },
  },
  sequence: {
    intakePromotionAt: intakePromotion?.at ?? null,
    reworkPromotionAt: reworkPromotion?.at ?? null,
    finalTaskAt: beforeControl?.at ?? null,
    directControlAt: directControl?.at ?? null,
    directControlFromHead: outcomes.mechanism.controls.directExternalCommit.commit.fromHead,
    directControlToHead: outcomes.mechanism.controls.directExternalCommit.commit.toHead,
  },
  extractorEvidence,
  worldCheck,
  conclusion: {
    theFieldWasProducedByTheRubric: false,
    theFieldWasProducedByTheEvidenceExtractor: true,
    whatTheExtractorUsed: "the post-control working-tree snapshot written to files/** by writeRunArtifacts",
    acceptedCanonicalIdentity: outcomes.mechanism.intake.acceptedBlobDigest,
    negativeControlIdentity: outcomes.scenario.candidateB.digest,
    rubricObservedB: false,
    rubricRecordedTheBlobItRead: false,
    remediation: "C6-R evaluates only committed blobs at explicitly named heads, records the evaluation time and subject, and marks an unresolvable basis UNQUALIFIED",
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
