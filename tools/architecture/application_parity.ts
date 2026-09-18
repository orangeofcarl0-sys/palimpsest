/**
 * SR-1C §21 — the golden structural parity capture.
 *
 * ONE implementation, used by `scripts/audit/application-parity.mjs` (to capture the fixture
 * from the canonical baseline) and by `test/architecture/application_parity.test.ts` (to compare
 * the refactored tree against it). Capturing it twice would let the fixture and its checker drift.
 *
 * What it records, for TWO equivalent installations:
 *
 *   packagedInstallation  the packaged deployment path with the first-party collaboration bundle
 *                         (`launchDeployment` over a normal profile) — the shape every harness and
 *                         dogfood uses. No model, no network: composing only.
 *   minimalInstallation   `installPalimpsest` with only the required options, which is where the
 *                         ABSENCE behaviour is visible: a capability that was not configured is
 *                         not a stub, it is not a key.
 *
 * Per installation: the installed capability keys, the aggregate application surface keys, the
 * DSH tool catalogue with its action sets, and the faces present at runtime. All indices are
 * sorted, so the capture is deterministic; no timestamps, absolute paths or random ids are stored.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface ParityToolEntry {
  readonly name: string;
  readonly mode: string;
  readonly actions: readonly string[];
}

export interface ParityInstallation {
  readonly installedCapabilityKeys: readonly string[];
  readonly applicationSurfaceKeys: readonly string[];
  readonly dshTools: readonly ParityToolEntry[];
  readonly applicationFacesPresent: readonly string[];
}

export interface ParityCapture {
  readonly packagedInstallation: ParityInstallation;
  readonly minimalInstallation: ParityInstallation & {
    readonly present: readonly string[];
    readonly absent: readonly string[];
  };
}

type AnyRecord = Record<string, unknown>;

const toolEntries = (tools: readonly { readonly name: string; readonly mode?: string; readonly parameters?: unknown }[]): ParityToolEntry[] =>
  tools
    .map((tool) => ({
      name: tool.name,
      mode: typeof tool.mode === "string" ? tool.mode : "unknown",
      actions: [
        ...(((tool.parameters as { readonly properties?: { readonly action?: { readonly enum?: readonly string[] } } })
          ?.properties?.action?.enum ?? []) as readonly string[]),
      ],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Capture one installation. `distRoot` is the BUILT tree to load from, so the same code can
 * capture a baseline worktree and the branch's own build.
 */
export async function captureApplicationParity(distRoot: string): Promise<ParityCapture> {
  const dist = (relative: string): string => pathToFileURL(join(distRoot, "dist", "src", relative)).href;
  const { installPalimpsest } = (await import(dist("install.js"))) as {
    readonly installPalimpsest: (context: unknown, options: AnyRecord) => AnyRecord & { readonly dispose?: () => Promise<void> };
  };
  const { launchDeployment, parseDeploymentProfile } = (await import(dist("deployment/index.js"))) as {
    readonly launchDeployment: (profile: unknown) => { readonly installed: AnyRecord; readonly close: () => Promise<void> };
    readonly parseDeploymentProfile: (raw: unknown) => unknown;
  };
  const { defineApplicationTools } = (await import(dist("tools/application_tools.js"))) as {
    readonly defineApplicationTools: (application: unknown) => readonly { readonly name: string; readonly mode?: string; readonly parameters?: unknown }[];
  };

  const tmp = mkdtempSync(join(tmpdir(), "palimpsest-parity-"));
  const registered: unknown[] = [];
  const context = { tools: { register: (definition: unknown) => (registered.push(definition), () => {}) } };

  const installed = installPalimpsest(context, {
    projectId: "parity-project",
    repository: distRoot,
    databasePath: join(tmp, "orchestration.sqlite"),
    ordariumDatabasePath: join(tmp, "ordarium.sqlite"),
  });
  const installedKeys = Object.keys(installed).sort();
  const minimalApplication = installed.application as AnyRecord;
  const minimal: ParityInstallation & { present: readonly string[]; absent: readonly string[] } = {
    installedCapabilityKeys: installedKeys,
    applicationSurfaceKeys: Object.keys(minimalApplication).sort(),
    dshTools: toolEntries(defineApplicationTools(minimalApplication)),
    applicationFacesPresent: Object.keys(minimalApplication).filter((key) => minimalApplication[key] !== undefined),
    present: installedKeys.filter((key) => installed[key] !== undefined),
    absent: installedKeys.filter((key) => installed[key] === undefined),
  };
  await installed.dispose?.();

  const profile = parseDeploymentProfile({
    schemaVersion: 1,
    profileId: "parity-packaged",
    projectId: "parity-packaged-project",
    localPeer: "parity-peer",
    persistentPoint: "pp-parity",
    repository: distRoot,
    transport: { namespace: "parity", databasePath: join(tmp, "transport.sqlite") },
    databases: {
      orchestration: join(tmp, "p-orchestration.sqlite"),
      ordarium: join(tmp, "p-ordarium.sqlite"),
      coordination: join(tmp, "p-coordination.sqlite"),
      transportCursors: join(tmp, "p-cursors.sqlite"),
      attentionMarks: join(tmp, "p-attention.sqlite"),
    },
    directory: [{ peerId: "parity-peer", competenceTags: ["parity"] }],
    projectDirectory: [
      {
        projectId: "parity-packaged-project",
        displayName: "the parity project",
        aliases: ["parity"],
        peerId: "parity-peer",
        competenceTags: ["parity"],
      },
    ],
    reasoning: {},
    attention: { policyId: "parity-attention", cooldownMs: 0, activation: "none" },
  });
  const deployment = launchDeployment(profile);
  const packagedInstalled = deployment.installed as AnyRecord;
  const packagedApplication = packagedInstalled.application as AnyRecord;
  const packagedKeys = Object.keys(packagedInstalled).sort();
  const packaged: ParityInstallation = {
    installedCapabilityKeys: packagedKeys,
    applicationSurfaceKeys: Object.keys(packagedApplication).sort(),
    dshTools: toolEntries(defineApplicationTools(packagedApplication)),
    applicationFacesPresent: Object.keys(packagedApplication).filter((key) => packagedApplication[key] !== undefined),
  };
  await deployment.close();

  return { packagedInstallation: packaged, minimalInstallation: minimal };
}

export interface ParityBaselineFile {
  readonly note: string;
  readonly capture: { readonly packagedInstallation: ParityInstallation; readonly minimalInstallation: ParityInstallation };
}

export interface ParityDifference {
  readonly where: string;
  readonly detail: string;
}

/** Compare a live capture against the recorded baseline: every key and every action set. */
export function compareParity(baseline: ParityCapture, live: ParityCapture): readonly ParityDifference[] {
  const differences: ParityDifference[] = [];
  const compareList = (where: string, expected: readonly string[], actual: readonly string[]): void => {
    const missing = expected.filter((entry) => !actual.includes(entry));
    if (missing.length > 0) differences.push({ where, detail: `missing: ${missing.join(", ")}` });
  };
  const compareInstallation = (label: string, expected: ParityInstallation, actual: ParityInstallation): void => {
    compareList(`${label}.installedCapabilityKeys`, expected.installedCapabilityKeys, actual.installedCapabilityKeys);
    compareList(`${label}.applicationSurfaceKeys`, expected.applicationSurfaceKeys, actual.applicationSurfaceKeys);
    compareList(`${label}.applicationFacesPresent`, expected.applicationFacesPresent, actual.applicationFacesPresent);
    compareList(
      `${label}.dshTools`,
      expected.dshTools.map((tool) => tool.name),
      actual.dshTools.map((tool) => tool.name),
    );
    for (const tool of expected.dshTools) {
      const found = actual.dshTools.find((candidate) => candidate.name === tool.name);
      if (found === undefined) continue;
      if (found.mode !== tool.mode) differences.push({ where: `${label}.${tool.name}.mode`, detail: `${tool.mode} → ${found.mode}` });
      compareList(`${label}.${tool.name}.actions`, tool.actions, found.actions);
    }
  };
  compareInstallation("packagedInstallation", baseline.packagedInstallation, live.packagedInstallation);
  compareInstallation("minimalInstallation", baseline.minimalInstallation, live.minimalInstallation);
  return differences;
}
