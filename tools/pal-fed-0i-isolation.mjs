#!/usr/bin/env node
/**
 * PAL-FED-0I treatment-isolation proof (EXPERIMENT TOOLING, §43–§45).
 *
 * A0/A1/A2 load the SAME frozen artifact. This records machine proof that the
 * model-visible surface (guidance text, decision_submit schema/description) is
 * byte-identical across arms and that the first A1/A2 intervention response is
 * byte-identical; only trusted host admissionMode differs.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repo = resolve(import.meta.dirname, "..");
const argOf = (f, d) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const artifact = resolve(argOf("--artifact", "F:/Codex_Work_Space/pal-fed-0i/artifact"));
const out = resolve(argOf("--out", join(repo, "docs/engineering/experiments/evidence/pal-fed-0i-treatment-isolation.json")));
const sha = (text) => createHash("sha256").update(text).digest("hex");

const meta = JSON.parse(readFileSync(join(artifact, "package-metadata.json"), "utf8"));
const dist = (f) => pathToFileURL(join(artifact, "package/dist/src/federation/dsh", f)).href;
const { PAL_FED_OPERATING_GUIDANCE } = await import(dist("instructions.js"));
const { decideAdmission, buildAdmissionResponse, ADMISSION_BLOCKED_MESSAGE } = await import(dist("admission.js"));
const { buildPalFedTools } = await import(dist("tools.js"));

const stubService = {
  listEvents: async () => [],
  selfPeer: "palimpsest.main",
  fabricId: "isolation",
};

const arms = ["A0", "A1", "A2"];
const toolSurface = {};
const firstIntervention = {};
for (const mode of arms) {
  const tools = buildPalFedTools({
    service: stubService,
    selfPeer: "palimpsest.main",
    fabricId: "isolation",
    sessionScope: "sess-isolation",
    admission: { mode, runId: "iso", resolutionOwner: "ordarium.main", ticketInitial: "OPEN", attemptLogPath: join(artifact, "..", "unused.jsonl"), focalPeer: "palimpsest.main" },
  });
  const submit = tools.find((tool) => tool.name === "decision_submit");
  const surface = {
    names: tools.map((tool) => tool.name).sort(),
    decisionSubmit: { name: submit.name, description: submit.description, parameters: submit.parameters },
  };
  toolSurface[mode] = { hash: sha(JSON.stringify(surface)), surface };
  const decision = decideAdmission({ mode, disposition: "resolved", ticket: "OPEN", priorSoftInterventions: 0 });
  const response = buildAdmissionResponse(decision, "OPEN");
  firstIntervention[mode] = { hash: sha(JSON.stringify(response)), response };
}

const sameToolSurface =
  toolSurface.A0.hash === toolSurface.A1.hash && toolSurface.A1.hash === toolSurface.A2.hash;
const sameFirstIntervention =
  firstIntervention.A1.hash === firstIntervention.A2.hash &&
  JSON.stringify(firstIntervention.A1.response) === JSON.stringify(firstIntervention.A2.response);

const proof = {
  protocol: "PAL-FED-0I",
  generatedAt: new Date().toISOString(),
  artifact: { path: artifact, buildId: meta.buildId, sourceCommit: meta.sourceCommit, frozenCodeSha256: meta.frozenCodeSha256, dshVersion: meta.dshVersion, ordarium: meta.ordarium },
  sameArtifactForAllArms: true,
  guidanceTextSha256: sha(PAL_FED_OPERATING_GUIDANCE),
  guidanceTextChars: PAL_FED_OPERATING_GUIDANCE.length,
  blockedMessage: ADMISSION_BLOCKED_MESSAGE,
  blockedMessageSha256: sha(ADMISSION_BLOCKED_MESSAGE),
  toolSurfaceHashes: Object.fromEntries(arms.map((a) => [a, toolSurface[a].hash])),
  firstInterventionResponseHashes: Object.fromEntries(arms.map((a) => [a, firstIntervention[a].hash])),
  sameToolSurfaceAcrossArms: sameToolSurface,
  sameFirstInterventionResponseA1A2: sameFirstIntervention,
  firstInterventionA1: firstIntervention.A1.response,
  firstInterventionA2: firstIntervention.A2.response,
  differsOnlyBy: "trusted host admissionMode (A0 pass-through / A1 one-shot soft gate / A2 persistent hard gate)",
};
writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify({ out, sameToolSurface, sameFirstIntervention, guidanceTextSha256: proof.guidanceTextSha256, frozenCodeSha256: meta.frozenCodeSha256 }));
if (!sameToolSurface || !sameFirstIntervention) {
  console.error("ISOLATION PROOF FAILED");
  process.exit(6);
}
