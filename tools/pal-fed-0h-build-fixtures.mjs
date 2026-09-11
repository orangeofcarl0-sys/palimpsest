#!/usr/bin/env node
/**
 * PAL-FED-0H fixture builder (EXPERIMENT TOOLING).
 *
 * Materializes, under the frozen 0H root:
 *   snapshots/<fixture>/            palimpsest-style workspaces with overlays
 *   resolver/ordarium-<fixture>/    responder workspaces holding the resolution
 *   provenance/<fixture>.json       model-visible source provenance (H2 only)
 *   PAL-FED-0H-SCENARIOS.json       prompts + hidden scoring ground truth
 *
 * V = version/temporal-scope resolvable (historical/superseded source out of scope)
 * L = local precedence rule present and applicable
 * I = irreducible: two current, co-applicable, materially conflicting sources,
 *     no local precedence rule; the responder workspace holds the resolution
 *     (SYNTHETIC CONTROLLED CONFLICT where no natural one exists)
 * N = consistent authoritative sources (no conflict)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.argv[process.argv.indexOf("--root") + 1] ?? "F:/Codex_Work_Space/pal-fed-0h";
const SRC = "F:/Codex_Work_Space/pal-fed-0g/snapshots";
const P_BASE = `${SRC}/palimpsest-base-1.3.1`;
const O_SNAP = `${SRC}/ordarium-073409b`;

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(join(ROOT, "snapshots"), { recursive: true });
mkdirSync(join(ROOT, "resolver"), { recursive: true });
mkdirSync(join(ROOT, "provenance"), { recursive: true });

const POLICY = `# Source precedence policy (PLMP-ALN-2)

When sources in this repository appear to disagree about a pinned dependency
interface, apply this order:

1. The **published contract of the exact pinned version** (its shipped type
   declarations and release specification) governs that interface's behaviour.
2. The project's **normative specification** (PLMP-SDS, docs/engineering/03)
   governs project-internal semantics.
3. **Informational records** — engineering notes, historical alignment records,
   release commentaries — are explanatory only and never override 1 or 2.
4. A source explicitly marked **superseded** is void.

Cross-repository authority remains with the owning project (see
docs/engineering/07-ordarium-alignment.md).
`;

const NOTES = {
  "docs/engineering/notes/cursor-note.md": `# Note: observation cursor (informational)

Our reading of an earlier Ordarium line was that cursor positions are
**per-subscription**, not global. This note is explanatory and was not updated
against the current pinned artifact.

Status: informational, not normative.
`,
  "docs/engineering/notes/error-code-note.md": `# Note: cursor rejection error (informational)

Historically the cursor-rejection failure was surfaced as numeric code **27**,
and integrations classified it by that number.

Status: informational, not normative.
`,
  "docs/engineering/notes/host-contract-note.md": `# Note: host contract version (informational)

An early integration note recorded the host contract version as **2**.

Status: informational, not normative.
`,
};

const HISTORICAL = {
  "docs/release-commentary-1.2.0.md": `# Release commentary 1.2.0 (historical)

This commentary describes the state at the **1.2.0** release line: it predates
the incremental state-change feed, so it has no notion of a change-feed cursor
and no cursor-invalidation failure. Anything here applies only to the 1.2.0 line.

Status: historical, superseded by later releases.
`,
  "docs/engineering/10-legacy-error-codes.md": `# Legacy error codes (historical)

Superseded register: the 1.2.0 line reported a generic ledger failure rather than
a dedicated cursor-rejection error.

Status: superseded — void for the current pinned line.
`,
  "docs/engineering/11-superseded-interface-note.md": `# Superseded interface note

> SUPERSEDED — do not use. Replaced by the pinned dependency's shipped contract.

This note described the pre-feed interface. It is void for the current pinned
integration.
`,
};

const CONFLICT = {
  a: (topic) => `# ${topic} — current interface record A (normative, current scope)

Version scope: current pinned line.
Status: normative.

Record A states: the ${topic} contract is **global** — one position shared by all
readers of the store.
`,
  b: (topic) => `# ${topic} — current interface record B (normative, current scope)

Version scope: current pinned line.
Status: normative.

Record B states: the ${topic} contract is **per-consumer** — each consumer holds
its own independent position.
`,
};

const TOPICS = {
  I1: "observation cursor semantics",
  I2: "state-change feed ordering",
  I3: "cursor-rejection error contract",
};

const RESOLUTION = (topic, answer) => `# Authoritative resolution: ${topic}

Owner: Ordarium. Scope: current published line. Status: normative decision.

Resolution: ${answer}
`;

function buildPalimpsestFixture(name, overlays) {
  const dir = join(ROOT, "snapshots", name);
  cpSync(P_BASE, dir, { recursive: true });
  for (const [rel, content] of Object.entries(overlays)) {
    const file = join(dir, rel);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}
function buildOrdariumResolver(name, overlays) {
  const dir = join(ROOT, "resolver", name);
  cpSync(O_SNAP, dir, { recursive: true });
  for (const [rel, content] of Object.entries(overlays)) {
    const file = join(dir, rel);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

const fixtures = {
  V1: buildPalimpsestFixture("V1-manifest-vs-commentary", { "docs/release-commentary-1.2.0.md": HISTORICAL["docs/release-commentary-1.2.0.md"] }),
  V2: buildPalimpsestFixture("V2-legacy-error-codes", { "docs/engineering/10-legacy-error-codes.md": HISTORICAL["docs/engineering/10-legacy-error-codes.md"] }),
  V3: buildPalimpsestFixture("V3-superseded-interface-note", { "docs/engineering/11-superseded-interface-note.md": HISTORICAL["docs/engineering/11-superseded-interface-note.md"] }),
  L1: buildPalimpsestFixture("L1-precedence-cursor", { "docs/engineering/08-source-precedence-policy.md": POLICY, "docs/engineering/notes/cursor-note.md": NOTES["docs/engineering/notes/cursor-note.md"] }),
  L2: buildPalimpsestFixture("L2-precedence-error-code", { "docs/engineering/08-source-precedence-policy.md": POLICY, "docs/engineering/notes/error-code-note.md": NOTES["docs/engineering/notes/error-code-note.md"] }),
  L3: buildPalimpsestFixture("L3-precedence-host-contract", { "docs/engineering/08-source-precedence-policy.md": POLICY, "docs/engineering/notes/host-contract-note.md": NOTES["docs/engineering/notes/host-contract-note.md"] }),
  I1: buildPalimpsestFixture("I1-current-conflict-cursor", {
    "docs/engineering/09-observation-contract-a.md": CONFLICT.a(TOPICS.I1),
    "docs/engineering/09-observation-contract-b.md": CONFLICT.b(TOPICS.I1),
  }),
  I2: buildPalimpsestFixture("I2-current-conflict-ordering", {
    "docs/engineering/09-ordering-contract-a.md": CONFLICT.a(TOPICS.I2),
    "docs/engineering/09-ordering-contract-b.md": CONFLICT.b(TOPICS.I2),
  }),
  I3: buildPalimpsestFixture("I3-current-conflict-error", {
    "docs/engineering/09-error-contract-a.md": CONFLICT.a(TOPICS.I3),
    "docs/engineering/09-error-contract-b.md": CONFLICT.b(TOPICS.I3),
  }),
  N1: buildPalimpsestFixture("N1-consistent", {}),
  SO_V: buildPalimpsestFixture("SO-V-local-ordarium", { "docs/release-commentary-1.2.0.md": HISTORICAL["docs/release-commentary-1.2.0.md"] }),
  SO_I: buildPalimpsestFixture("SO-I-resolver-palimpsest", {
    "docs/engineering/resolution-ordering.md": `# Authoritative resolution: state-change feed ordering

Owner: Palimpsest (as the consumer whose requirement drives it).
Status: normative decision.

Resolution: the feed orders changes by durable commit position (total order);
per-namespace ordering alone is not sufficient for replay.
`,
  }),
};

// Responder (ordarium) workspaces that hold the resolution for I scenarios.
const resolvers = {
  I1: buildOrdariumResolver("ordarium-I1", { "docs/authoritative-observation-contract.md": RESOLUTION(TOPICS.I1, "the cursor is a single global position in the pinned line; per-consumer positions are not supported.") }),
  I2: buildOrdariumResolver("ordarium-I2", { "docs/authoritative-feed-ordering.md": RESOLUTION(TOPICS.I2, "the feed publishes a single global commit order; per-namespace ordering is not a published guarantee.") }),
  I3: buildOrdariumResolver("ordarium-I3", { "docs/authoritative-error-contract.md": RESOLUTION(TOPICS.I3, "a rejected cursor raises the dedicated invalid-cursor error in the current line; no generic code is promised.") }),
  SO_V: buildOrdariumResolver("ordarium-SO-V", { "docs/release-commentary-1.2.0.md": HISTORICAL["docs/release-commentary-1.2.0.md"] }),
  SO_I: buildOrdariumResolver("ordarium-SO-I", {
    "docs/engineering/09-ordering-contract-a.md": CONFLICT.a(TOPICS.I2),
    "docs/engineering/09-ordering-contract-b.md": CONFLICT.b(TOPICS.I2),
  }),
};

// ---- Model-visible provenance sidecars (H2 only) --------------------------
const prov = {
  V1: {
    "package.json": { sourceId: "pin-manifest", owner: "palimpsest", sourceKind: "implementation", versionScope: "1.3.1", temporalScope: "current_fixture", normativeStatus: "descriptive" },
    "docs/release-commentary-1.2.0.md": { sourceId: "commentary-1.2.0", owner: "palimpsest", sourceKind: "release_note", versionScope: "1.2.0", temporalScope: "historical", normativeStatus: "informational" },
    "node_modules/@ordarium/core/dist/src/state.d.ts": { sourceId: "ordarium-1.3.1-types", owner: "ordarium", sourceKind: "published_contract", versionScope: "1.3.1", temporalScope: "frozen_version", normativeStatus: "normative", authorityDomain: "ordarium-interface" },
  },
  V2: {
    "docs/engineering/10-legacy-error-codes.md": { sourceId: "legacy-codes", owner: "palimpsest", sourceKind: "engineering_note", versionScope: "1.2.0", temporalScope: "historical", normativeStatus: "informational" },
    "node_modules/@ordarium/core/dist/src/errors.d.ts": { sourceId: "ordarium-1.3.1-errors", owner: "ordarium", sourceKind: "published_contract", versionScope: "1.3.1", temporalScope: "frozen_version", normativeStatus: "normative", authorityDomain: "ordarium-interface" },
  },
  V3: {
    "docs/engineering/11-superseded-interface-note.md": { sourceId: "superseded-note", owner: "palimpsest", sourceKind: "engineering_note", versionScope: "pre-feed", temporalScope: "historical", normativeStatus: "informational", supersedes: [] },
    "node_modules/@ordarium/core/dist/src/host.d.ts": { sourceId: "ordarium-1.3.1-host", owner: "ordarium", sourceKind: "published_contract", versionScope: "1.3.1", temporalScope: "frozen_version", normativeStatus: "normative", authorityDomain: "ordarium-interface" },
  },
  L1: {
    "docs/engineering/08-source-precedence-policy.md": { sourceId: "precedence-policy", owner: "palimpsest", sourceKind: "normative_spec", temporalScope: "current_fixture", normativeStatus: "normative", authorityDomain: "palimpsest-documentation" },
    "docs/engineering/notes/cursor-note.md": { sourceId: "cursor-note", owner: "palimpsest", sourceKind: "engineering_note", temporalScope: "current_fixture", normativeStatus: "informational" },
    "node_modules/@ordarium/core/dist/src/state.d.ts": { sourceId: "ordarium-1.3.1-types", owner: "ordarium", sourceKind: "published_contract", versionScope: "1.3.1", temporalScope: "frozen_version", normativeStatus: "normative", authorityDomain: "ordarium-interface" },
  },
  L2: {
    "docs/engineering/08-source-precedence-policy.md": { sourceId: "precedence-policy", owner: "palimpsest", sourceKind: "normative_spec", temporalScope: "current_fixture", normativeStatus: "normative", authorityDomain: "palimpsest-documentation" },
    "docs/engineering/notes/error-code-note.md": { sourceId: "error-note", owner: "palimpsest", sourceKind: "engineering_note", temporalScope: "current_fixture", normativeStatus: "informational" },
    "node_modules/@ordarium/core/dist/src/errors.d.ts": { sourceId: "ordarium-1.3.1-errors", owner: "ordarium", sourceKind: "published_contract", versionScope: "1.3.1", temporalScope: "frozen_version", normativeStatus: "normative", authorityDomain: "ordarium-interface" },
  },
  L3: {
    "docs/engineering/08-source-precedence-policy.md": { sourceId: "precedence-policy", owner: "palimpsest", sourceKind: "normative_spec", temporalScope: "current_fixture", normativeStatus: "normative", authorityDomain: "palimpsest-documentation" },
    "docs/engineering/notes/host-contract-note.md": { sourceId: "host-note", owner: "palimpsest", sourceKind: "engineering_note", temporalScope: "current_fixture", normativeStatus: "informational" },
    "node_modules/@ordarium/core/dist/src/host.d.ts": { sourceId: "ordarium-1.3.1-host", owner: "ordarium", sourceKind: "published_contract", versionScope: "1.3.1", temporalScope: "frozen_version", normativeStatus: "normative", authorityDomain: "ordarium-interface" },
  },
};
for (const [name, sources] of Object.entries(prov)) {
  writeFileSync(join(ROOT, "provenance", `${name}.json`), `${JSON.stringify({ experimental: true, sources }, null, 2)}\n`);
}
writeFileSync(join(ROOT, "provenance", "V1.json"), `${JSON.stringify({ experimental: true, sources: prov.V1 }, null, 2)}\n`);

// ---- Scenarios (prompts + hidden scoring ground truth) --------------------
const S = (scenarioId, cls, fixture, resolver, focalPeer, operatorPrompt, extra) => ({
  scenarioId, class: cls, focalPeer, fixturePalimpsest: fixture, resolverOrdarium: resolver,
  operatorPrompt, syntheticOverlay: cls === "I", ...extra,
});
const scenarios = {
  protocol: "PAL-FED-0H",
  frozen: true,
  note: "Hidden scoring manifest — never model-visible. Prompts are non-directive, name no files, and avoid scope/contact cues.",
  primaryScenarios: [
    S("V1-historical-commentary", "V", "V1-manifest-vs-commentary", "ordarium-I1", "palimpsest.main",
      "Determine which observation-cursor behaviour applies to the integration represented by this workspace, and explain the decision.",
      { expectedContact: false, locallyResolvable: true, applicableSource: "node_modules/@ordarium/core/dist/src/state.d.ts", outOfScopeSource: "docs/release-commentary-1.2.0.md", resolutionMechanism: "version/temporal scope" }),
    S("V2-legacy-error-codes", "V", "V2-legacy-error-codes", "ordarium-I3", "palimpsest.main",
      "Determine which failure this workspace's integration should expect when a stored observation cursor is rejected, and explain the decision.",
      { expectedContact: false, locallyResolvable: true, applicableSource: "node_modules/@ordarium/core/dist/src/errors.d.ts", outOfScopeSource: "docs/engineering/10-legacy-error-codes.md", resolutionMechanism: "version/temporal scope" }),
    S("V3-superseded-note", "V", "V3-superseded-interface-note", "ordarium-I3", "palimpsest.main",
      "Determine the host-contract version that applies to this workspace's integration, and explain the decision.",
      { expectedContact: false, locallyResolvable: true, applicableSource: "node_modules/@ordarium/core/dist/src/host.d.ts", outOfScopeSource: "docs/engineering/11-superseded-interface-note.md", resolutionMechanism: "explicit supersession" }),
    S("L1-precedence-cursor", "L", "L1-precedence-cursor", "ordarium-I1", "palimpsest.main",
      "Determine which observation-cursor behaviour applies to the integration represented by this workspace, and explain the decision.",
      { expectedContact: false, locallyResolvable: true, applicableSource: "node_modules/@ordarium/core/dist/src/state.d.ts", outOfScopeSource: "docs/engineering/notes/cursor-note.md", resolutionMechanism: "local precedence policy" }),
    S("L2-precedence-error-code", "L", "L2-precedence-error-code", "ordarium-I3", "palimpsest.main",
      "Determine which failure this workspace's integration should expect when a stored observation cursor is rejected, and explain the decision.",
      { expectedContact: false, locallyResolvable: true, applicableSource: "node_modules/@ordarium/core/dist/src/errors.d.ts", outOfScopeSource: "docs/engineering/notes/error-code-note.md", resolutionMechanism: "local precedence policy" }),
    S("L3-precedence-host-contract", "L", "L3-precedence-host-contract", "ordarium-I3", "palimpsest.main",
      "Determine the host-contract version that applies to this workspace's integration, and explain the decision.",
      { expectedContact: false, locallyResolvable: true, applicableSource: "node_modules/@ordarium/core/dist/src/host.d.ts", outOfScopeSource: "docs/engineering/notes/host-contract-note.md", resolutionMechanism: "local precedence policy" }),
    S("I1-current-conflict-cursor", "I", "I1-current-conflict-cursor", "ordarium-I1", "palimpsest.main",
      "Determine which observation-cursor behaviour applies to the integration represented by this workspace, and explain the decision.",
      { expectedContact: true, locallyResolvable: false, conflictingSources: ["docs/engineering/09-observation-contract-a.md", "docs/engineering/09-observation-contract-b.md"], resolutionOwner: "ordarium.main", resolutionMechanism: "none (irreducible)" }),
    S("I2-current-conflict-ordering", "I", "I2-current-conflict-ordering", "ordarium-I2", "palimpsest.main",
      "Determine the ordering guarantee that applies to the integration represented by this workspace, and explain the decision.",
      { expectedContact: true, locallyResolvable: false, conflictingSources: ["docs/engineering/09-ordering-contract-a.md", "docs/engineering/09-ordering-contract-b.md"], resolutionOwner: "ordarium.main", resolutionMechanism: "none (irreducible)" }),
    S("I3-current-conflict-error", "I", "I3-current-conflict-error", "ordarium-I3", "palimpsest.main",
      "Determine which failure this workspace's integration should expect when a stored observation cursor is rejected, and explain the decision.",
      { expectedContact: true, locallyResolvable: false, conflictingSources: ["docs/engineering/09-error-contract-a.md", "docs/engineering/09-error-contract-b.md"], resolutionOwner: "ordarium.main", resolutionMechanism: "none (irreducible)" }),
    S("N1-consistent", "N", "N1-consistent", "ordarium-I1", "palimpsest.main",
      "Determine the exact semantics of the incremental state-observation cursor in the dependency pinned by this workspace, and explain the decision.",
      { expectedContact: false, locallyResolvable: true, applicableSource: "node_modules/@ordarium/core/dist/src/state.d.ts", resolutionMechanism: "single authoritative source" }),
  ],
  symmetryScenarios: [
    S("SO-V-local-ordarium", "V", "SO-V-local-ordarium", "ordarium-SO-V", "ordarium.main",
      "Determine the ordering guarantee that applies to the integration represented by this workspace, and explain the decision.",
      { expectedContact: false, locallyResolvable: true, applicableSource: "packages/core/test/state-changes.test.ts", outOfScopeSource: "docs/release-commentary-1.2.0.md", resolutionMechanism: "version/temporal scope (reverse direction)" }),
    S("SO-I-conflict-ordarium", "I", "SO-I-resolver-palimpsest", "ordarium-SO-I", "ordarium.main",
      "Determine the ordering guarantee that applies to the integration represented by this workspace, and explain the decision.",
      { expectedContact: true, locallyResolvable: false, conflictingSources: ["docs/engineering/09-ordering-contract-a.md", "docs/engineering/09-ordering-contract-b.md"], resolutionOwner: "palimpsest.main", resolutionMechanism: "none (irreducible, reverse direction)" }),
  ],
};
writeFileSync(join(ROOT, "PAL-FED-0H-SCENARIOS.json"), `${JSON.stringify(scenarios, null, 2)}\n`);
console.log(JSON.stringify({ root: ROOT, fixtures: Object.keys(fixtures).length, resolvers: Object.keys(resolvers).length, scenarios: scenarios.primaryScenarios.length + scenarios.symmetryScenarios.length }));
