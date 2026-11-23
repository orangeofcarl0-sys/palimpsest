import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { readStream } from "../../analyze_energy_trajectory.mjs";
import { readJson } from "../../energy/contract.mjs";
import { GitHubMaintenanceRuntime, publish } from "./github-maintenance-runtime.mjs";
import { sealOf } from "./slot.mjs";
import { copyDatabases, manifest } from "./workspace.mjs";

const config = process.env.PALIMPSEST_GITHUB_RECOVERY_MOCK;

test("an archived rejected candidate can retire its original task, record DELIVER, and pass frozen acceptance", { skip: !config }, async () => {
  const { planPath, seed, bundle, root, output } = readJson(resolve(config));
  const plan = readJson(planPath);
  const spec = plan.work[0];
  const original = readJson(join(plan.root, "resident-status.json")).work.find(work => work.id === spec.id);
  assert.equal(original.state, "REJECTED");
  assert.equal(original.reason, "candidate-bound-delivery");
  assert(original.settlement.reconciled);
  const { releaseAtDispatch: release, settlement: prior } = original;
  const archive = prior.archive;
  const sessionPath = join("work", spec.id, "session");
  const source = join(plan.root, sessionPath), destination = join(root, sessionPath);
  const priorState = join(source, "stages", "MAINTAIN", "state");
  const checkpoint = sealOf(manifest(priorState));
  const { candidate } = readJson(join(source, "submission-facts.json")).submission;
  mkdirSync(destination, { recursive: true });
  for (const file of ["candidate.bundle", "session.json", "submission-facts.json", "request-ledger.sqlite"]) {
    copyFileSync(join(source, file), join(destination, file));
  }
  copyDatabases(priorState, join(destination, "stages", "MAINTAIN", "state"));
  const canonicalMarker = join("project", release.candidate, "github-project-initialized");
  mkdirSync(dirname(join(root, canonicalMarker)), { recursive: true });
  copyFileSync(join(plan.root, canonicalMarker), join(root, canonicalMarker));

  const scope = { ...plan.scope, mode: "mock" };
  const runtime = new GitHubMaintenanceRuntime({ ...plan, scope, root, remote: null, providerProbe: null });
  const ref = "refs/palimpsest/source/" + release.candidate;
  runtime.git("fetch", "-q", "--no-tags", join(plan.root, "source", release.candidate + ".bundle"), ref + ":" + ref);
  const seedRef = "refs/palimpsest/source/" + seed;
  runtime.git("fetch", "-q", "--no-tags", bundle, seedRef + ":" + seedRef);
  const sourceTree = runtime.git("rev-parse", seed + "^{tree}");
  const previous = { ...original, spec: { ...spec, mock: true } };
  assert.throws(() => runtime.prepareRecovery(previous, {
    archive, candidate, seed, bundle, sourceTree, checkpoint: "0".repeat(64),
  }), /GITHUB_REWORK_CHECKPOINT_CHANGED/u);
  const recovery = runtime.prepareRecovery(previous, { archive, candidate, seed, bundle, sourceTree, checkpoint });
  const work = { ...previous, recovery };
  work.input = await runtime.prepareSession({ work, release, comments: [] });
  const settlement = await runtime.execute(work);
  assert(settlement.natural && settlement.reconciled);
  assert.equal(settlement.requests, 5);
  work.settlement = settlement;
  const review = await runtime.review(work);
  assert.equal(review.candidate, seed);
  assert(review.pass && review.delivery);
  const folder = runtime.runPath(work);
  const row = readJson(join(folder, "session.json"));
  const tape = readStream(join(folder, "runtime-MAINTAIN", "sessions", row.trajectory.stream), row.trajectory.sha256);
  const first = row.trajectory.calls.find(call => call.action === "readiness");
  const response = tape.find(event => event.type === "tool/result" && event.data.message.toolCallId === first.callId);
  const readiness = JSON.parse(response.data.message.content.map(block => block.text ?? "").join("\n"));
  assert.equal(readiness.action, "SEMANTIC_JUDGEMENT");
  assert(readiness.next[0].includes("action=plan"));
  assert.equal(review.old.exit, 1);
  assert.equal(review.next.exit, 0);
  assert.deepEqual(readFileSync(join(source, "request-ledger.sqlite")), readFileSync(join(destination, "request-ledger.sqlite")));
  const proof = { mode: "mock", paidRequests: 0, pass: true, id: spec.id, archive, candidate, seed, sourceTree, checkpoint,
    image: plan.image, installation: recovery.install, settlement, review,
    transcript: row.trajectory.sha256 };
  publish(output, { proof, receipt: sealOf(proof) });
});
