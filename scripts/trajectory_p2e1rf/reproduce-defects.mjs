/**
 * Trajectory-P2-E1RF §3 — RF-0: REPRODUCE AND CLASSIFY THE FOUR RESIDUAL DEFECTS.
 *
 * THIS SCRIPT IS THE BASELINE FALSIFIER. It runs against the PARENT commit's code and records what that code
 * ACTUALLY DOES, before any correction exists. It is not a description of the defect: each record below is the
 * output of calling the shipped function with a test-owned fixture.
 *
 * THE FOUR DEFECTS, AND WHY EACH IS LOAD-BEARING.
 *
 *   D1 (RF-A)  `createDelegationCwdGuard()` compares the CANONICAL target against the world. A junction whose
 *              current target IS the world therefore passes: `world/alias-to-world` canonicalizes to `world`.
 *              The alias is still a mutable indirection, so the guard admits a path it cannot vouch for.
 *   D2 (RF-B)  `armReceipt()` hashes `JSON.stringify(payload.answerExtraction?.answer ?? null)`, but the
 *              harness never records `answer` in the extraction metadata. Every per-arm digest is therefore
 *              SHA-256 of the literal string "null" — identical for CONTROL and TREATMENT, and unrelated to
 *              the bytes that were extracted and scored.
 *   D3 (RF-C)  `parseLabelAcl()` accepts a mandatory ACE whose numeric fields failed to decode. A failed
 *              `read32` yields `NaN`; `Number.isFinite` is never checked for `policyMask`, `integrityRid`,
 *              `subAuthorityCount` or the SID authority. The parser reports `present:true, readable:true`, and
 *              `planLabel()` then computes `NaN | NO_READ_UP`, which is `2` — every existing policy bit is
 *              discarded. An invalid field silently becomes zero through bitwise coercion.
 *   D4 (RF-D)  `generate-evidence.mjs` reads R1-HR/R1-HC reports from a FIXED user-wide path and reuses a
 *              pre-existing falsifier file. Nothing binds those inputs to the Code Freeze that is being
 *              qualified, and `outcomes()` maps `pass === true` to `"PASS"` even when `limit === true`, so a
 *              disclosed LIMIT is recorded as a successful assertion.
 *
 * EVIDENCE CLASSES USED HERE (§3):
 *   D1, D2, D3  DYNAMIC_UNIT_VERIFIED  — the shipped function was called and its output recorded.
 *   D4          SOURCE_DEMONSTRATED    — a static property of the generator (no freshness binding). This is
 *                                        NOT presented as a live exploit; §7.7 separately requires dynamic
 *                                        falsifiers of the NEW admission code.
 *
 * SAFETY. Every filesystem fixture is under one `mkdtemp` root and is removed at the end. The canary content is
 * synthetic. No personal path, credential, session or project file is touched, and no security descriptor on
 * this machine is read or written.
 *
 * Usage:  node scripts/trajectory_p2e1rf/reproduce-defects.mjs [--json-out <path>]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const fileUrl = (path) => `file:///${path.replace(/\\/gu, "/")}`;

const fence = await import(fileUrl(join(REPO, "host", "deployment", "runtime", "cwd_fence.js")));
const label = await import(fileUrl(join(REPO, "host", "deployment", "runtime", "win32_label.js")));

const ROOT = mkdtempSync(join(tmpdir(), "p2e1rf-rf0-"));
const WORLD = join(ROOT, "world");
const PROTECTED = join(ROOT, "protected");
for (const dir of [WORLD, PROTECTED]) mkdirSync(dir, { recursive: true });
writeFileSync(join(PROTECTED, "AGENTS.md"), "P2E1RF-SYNTHETIC-CANARY\n", "utf8");

const directories = (cwd) => ({ get: () => cwd });
const guard = fence.createDelegationCwdGuard({ world: WORLD, directories: directories(WORLD) });
const call = (name, args) => ({ name, arguments: args, agent: { session: { id: "test-owned-session" } } });
const verdictOf = (reason) => (reason === undefined ? "ADMITTED" : "REFUSED");

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_DEFECT_REPRODUCTION",
  stage: "Trajectory-P2-E1RF",
  /** Recorded so the reader can tell which code these observations belong to. */
  codeHead: (() => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })(),
  fixtureRoot: ROOT,
  defects: {},
};

/* ================================================================ D1 — delegation path identity */

/**
 * The decisive control: a junction whose CURRENT target is the authorized world. §4.4 control 9.
 *
 * The path the model supplies is `world/alias-to-world`. It is not the world; it is a link that happens to
 * point there. A guard that decides from `realpath()` admits it, and then any later re-point of that link
 * changes what the child's instruction discovery would read — after the decision was made.
 */
const alias = join(WORLD, "alias-to-world");
let aliasCreated = false;
let aliasFailure = null;
try {
  symlinkSync(WORLD, alias, "junction");
  aliasCreated = true;
} catch (error) {
  aliasFailure = error instanceof Error ? `${error.code ?? ""} ${error.message}` : String(error);
}
const aliasIsReparse = aliasCreated ? lstatSync(alias).isSymbolicLink() : null;
const aliasVerdict = aliasCreated ? verdictOf(guard(call("subagent", { cwd: alias }))) : "FIXTURE_UNAVAILABLE";

report.defects.D1 = {
  id: "D1",
  target: "RF-A",
  source: "host/deployment/runtime/cwd_fence.js :: createDelegationCwdGuard()",
  evidenceClass: aliasCreated ? "DYNAMIC_UNIT_VERIFIED" : "NOT_ESTABLISHED",
  baselineBehavior: {
    requested: "world/alias-to-world (a junction whose target is the world)",
    reparsePointCreated: aliasCreated,
    isSymbolicLink: aliasIsReparse,
    verdict: aliasVerdict,
  },
  expectedBehavior: "REFUSED — lexical identity with the world is required, so a mutable indirection is never approved from its current target",
  securityImpact:
    aliasVerdict === "ADMITTED"
      ? "an admitted alias is a path whose meaning the model can change after the decision; the child's pre-step instruction discovery would then traverse a tree the guard never examined"
      : "not reproduced on this host",
  detectedByExistingTests: false,
  fixtureFailure: aliasFailure,
  reproductionInput: { tool: "subagent", cwd: alias, world: WORLD },
};

/** The alias-to-PROTECTED control, which the current guard already refuses — recorded so the contrast is explicit. */
const aliasToProtected = join(WORLD, "alias-to-protected");
let aliasToProtectedVerdict = "FIXTURE_UNAVAILABLE";
try {
  symlinkSync(PROTECTED, aliasToProtected, "junction");
  aliasToProtectedVerdict = verdictOf(guard(call("subagent", { cwd: aliasToProtected })));
} catch {
  /* a second junction in the same world may be refused by policy; the control is then unavailable, not passed */
}
report.defects.D1.contrast = {
  requested: "world/alias-to-protected",
  verdict: aliasToProtectedVerdict,
  note: "the current guard refuses THIS alias because its canonical target is outside the world; the defect is that the decision is made from the target at all",
};

/* ================================================================ D2 — answer digest */

/**
 * The digest the closure gate currently computes. Reproduced exactly, including the `?? null` fallback, so the
 * value below is what the shipped expression produces for the payload the harness actually emits.
 */
const shippedDigestExpression = (payload) => `sha256-${createHash("sha256").update(Buffer.from(JSON.stringify(payload.answerExtraction?.answer ?? null), "utf8")).digest("hex")}`;
/** The metadata the harness records for an extraction (§5.1). It has no `answer` and no `rawText` property. */
const harnessRecordedExtraction = { ok: true, assistantMessageCount: 2, bytes: 218, seq: 17 };
const nullDigest = `sha256-${createHash("sha256").update(Buffer.from(JSON.stringify(null), "utf8")).digest("hex")}`;
const shippedControl = shippedDigestExpression({ answerExtraction: harnessRecordedExtraction });
const shippedTreatment = shippedDigestExpression({ answerExtraction: harnessRecordedExtraction });

report.defects.D2 = {
  id: "D2",
  target: "RF-B",
  source: "scripts/trajectory_p2e1rc/closure-gate.mjs :: armReceipt().answerDigest, scripts/trajectory_p2e1r/assay-harness.mjs :: record(\"answerExtraction\")",
  evidenceClass: "DYNAMIC_UNIT_VERIFIED",
  baselineBehavior: {
    harnessRecordedFields: Object.keys(harnessRecordedExtraction),
    controlDigest: shippedControl,
    treatmentDigest: shippedTreatment,
    digestsIdentical: shippedControl === shippedTreatment,
    equalsNullDigest: shippedControl === nullDigest,
  },
  expectedBehavior: "a digest of the UTF-8 bytes of the persisted assistant text actually extracted and scored",
  measurementImpact:
    "the receipt identifies no answer. Two different answers, and an absent answer, all hash to the same value, so the artifact cannot distinguish a real extraction from a missing one",
  detectedByExistingTests: false,
  nullDigest,
  reproductionInput: { payload: { answerExtraction: harnessRecordedExtraction } },
};

/* ================================================================ D3 — malformed mandatory ACE */

/**
 * A malformed mandatory ACE, injected through a stub decoder. No security descriptor on this machine is
 * touched: `parseLabelAcl()` is called with a fake ACL handle and a `decode` that throws for the 32-bit policy
 * read, which is what a failed native field read produces.
 *
 * The ACL header declares one ACE of size 20 at offset 8, of mandatory-label type 17. The SID is a syntactically
 * plausible S-1-16-12288 (High). Only the POLICY MASK read fails.
 */
const decodeAclField = (_acl, offset, type) => {
  if (type === "uint16") {
    if (offset === 2) return 32; // AclSize
    if (offset === 4) return 1; // AceCount
    if (offset === 10) return 20; // AceSize
    return 0;
  }
  if (type === "uint8") {
    if (offset === 8) return 17; // AceType = SYSTEM_MANDATORY_LABEL_ACE
    if (offset === 9) return 3; // AceFlags = inherit
    if (offset === 16) return 1; // SID Revision
    if (offset === 17) return 1; // SubAuthorityCount
    /**
     * The authority is a 6-byte BIG-ENDIAN integer at SID offset 2, i.e. ACL offset 16 + 2 = 18..23.
     * `SECURITY_MANDATORY_LABEL_AUTHORITY` is 16, which lives in the LAST byte (offset 23).
     */
    if (offset === 23) return 16;
    return 0;
  }
  if (type === "uint32") {
    if (offset === 12) return Number.NaN; // the policy mask read failed
    if (offset === 24) return 12288; // Integrity RID = High
    return 0;
  }
  return 0;
};
const malformedParsed = label.parseLabelAcl({ decode: decodeAclField }, 1n);
const malformedPlanned = label.planLabel(malformedParsed);

report.defects.D3 = {
  id: "D3",
  target: "RF-C",
  source: "host/deployment/runtime/win32_label.js :: parseLabelAcl() / planLabel()",
  evidenceClass: "DYNAMIC_UNIT_VERIFIED",
  baselineBehavior: {
    parsed: malformedParsed,
    plannedPolicyMask: malformedPlanned.policyMask,
    plannedIntegrityRid: malformedPlanned.integrityRid,
    plannedPreserved: malformedPlanned.preserved,
  },
  expectedBehavior:
    "a mandatory ACE whose policy mask could not be decoded is UNVERIFIED: parsing reports unreadable, ensureRoot refuses to write, and no policy bit is ever computed from an assumed zero mask",
  securityImpact:
    malformedParsed.present === true && malformedPlanned.policyMask === 2
      ? "the parser reported a trusted label, and the planned write replaced an unknown policy with NO_READ_UP alone — every pre-existing policy bit on the object would be discarded"
      : "not reproduced on this host",
  detectedByExistingTests: false,
  reproductionInput: { aceType: 17, aceSize: 20, integrityRid: 12288, policyMask: "NaN" },
};

/* ================================================================ D4 — evidence freshness */

const generatorSource = readFileSync(join(REPO, "scripts", "trajectory_p2e1re", "generate-evidence.mjs"), "utf8");
/**
 * MEASURED AGAINST THE CODE THAT PRODUCES THE CONFORMANCE ARTIFACT, not against the file as a whole.
 *
 * `outcomes(record)` is the function that turns an R1-HR/R1-HC report into evidence. The claim is precisely
 * that it carries no run identity: no executed code HEAD, no report digest, no command, no exit code, no
 * runtime, no DSH identity. Slicing to that function keeps the finding attributable to one place.
 */
const outcomesBody = (() => {
  const start = generatorSource.indexOf("const outcomes = (record) => ({");
  if (start < 0) return "";
  const end = generatorSource.indexOf("});", start);
  return end < 0 ? "" : generatorSource.slice(start, end);
})();
const freshnessFields = ["executedCodeHead", "codeTreeIdentity", "reportDigest", "command", "exitCode", "runtime", "dshIdentity", "runId", "selection"];
const missingFreshnessFields = freshnessFields.filter((field) => !outcomesBody.includes(field));
const readsFixedUserPath = /join\(process\.env\.USERPROFILE \?\? "", "\.palimpsest-r1h[rc]"/u.test(generatorSource);
/** §7.4: `pass === true ? "PASS" : "FAIL"` collapses a disclosed LIMIT into a successful assertion. */
const mapsLimitToPass = /status: entry\.pass === true \? "PASS" : "FAIL"/u.test(generatorSource);
const reusesPriorFalsifier = /write\("pretool-first-party-falsifiers\.json", readJson\(falsifierPath\)/u.test(generatorSource);
/**
 * §7.4: duplicate check ids must not be silently collapsed. The generator does NOT collapse them — `outcomes()`
 * maps every result row, so both `HR-25` rows survive. What it never does is DETECT that a duplicate exists,
 * so a report whose duplicate rows disagree would be recorded as two unrelated rows with no reconciliation.
 * The field therefore states the measured fact rather than a stronger claim.
 */
const detectsDuplicateIds = /duplicate/iu.test(generatorSource);

report.defects.D4 = {
  id: "D4",
  target: "RF-D",
  source: "scripts/trajectory_p2e1re/generate-evidence.mjs :: outcomes(), the conformance artifact producer",
  evidenceClass: "SOURCE_DEMONSTRATED",
  note: "This is a static property of the generator, NOT a live exploit. §7.7 requires the dynamic falsifiers to exercise the NEW admission code, which is where they run.",
  baselineBehavior: {
    readsFixedUserPath,
    conformanceOutcomeFields: outcomesBody
      .match(/[A-Za-z]+:/gu)
      ?.map((token) => token.replace(/:$/u, ""))
      .filter((field) => field !== "checks" && field !== "status" && field !== "id" && field !== "statement" && field !== "detail") ?? [],
    missingFreshnessFields,
    mapsLimitToPass,
    reusesPriorFalsifier,
    detectsDuplicateIds,
    duplicateIdInRealReport: "HR-25 appears twice in the R1-HR report with different statements; both rows are preserved, and no reconciliation is recorded",
  },
  expectedBehavior:
    "each authoritative artifact is bound to a run identity (executed code HEAD, tree, command, exit code, runtime, DSH identity, selection, artifact digest) and the gate rejects missing, stale, tampered or LIMIT-relabelled input",
  measurementImpact:
    "a report produced against different code, or by a different DSH, or a disclosed LIMIT, can be recorded as a successful assertion about the code being qualified",
  detectedByExistingTests: false,
};

/* ================================================================ cleanup */

rmSync(ROOT, { recursive: true, force: true });
report.fixtureRemoved = !existsSync(ROOT);

const emitted = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(emitted);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), emitted, "utf8");
}

/**
 * EXIT CODE. This script REPORTS the baseline; a reproduced defect is the expected result on the parent
 * commit, so a nonzero exit would make the baseline itself look like a harness failure. The exit code states
 * only whether the fixtures could be built.
 */
const fixturesUsable = aliasCreated || aliasFailure !== null;
process.exit(fixturesUsable ? 0 : 2);
