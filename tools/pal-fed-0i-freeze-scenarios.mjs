#!/usr/bin/env node
/**
 * PAL-FED-0I scenario freeze (EXPERIMENT TOOLING).
 *
 * Derives the 0I hidden scoring manifest from the frozen 0H manifest WITHOUT
 * rewriting any operator prompt (§41): V/L/N/SO-V get ticketInitial=NONE,
 * I/SO-I get ticketInitial=OPEN plus the configured resolutionOwner. Fixtures
 * stay in the frozen 0H root, reused read-only (§41/§42).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const src = join(repo, "docs/engineering/experiments/PAL-FED-0H-SCENARIOS.json");
const dst = join(repo, "docs/engineering/experiments/PAL-FED-0I-SCENARIOS.json");
const doc = JSON.parse(readFileSync(src, "utf8"));

const decorate = (s) => {
  const isConflict = s.class === "I";
  return {
    ...s,
    ticketInitial: isConflict ? "OPEN" : "NONE",
    ...(isConflict ? { resolutionOwner: s.resolutionOwner ?? "ordarium.main" } : {}),
  };
};

const out = {
  protocol: "PAL-FED-0I",
  frozen: true,
  derivedFrom: "PAL-FED-0H-SCENARIOS.json (prompts unchanged)",
  note:
    "Hidden scoring manifest — never model-visible. Ticket seed is the frozen oracle " +
    "(conflictDetection=\"oracle_fixture\" for I/SO-I); Palimpsest does not detect conflicts.",
  primaryScenarios: doc.primaryScenarios.map(decorate),
  symmetryScenarios: doc.symmetryScenarios.map(decorate),
};
writeFileSync(dst, `${JSON.stringify(out, null, 2)}\n`);
const count = (list) => list.reduce((acc, s) => ({ ...acc, [s.ticketInitial]: (acc[s.ticketInitial] ?? 0) + 1 }), {});
console.log(JSON.stringify({
  dst,
  primary: count(out.primaryScenarios),
  symmetry: count(out.symmetryScenarios),
  promptsUnchanged: JSON.stringify(doc.primaryScenarios.map((s) => s.operatorPrompt)) === JSON.stringify(out.primaryScenarios.map((s) => s.operatorPrompt)) &&
    JSON.stringify(doc.symmetryScenarios.map((s) => s.operatorPrompt)) === JSON.stringify(out.symmetryScenarios.map((s) => s.operatorPrompt)),
}));
