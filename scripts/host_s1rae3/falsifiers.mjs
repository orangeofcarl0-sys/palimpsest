/**
 * Host-S1RA-E3 — FALSIFIER HARNESS.
 *
 * Runs the F1–F9 cases against whatever implementation is currently on disk and reports the OBSERVED outcome
 * alongside the SAFE outcome each case requires. The two are separate fields on purpose: an observation is not an
 * expectation, and this harness never rewrites a case to match what it happened to see.
 *
 * FIDELITY, STATED UP FRONT. Two different kinds of measurement appear here and they are labelled:
 *
 *   THROUGH_THE_CONSUMER  the production consumer (`rig.safeCleanup` / `ownedRootLifetime`) is called and its own
 *                         answer is recorded. This is the strongest form and is used wherever the consumer can
 *                         express the scenario.
 *   AT_THE_WINDOW         the production `revalidateOwnership` is called, the substitution is made, and then the
 *                         production `rmSync` statement the consumer itself executes is called. Used only for the
 *                         TOCTOU arms, because the substitution has to land between two statements the consumer
 *                         executes back to back. The fidelity limit is stated on the arm itself.
 *
 * EVERY fixture is synthetic and run-owned. The sandbox is created under the platform temporary directory, the
 * gate-root variables are redirected into it before any stage module loads, and containment is asserted before the
 * first mutation.
 *
 * Usage:
 *   node scripts/host_s1rae3/falsifiers.mjs [--json=<path>] [--only=F1,F4]
 */
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

import {
  assertSandboxContainment,
  canaryIntact,
  createSandbox,
  identityOf,
  pathObjectExists,
  removeTreeNoFollow,
  substituteDirectory,
  writeForeignCanary,
} from "./fixtures.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const ONLY = (args.get("only") ?? "")
  .split(",")
  .map((entry) => entry.trim().toUpperCase())
  .filter((entry) => entry !== "");

const results = [];
const record = (arm, fields) => {
  results.push({ arm, ...fields });
  const verdict = fields.safe === true ? "SAFE" : fields.safe === false ? "UNSAFE" : "OBSERVED";
  process.stderr.write(`  ${arm}: ${verdict} — ${fields.observation}\n`);
};

const sandbox = createSandbox("falsifiers");
const containment = assertSandboxContainment(sandbox);
if (containment.proven !== true) {
  process.stdout.write(
    `${JSON.stringify({ kind: "HOST_S1RAE3_FALSIFIERS", stopped: true, reason: "sandbox containment could not be proven", containment }, null, 2)}\n`,
  );
  process.exit(2);
}

/** Imported ONLY after the gate-root variables point into the sandbox. */
const resource = await import("../trajectory_p2b/owned-resource.mjs");
const rig = await import("../trajectory_p2b/rig.mjs");

/** The exact destructive statement the production consumers execute. */
function productionDelete(root) {
  rmSync(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}

const cleanupRegistry = [];
const track = (lifetime) => {
  cleanupRegistry.push(lifetime);
  return lifetime;
};
const wants = (arm) => ONLY.length === 0 || ONLY.includes(arm);
const gateFor = (name) => {
  const gate = join(sandbox.root, `${name}-gate`);
  mkdirSync(gate, { recursive: true });
  return gate;
};

/* ------------------------------------------------------------------ *
 * F1 — MISSING OWNERSHIP MARKER
 * ------------------------------------------------------------------ */
if (wants("F1")) {
  const owned = resource.allocateOwnedRoot(gateFor("f1"), "f1-");
  const lifetime = track(resource.ownedRootLifetime(owned));
  const markerPath = join(owned.root, resource.MARKER_NAME);
  const markerExisted = pathObjectExists(markerPath);
  try {
    unlinkSync(markerPath);
  } catch {
    /* recorded below as markerRemoved */
  }
  const proof = resource.revalidateOwnership(owned);

  record("F1", {
    case: "F1",
    measurement: "HELPER",
    question: "does a missing ownership marker still authorize deletion?",
    fixture: { root: owned.root, markerExisted, markerRemoved: !pathObjectExists(markerPath) },
    expectedSafe: "REFUSED — missing evidence is not positive evidence",
    observedProof: { owned: proof.owned, reason: proof.reason ?? null, checks: proof.checks },
    observation:
      proof.owned === true
        ? "ACCEPTED: revalidation returned owned=true with the marker absent, resting ownership on the captured identity alone"
        : `REFUSED: ${String(proof.reason)}`,
    safe: proof.owned !== true,
  });

  const consumer = await rig.safeCleanup(owned);
  record("F1C", {
    case: "F1C",
    measurement: "THROUGH_THE_CONSUMER",
    question: "does rig.safeCleanup propagate the missing-marker answer?",
    helperVerdict: proof.owned === true ? "ACCEPTED" : "REFUSED",
    consumerOutcome: consumer,
    observation:
      consumer.cleaned === true
        ? `DELETED: rig.safeCleanup removed the root (helper said ${proof.owned === true ? "ACCEPTED" : "REFUSED"})`
        : `PRESERVED: ${String(consumer.reason)}`,
    safe: consumer.cleaned !== true,
    rootStillPresent: pathObjectExists(owned.root),
  });
  lifetime.dispose();
}

/* ------------------------------------------------------------------ *
 * F2 — WRONG ownedRoot, CORRECT runId
 * ------------------------------------------------------------------ */
if (wants("F2")) {
  const owned = resource.allocateOwnedRoot(gateFor("f2"), "f2-");
  const lifetime = track(resource.ownedRootLifetime(owned));
  const markerPath = join(owned.root, resource.MARKER_NAME);
  const original = JSON.parse(readFileSync(markerPath, "utf8"));
  const otherRoot = join(owned.gateRoot, "f2-a-different-root");
  mkdirSync(otherRoot, { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify({ ...original, ownedRoot: otherRoot.replace(/\\/gu, "/") }, null, 2)}\n`, "utf8");
  const proof = resource.revalidateOwnership(owned);

  record("F2", {
    case: "F2",
    measurement: "HELPER",
    question: "does a marker with the correct runId but a different ownedRoot authorize deletion?",
    fixture: { root: owned.root, markerNames: otherRoot, runIdPreserved: true },
    expectedSafe: "REFUSED — runId alone does not bind the resource",
    observedProof: { owned: proof.owned, reason: proof.reason ?? null, checks: proof.checks },
    observation:
      proof.owned === true
        ? "ACCEPTED: the marker names a DIFFERENT root and revalidation still returned owned=true — only runId was compared"
        : `REFUSED: ${String(proof.reason)}`,
    safe: proof.owned !== true,
  });

  const consumer = await rig.safeCleanup(owned);
  record("F2C", {
    case: "F2C",
    measurement: "THROUGH_THE_CONSUMER",
    question: "does rig.safeCleanup propagate a wrong-root refusal?",
    helperVerdict: proof.owned === true ? "ACCEPTED" : "REFUSED",
    consumerOutcome: consumer,
    observation:
      consumer.cleaned === true
        ? "DELETED: rig.safeCleanup removed the root despite the marker naming another root"
        : `PRESERVED: ${String(consumer.reason)}`,
    safe: consumer.cleaned !== true,
    rootStillPresent: pathObjectExists(owned.root),
  });
  lifetime.dispose();
}

/* ------------------------------------------------------------------ *
 * F3 — COPIED MARKER FROM RESOURCE A INTO RESOURCE B
 * ------------------------------------------------------------------ */
if (wants("F3")) {
  const gate = gateFor("f3");
  const a = resource.allocateOwnedRoot(gate, "f3-a-");
  const b = resource.allocateOwnedRoot(gate, "f3-b-");
  const lifetimeB = track(resource.ownedRootLifetime(b));
  const markerA = readFileSync(join(a.root, resource.MARKER_NAME), "utf8");
  writeFileSync(join(b.root, resource.MARKER_NAME), markerA, "utf8");
  const proofB = resource.revalidateOwnership(b);

  record("F3", {
    case: "F3",
    measurement: "HELPER",
    question: "does resource B accept resource A's marker?",
    fixture: { a: a.root, b: b.root, aMarkerCopiedIntoB: true, sameRunId: JSON.parse(markerA).runId === b.runId },
    expectedSafe: "REFUSED for B — a marker binds the resource it was written for",
    observedB: { owned: proofB.owned, reason: proofB.reason ?? null },
    observation: proofB.owned === true ? "ACCEPTED: B was revalidated using a marker copied from A" : `REFUSED for B: ${String(proofB.reason)}`,
    safe: proofB.owned !== true,
    note: "A and B share a runId by construction, which is the point: runId is not resource identity",
  });

  const consumer = await rig.safeCleanup(b);
  record("F3C", {
    case: "F3C",
    measurement: "THROUGH_THE_CONSUMER",
    question: "does rig.safeCleanup propagate the copied-marker answer for B?",
    consumerOutcome: consumer,
    observation:
      consumer.cleaned === true ? "DELETED: rig.safeCleanup removed B, whose marker belongs to A" : `PRESERVED: ${String(consumer.reason)}`,
    safe: consumer.cleaned !== true,
    bStillPresent: pathObjectExists(b.root),
    aStillPresent: pathObjectExists(a.root),
  });
  lifetimeB.dispose();
}

/* ------------------------------------------------------------------ *
 * F4a — SUBSTITUTION BEFORE THE PROOF
 * ------------------------------------------------------------------ */
if (wants("F4A")) {
  const owned = resource.allocateOwnedRoot(gateFor("f4a"), "f4a-");
  const lifetime = track(resource.ownedRootLifetime(owned));
  writeFileSync(join(owned.root, "owned-payload.txt"), "the object this run allocated\n", "utf8");
  const parked = join(sandbox.root, "f4a-parked-original");
  const substitution = substituteDirectory(owned.root, parked, "F4A-REPLACEMENT");

  const consumer = await rig.safeCleanup(owned);
  const canary = canaryIntact(substitution.canary);
  record("F4A", {
    case: "F4A",
    measurement: "THROUGH_THE_CONSUMER",
    question: "when the substitution lands BEFORE the consumer's proof, is the replacement preserved?",
    identities: { original: substitution.originalIdentity, replacement: substitution.replacementIdentity, identityChanged: substitution.identityChanged },
    consumerOutcome: consumer,
    canary,
    expectedSafe: "PRESERVED — the identity check sees the substitution",
    observation: canary.intact ? "PRESERVED: the consumer refused and the replacement survived" : "DELETED: the consumer removed a replacement it had already seen",
    safe: canary.intact,
  });
  lifetime.dispose();
}

/* ------------------------------------------------------------------ *
 * F4b — SUBSTITUTION AFTER THE PROOF, BEFORE THE DELETE (the TOCTOU window)
 * ------------------------------------------------------------------ */
if (wants("F4B")) {
  const owned = resource.allocateOwnedRoot(gateFor("f4b"), "f4b-");
  const lifetime = track(resource.ownedRootLifetime(owned));
  writeFileSync(join(owned.root, "owned-payload.txt"), "the object this run allocated\n", "utf8");

  /** Step 1: ownership validation of the original resource, by the production helper. */
  const proof = resource.revalidateOwnership(owned);
  /** Step 2: replacement of the directory entry. */
  const parked = join(sandbox.root, "f4b-parked-original");
  const substitution = substituteDirectory(owned.root, parked, "F4B-REPLACEMENT");
  /** Step 3: the destructive statement the production consumer executes. */
  let destructive;
  try {
    productionDelete(owned.root);
    destructive = { attempted: true, completed: true };
  } catch (error) {
    destructive = { attempted: true, completed: false, reason: String(error?.message ?? error) };
  }
  const canary = canaryIntact(substitution.canary);

  record("F4B", {
    case: "F4B",
    measurement: "AT_THE_WINDOW",
    fidelity:
      "the proof is the production revalidateOwnership, the destructive call is the production rmSync statement with the production options, and the substitution is between them — which is the window the consumer's own control flow creates",
    question: "is a directory substituted AFTER a successful proof but BEFORE the delete preserved?",
    fixture: { originalRoot: owned.root, parkedOriginal: parked, substitutionIsSyntheticForeignCanary: true },
    proofBeforeSubstitution: { owned: proof.owned, reason: proof.reason ?? null },
    identities: { original: substitution.originalIdentity, replacement: substitution.replacementIdentity, identityChanged: substitution.identityChanged },
    destructiveOutcome: destructive,
    canary,
    expectedSafe: "the replacement and its canary survive",
    observation: canary.intact
      ? "PRESERVED: the synthetic foreign canary survived"
      : "DELETED: the synthetic foreign canary at the owned path was destroyed after a proof taken on the previous object",
    safe: canary.intact,
    originalSurvived: pathObjectExists(join(parked, "owned-payload.txt")),
  });
  lifetime.dispose();
}

/* ------------------------------------------------------------------ *
 * F5 — PARENT-DIRECTORY REPLACEMENT
 * ------------------------------------------------------------------ */
if (wants("F5")) {
  const outer = join(sandbox.root, "f5-outer");
  const gate = join(outer, "gate");
  mkdirSync(gate, { recursive: true });
  const owned = resource.allocateOwnedRoot(gate, "f5-");
  const lifetime = track(resource.ownedRootLifetime(owned));
  writeFileSync(join(owned.root, "owned-payload.txt"), "the object this run allocated\n", "utf8");

  /**
   * The PARENT component is redirected: the gate root is renamed aside and a junction is placed at its old path,
   * pointing at a synthetic tree containing a directory with the SAME NAME as the owned root.
   */
  const parkedGate = join(outer, "gate-parked");
  const elsewhere = join(sandbox.root, "f5-elsewhere");
  const impostor = writeForeignCanary(join(elsewhere, owned.root.split(/[\\/]/u).pop()), "F5-IMPOSTOR");
  renameSync(gate, parkedGate);
  symlinkSync(elsewhere, gate, "junction");

  const proof = resource.revalidateOwnership(owned);
  const consumer = await rig.safeCleanup(owned);
  const canary = canaryIntact(impostor);
  record("F5", {
    case: "F5",
    measurement: "THROUGH_THE_CONSUMER",
    question: "is an altered parent component detected before deletion?",
    fixture: { gateRootRenamedTo: parkedGate, junctionAt: gate, junctionTarget: elsewhere, impostorRoot: impostor.directory },
    expectedSafe: "REFUSED — the containment relationship changed",
    observedProof: { owned: proof.owned, reason: proof.reason ?? null, checks: proof.checks },
    consumerOutcome: consumer,
    canary,
    observation: canary.intact
      ? `PRESERVED: the impostor survived; the consumer ${consumer.cleaned === true ? "reported cleaned" : "refused"}`
      : "DELETED: the impostor at the redirected parent was destroyed",
    safe: canary.intact,
    note: "the original gate root is preserved at the parked path, so nothing real is lost by this arm",
  });
  lifetime.dispose();
}

/* ------------------------------------------------------------------ *
 * F6 — JUNCTION / REPARSE ESCAPE INSIDE THE OWNED ROOT
 * ------------------------------------------------------------------ */
if (wants("F6")) {
  const owned = resource.allocateOwnedRoot(gateFor("f6"), "f6-");
  const lifetime = track(resource.ownedRootLifetime(owned));
  const external = join(sandbox.root, "f6-external-target");
  const externalCanary = writeForeignCanary(external, "F6-EXTERNAL");
  symlinkSync(external, join(owned.root, "escape-link"), "junction");

  const consumer = await rig.safeCleanup(owned);
  const canary = canaryIntact(externalCanary);
  record("F6", {
    case: "F6",
    measurement: "THROUGH_THE_CONSUMER",
    question: "does a junction INSIDE the owned root let a recursive deletion reach the external target?",
    fixture: { ownedRoot: owned.root, junction: join(owned.root, "escape-link"), externalTarget: external },
    expectedSafe: "the external target survives",
    consumerOutcome: consumer,
    canary,
    observation: canary.intact
      ? "PRESERVED: the external target survived the recursive removal"
      : "DELETED: the recursive removal reached through the junction and destroyed the external target",
    safe: canary.intact,
    note: "measured, not assumed: an earlier observation of this platform's junction behaviour does not settle it",
  });
  lifetime.dispose();
}

/* ------------------------------------------------------------------ *
 * F7 — CLEANUP FAILURE, THEN RETRY
 * ------------------------------------------------------------------ */
if (wants("F7")) {
  const owned = resource.allocateOwnedRoot(gateFor("f7"), "f7-");
  const lifetime = track(resource.ownedRootLifetime(owned, { maxAttempts: 3 }));
  /**
   * THE INJECTION IS A REAL LOCK. On Windows a directory that is the current directory of a running process cannot
   * be removed. A child process chdir's into a subdirectory of the owned root and stays alive, so the removal is
   * refused by the operating system rather than by a simulated flag. Whether the refusal actually occurs is
   * measured, not assumed: if the first attempt succeeds the arm is reported OBSERVED and the injection is
   * declared ineffective.
   */
  const locked = join(owned.root, "locked-dir");
  mkdirSync(locked, { recursive: true });
  writeFileSync(join(locked, "held.txt"), "this directory is a live working directory\n", "utf8");
  const child = spawn(process.execPath, ["-e", `process.chdir(${JSON.stringify(locked)}); console.log("READY"); setInterval(() => {}, 1000);`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((done) => {
    const timer = setTimeout(done, 5000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("READY")) {
        clearTimeout(timer);
        done();
      }
    });
  });

  const first = lifetime.dispose();
  const afterFailure = pathObjectExists(owned.root);
  child.kill();
  await new Promise((done) => setTimeout(done, 400));
  const second = lifetime.retry();

  const injectionWorked = first.cleaned !== true && afterFailure;
  record("F7", {
    case: "F7",
    measurement: "THROUGH_THE_CONSUMER",
    question: "does a real removal failure latch a false disposed state, and can it be retried after release?",
    injection: "a live child process whose working directory is inside the owned root",
    injectionWorked,
    firstAttempt: first,
    rootPresentAfterFailure: afterFailure,
    secondAttempt: second,
    rootPresentAfterRetry: pathObjectExists(owned.root),
    expectedSafe: "the first attempt reports failure and does not latch success; a retry after release succeeds",
    observation: !injectionWorked
      ? `INJECTION INEFFECTIVE: the first attempt already reported cleaned=${String(first.cleaned)}; this arm measured nothing about failure handling`
      : `${first.cleaned === true ? "FALSE COMPLETION while the root survived" : "first attempt reported failure"} then ${second.cleaned === true ? "retry succeeded" : "retry did not succeed"}`,
    safe: injectionWorked ? second.cleaned === true && afterFailure === true : null,
    latchedFalseSuccess: first.cleaned === true && afterFailure === true,
  });
}

/* ------------------------------------------------------------------ *
 * F8 — ACTIVE OWNER AND STALE OPERATION
 * ------------------------------------------------------------------ */
if (wants("F8")) {
  const owned = resource.allocateOwnedRoot(gateFor("f8"), "f8-");
  const lifetime = track(resource.ownedRootLifetime(owned));
  const marker = JSON.parse(readFileSync(join(owned.root, resource.MARKER_NAME), "utf8"));
  const staleRecord = { ...owned };
  const staleProof = resource.revalidateOwnership(staleRecord);
  const hasGeneration =
    ["generation", "operationEpoch", "operationId"].some(
      (field) => Object.prototype.hasOwnProperty.call(owned, field) || Object.prototype.hasOwnProperty.call(marker, field),
    );
  record("F8", {
    case: "F8",
    measurement: "STRUCTURAL",
    question: "can an OLD authorization be reused after recovery or ownership handoff?",
    markerFields: Object.keys(marker).sort(),
    operationGenerationPresent: hasGeneration,
    staleRecordAccepted: staleProof.owned === true,
    observation: hasGeneration
      ? "an operation generation exists; whether it is enforced at the destructive boundary is measured separately"
      : "NO OPERATION GENERATION: a record captured at allocation remains sufficient to delete the same object for as long as the object persists. Authorization is bound to object identity, not to the operation that requested it.",
    expectedSafe: "a superseded operation cannot authorize a destructive effect",
    safe: false,
    gapType: "MISSING_OPERATION_GENERATION",
    note: "recorded as a gap rather than silently corrected: a new persistent field is introduced only against a demonstrated stale-operation failure",
  });
  lifetime.dispose();
}

/* ------------------------------------------------------------------ *
 * F9 — NORMAL POSITIVE CONTROL, AND REPEATED CLEANUP
 * ------------------------------------------------------------------ */
if (wants("F9")) {
  const owned = resource.allocateOwnedRoot(gateFor("f9"), "f9-");
  const lifetime = track(resource.ownedRootLifetime(owned));
  writeFileSync(join(owned.root, "legitimate-payload.txt"), "a normal run-owned resource\n", "utf8");
  const before = pathObjectExists(owned.root);
  const result = lifetime.dispose();
  const after = pathObjectExists(owned.root);
  record("F9", {
    case: "F9",
    measurement: "THROUGH_THE_CONSUMER",
    question: "is a legitimate run-owned resource disposed normally?",
    expectedSafe: "DISPOSED — a design that refuses every cleanup does not satisfy the stage",
    presentBefore: before,
    presentAfter: after,
    outcome: result,
    observation: result.cleaned === true && after === false ? "DISPOSED: the legitimate resource was reclaimed" : "NOT DISPOSED: a legitimate cleanup was refused or failed",
    safe: result.cleaned === true && after === false,
  });

  /** A NEW occupant at the reused path must survive a repeated disposal (I5). */
  rmSync(owned.root, { recursive: true, force: true });
  mkdirSync(owned.root, { recursive: true });
  const replacement = writeForeignCanary(owned.root, "F9-NEW-OCCUPANT");
  const repeat = lifetime.dispose();
  const repeatCanary = canaryIntact(replacement);
  record("F9B", {
    case: "F9B",
    measurement: "THROUGH_THE_CONSUMER",
    question: "does a repeated disposal delete a NEW occupant at the reused path?",
    repeatOutcome: repeat,
    newOccupant: repeatCanary,
    expectedSafe: "the new occupant survives",
    observation: repeatCanary.intact ? "PRESERVED: the new occupant survived a repeated disposal" : "DELETED: a repeated disposal removed a new occupant at the reused path",
    safe: repeatCanary.intact,
  });
}

/* ------------------------------------------------------------------ *
 * F10 — CONSUMER REFUSAL OVERRIDE (legacy-shaped record)
 * ------------------------------------------------------------------ */
if (wants("F10")) {
  const gate = gateFor("f10");
  const root = join(gate, "f10-legacy-shaped");
  mkdirSync(root, { recursive: true });
  const canary = writeForeignCanary(root, "F10-LEGACY-SHAPED");
  /**
   * A record carrying the OLD shape: `contained` and `isReparse` cached at allocation, no identity, no gateRoot.
   * This is what `rig.safeCleanup` treats as a legacy record.
   */
  const legacy = { root, contained: true, isReparse: false };
  const consumer = await rig.safeCleanup(legacy);
  const state = canaryIntact(canary);
  record("F10", {
    case: "F10",
    measurement: "THROUGH_THE_CONSUMER",
    question: "does rig.safeCleanup convert an ownership refusal into a deletion for a legacy-shaped record?",
    fixture: { root, recordShape: Object.keys(legacy) },
    expectedSafe: "REFUSED — a record with no identity cannot authorize deletion",
    consumerOutcome: consumer,
    canary: state,
    observation: state.intact
      ? "PRESERVED: the legacy-shaped record was refused"
      : "DELETED: the cached booleans alone authorized the deletion of an object with no recorded identity",
    safe: state.intact,
  });
}

/* ------------------------------------------------------------------ *
 * TEARDOWN
 * ------------------------------------------------------------------ */
for (const lifetime of cleanupRegistry) {
  try {
    lifetime.dispose();
  } catch {
    /* best effort; the sandbox removal below is the backstop */
  }
}
const teardown = removeTreeNoFollow(sandbox.root);

const summary = {
  total: results.length,
  safe: results.filter((entry) => entry.safe === true).length,
  unsafe: results.filter((entry) => entry.safe === false).length,
  unmeasured: results.filter((entry) => entry.safe === null || entry.safe === undefined).length,
  unsafeArms: results.filter((entry) => entry.safe === false).map((entry) => entry.arm),
};

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE3_FALSIFIERS",
  stage: "Palimpsest Host-S1RA-E3",
  measuredAt: new Date().toISOString(),
  implementation: {
    ownershipModule: "scripts/trajectory_p2b/owned-resource.mjs",
    consumerModule: "scripts/trajectory_p2b/rig.mjs",
    ownershipModuleDigest: (await import("./fixtures.mjs")).digestOfFile("scripts/trajectory_p2b/owned-resource.mjs"),
    consumerModuleDigest: (await import("./fixtures.mjs")).digestOfFile("scripts/trajectory_p2b/rig.mjs"),
  },
  sandbox: { root: sandbox.root, gateRoot: sandbox.gateRoot, containment, removed: teardown.removed, teardownReason: teardown.reason ?? null },
  summary,
  results,
};
const jsonPath = args.get("json");
if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

void closeSync;
void openSync;
void identityOf;
