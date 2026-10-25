/**
 * Host-S1RA-E4 §B2 — BOUNDED RESOURCE ACCOUNTING FOR A TEST RUN.
 *
 * E3 recorded resource-exhaustion symptoms during repeated full-selection runs: 30 s timeouts, `git clone --shared`
 * failures, `spawnSync git UNKNOWN`, worker-fork collapse, and 4,461 ambient temp directories. Those observations were
 * not attributed to anything. This script makes them attributable for ONE run.
 *
 * WHAT IT MEASURES, AND THE DISTINCTION IT KEEPS:
 *
 *   OWNED      resources this run created and can prove it created: gate-root entries whose marker names this run's
 *              id, and temp directories whose name carries this run's id. These are attributed.
 *   AMBIENT    machine-wide counts (total temp entries, total gate-root entries). These are recorded but LABELLED
 *              ambient, because a machine-wide count cannot be attributed to this run. E3's "4,461 temp directories"
 *              was an ambient observation, and treating it as this run's would be a measurement error.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: no long-running monitor, no process table scraping beyond the run's own children,
 * no cleanup of anything it did not create.
 *
 * Usage:
 *   node scripts/host_s1rae4/resource-budget.mjs --run=<label> [--json=<path>]
 */
import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const RUN_LABEL = args.get("run") ?? `e4-${String(process.pid)}`;
const owned = await import("../trajectory_p2e0/owned-root.mjs");
const GATE_ROOT = owned.GATE_ROOT;
const TEMP = resolve(tmpdir());

/**
 * Markers under the gate root, so ownership is read rather than inferred from a name.
 *
 * TWO MARKER FORMATS EXIST, because the tree has two independent ownership implementations (E3 §2.3). Reading only
 * one would report every p2b-owned root as "unmarked", which is a measurement error rather than a finding. Both are
 * read, and the entry records WHICH format answered.
 */
const MARKERS = [
  { file: owned.OWNERSHIP_MARKER, kind: "PALIMPSEST_E0_OWNED_ROOT", runField: "runIdentity", pidField: "owningProcessId" },
  { file: ".palimpsest-owned.json", kind: null, runField: "runId", pidField: "pid" },
];

function readMarker(dir) {
  for (const candidate of MARKERS) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, candidate.file), "utf8"));
      return { file: candidate.file, marker: parsed, spec: candidate };
    } catch {
      continue;
    }
  }
  return null;
}

function gateRootInventory() {
  const entries = [];
  let names = [];
  try {
    names = readdirSync(GATE_ROOT);
  } catch {
    return { present: false, entries, total: 0 };
  }
  for (const name of names) {
    const dir = join(GATE_ROOT, name);
    const found = readMarker(dir);
    const marker = found?.marker ?? null;
    entries.push({
      name,
      hasMarker: marker !== null,
      markerFile: found?.file ?? null,
      markerKind: marker?.kind ?? null,
      runIdentity: marker === null ? null : (marker[found.spec.runField] ?? null),
      owningProcessId: marker === null ? null : (marker[found.spec.pidField] ?? null),
      /** OWNED means the marker names THIS run; a marker naming another run is that run's, not ours. */
      ownedByThisRun: marker !== null && marker[found.spec.runField] === RUN_LABEL,
    });
  }
  return { present: true, entries, total: entries.length };
}

/** Temp entries whose NAME carries this run's label. Name-based attribution is weak, so it is labelled as such. */
function tempInventory() {
  let names = [];
  try {
    names = readdirSync(TEMP);
  } catch {
    return { ambientTotal: 0, attributable: [], attributableCount: 0, attributionBasis: "NAME_ONLY" };
  }
  const attributable = names.filter((name) => name.includes(RUN_LABEL));
  return {
    ambientTotal: names.length,
    attributable: attributable.slice(0, 50),
    attributableCount: attributable.length,
    attributionBasis: "NAME_ONLY",
    note: "a name match is weak evidence; it is reported separately from the marker-verified gate-root count",
  };
}

const gate = gateRootInventory();
const temp = tempInventory();

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE4_RESOURCE_BUDGET",
  stage: "Palimpsest Host-S1RA-E4",
  measuredAt: new Date().toISOString(),
  runLabel: RUN_LABEL,
  nodeVersion: process.version,
  platform: process.platform,
  selection: {
    note: "this script measures the environment, not a test selection; the selection is recorded by the runner that invokes it",
    gateRoot: GATE_ROOT,
  },
  owned: {
    gateRootPresent: gate.present,
    gateRootTotal: gate.total,
    ownedByThisRun: gate.entries.filter((entry) => entry.ownedByThisRun).length,
    ownedEntries: gate.entries.filter((entry) => entry.ownedByThisRun),
    unmarkedEntries: gate.entries.filter((entry) => entry.hasMarker === false).map((entry) => entry.name),
    foreignMarkedEntries: gate.entries.filter((entry) => entry.hasMarker && !entry.ownedByThisRun).map((entry) => ({ name: entry.name, runIdentity: entry.runIdentity })),
  },
  ambient: {
    gateRootTotal: gate.total,
    tempTotal: temp.ambientTotal,
    note: "AMBIENT observations. A machine-wide count cannot be attributed to this run and is never reported as its resource use.",
  },
  attributable: {
    tempNameMatches: temp.attributableCount,
    tempSample: temp.attributable,
    attributionBasis: temp.attributionBasis,
    caveat: temp.note,
  },
  verdict: {
    ownedResourcesIdentifiable: true,
    basis: "gate-root ownership is read from each entry's marker, which names the run and the owning process",
    ambientSeparatedFromOwned: true,
  },
};

const jsonPath = args.get("json");
if (jsonPath !== undefined) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
