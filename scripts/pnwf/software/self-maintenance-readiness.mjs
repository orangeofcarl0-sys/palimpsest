/** Independent ordinary-tool replay for the direct-work readiness maintenance ticket. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const candidateRoot = process.cwd();
const { installProduct } = await import(pathToFileURL(join(candidateRoot, "dist/src/product.js")));
const root = mkdtempSync(join(tmpdir(), "maintenance-readiness-"));
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const commit = message => {
  git("add", "--", "maintenance.md");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", message);
  return git("rev-parse", "HEAD");
};
git("init", "-q");
const artifact = join(root, "maintenance.md");
writeFileSync(artifact, "Maintenance basis\n");
const basis = commit("Initial project basis");
const stateDir = mkdtempSync(join(tmpdir(), "maintenance-readiness-state-"));
const deployment = installProduct({ tools: { register: () => () => undefined } }, {
  projectId: "direct-maintenance-repro", repository: root, stateDir,
  execution: "in-place", toolProfile: "normal",
  standard: { statement: "Deliver the documented maintenance result.", clauses: [], derivedFrom: [], confirmed: true, notes: [] },
});
let ordinal = 0;
function call(name, args) {
  const tool = deployment.tools.find(entry => entry.name === name);
  if (!tool) throw new Error(`Missing ordinary tool ${name}`);
  const callId = `direct-probe-${++ordinal}`;
  return tool.execute(args, { name, callId, rootCallId: callId, arguments: args, signal: AbortSignal.timeout(20_000) });
}
const ready = () => call("palimpsest_work", { action: "readiness" });
const advice = value => (value.next ?? []).join(" ");
const recommendsDeliver = value => /\bconclude\b/i.test(advice(value)) && /\bDELIVER\b/.test(advice(value));
try {
  await call("palimpsest_start", { projectId: "direct-maintenance-repro", goal: "Finish the maintenance update.", headCommit: basis, tasks: [] });
  const initial = await ready();
  writeFileSync(artifact, "Maintenance result\n");
  const dirty = await ready();
  const candidate = commit("Finish direct maintenance result");
  const committed = await ready();
  const delivered = await call("palimpsest_work", { action: "conclude", intent: "DELIVER",
    artifacts: ["maintenance.md"], statement: "The direct maintenance result is committed and reviewable." });
  const afterDelivery = await ready();
  writeFileSync(artifact, "Maintenance result with uncommitted changes\n");
  const dirtyAfterDelivery = await ready();
  const status = deployment.controller.status();
  const checks = {
    initialHasNoDeliveryAdvice: !recommendsDeliver(initial),
    dirtyHasNoDeliveryAdvice: !recommendsDeliver(dirty) && !recommendsDeliver(dirtyAfterDelivery),
    cleanCommitSuggestsDelivery: committed.action === "SEMANTIC_JUDGEMENT" && recommendsDeliver(committed),
    recordedDeliveryCanClose: delivered.state === "RECORDED" && delivered.session.mayEnd,
    afterDeliveryAvoidsRepeatedConclusion: afterDelivery.action === "SEMANTIC_JUDGEMENT" && !recommendsDeliver(afterDelivery) &&
      /\breply\b|\brecorded\b|\bconclusion\b/i.test(advice(afterDelivery)),
    operatorBasisPreserved: status.headCommit === basis && status.attempts.length === 0 && status.promotions.length === 0,
  };
  console.log("DIRECT_READINESS " + JSON.stringify({ basis, candidate, checks, initial, dirty, committed, afterDelivery, dirtyAfterDelivery }));
  process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
} finally {
  await deployment.dispose();
}
