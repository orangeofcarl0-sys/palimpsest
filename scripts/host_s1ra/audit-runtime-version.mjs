import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const nl = String.fromCharCode(10);
const REPO = "F:/Codex_Work_Space/Palimpsest/palimpsest-sr1";

/** Read a package manifest's name and version without following a junction twice. */
function manifest(path) {
  try {
    const j = JSON.parse(readFileSync(path, "utf8"));
    return { name: j.name, version: j.version, dependencies: j.dependencies ?? null };
  } catch {
    return null;
  }
}

const PACKAGE = "@deepseek-ai/dsh-win32-process";
const REQUIRED = "0.2.1-rc.2";

/**
 * EVERY CANDIDATE FOUND BY A READ-ONLY SEARCH.
 *
 * A directory named `0.2.1-rc.2` is NOT evidence of a qualified artifact, so each candidate is identified by its
 * own manifest and its own bytes, and the search is reported with the roots it covered.
 */
const candidates = [
    "F:/Codex_Work_Space/Palimpsest/.runtimes/dsh-020-win32/pkg/package.json",
    "F:/Codex_Work_Space/DSH plugin/dsh-meld/node_modules/@deepseek-ai/dsh-win32-process/package.json",
    "C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-win32-process/package.json",
  ]
  .filter((p) => existsSync(p))
  .map((p) => {
    const m = manifest(p);
    return {
      path: p,
      name: m?.name ?? null,
      version: m?.version ?? null,
      isRequiredVersion: m?.version === REQUIRED,
      dependencies: m?.dependencies ?? null,
      sha256OfManifest: createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16),
    };
  });

/** The contract's own pins, read from the source of truth rather than from a report. */
const labelSource = readFileSync(join(REPO, "host/deployment/runtime/win32_label.js"), "utf8");
const qualifiedVersion = /qualifiedVersion:\s*'([^']+)'/u.exec(labelSource)?.[1] ?? null;
const previouslyQualified = /previouslyQualifiedVersion:\s*'([^']+)'/u.exec(labelSource)?.[1] ?? null;
const ffiQualified = /FFI_RUNTIME_QUALIFIED = '([^']+)'/u.exec(labelSource)?.[1] ?? null;

/** How the drift is enforced, quoted from the runner rather than paraphrased. */
const runnerSource = readFileSync(join(REPO, "host/dsh/lib/runner.js"), "utf8");
const refusalLine = runnerSource.split(nl).find((l) => l.includes("kernel-drift")) ?? null;

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RA_E2_RUNTIME_ADJUDICATION",
  stage: "Palimpsest Host-S1RA-E2",
  measuredAt: new Date().toISOString(),
  contract: {
    package: PACKAGE,
    qualifiedVersion,
    previouslyQualifiedVersion: previouslyQualified,
    ffi: { package: "koffi", qualifiedVersion: ffiQualified },
    source: "host/deployment/runtime/win32_label.js",
  },
  installed: {
    /**
     * THE INSTALLED VERSION IS THE ONE THE JUNCTION RESOLVES TO, identified by its own path rather than by
     * "the first candidate that is not the required version" — which picked the unrelated 0.2.0-rc.2 artifact.
     */
    resolved: candidates.find((c) => c.path.startsWith("C:/Users/66494/AppData/Roaming/npm/"))?.version ?? null,
    path: "C:/Users/66494/.dsh/profiles/node_modules/@deepseek-ai/dsh-win32-process (junction into the npm global tree)",
    note: "the junction path is the configured one; the version is read from the manifest it resolves to",
  },
  search: {
    rootsCovered: [
      "F:/Codex_Work_Space/Palimpsest/.runtimes",
      "F:/Codex_Work_Space/DSH plugin/dsh-meld/node_modules",
      "C:/Users/66494/AppData/Roaming/npm/node_modules",
      "C:/Users/66494/AppData/Local/npm-cache/_cacache",
      "C:/Users/66494/AppData/Local/pnpm/store/v11",
    ],
    candidates,
    requiredVersionFound: candidates.some((c) => c.isRequiredVersion),
    note:
      "a directory NAMED 0.2.1-rc.2 was never accepted as evidence; only a package manifest reporting that version would have counted, and none does",
  },
  enforcement: {
    /** Quoted from the shipped source, so the report cannot overstate or soften what happens. */
    refusalSourceLine: refusalLine,
    refusalIsUnconditional: refusalLine !== null && refusalLine.includes("refuse('kernel-drift'"),
    condition: "kernel.contract?.drifted === true",
    overrideAvailable: false,
    consequence: "every worker exits nonzero at pre-create, before an Agent exists",
  },
  verdicts: {
    safeReplayAvailable: false,
    reason:
      "no artifact at the qualified version exists on this machine, and the drift check has no supported override",
    isolatedReplayAttempted: false,
    isolatedReplayJustification:
      "§7 requires §6 to establish a safe and verifiable route first; it did not, so no Live Gate was invoked against an unqualified runtime",
  },
  forbiddenAlternatives: [
    { action: "raise qualifiedVersion to 0.2.1-rc.3", why: "asserts a qualification nobody performed" },
    { action: "disable the drift check", why: "removes the protection it exists to provide" },
    { action: "downgrade the global runtime", why: "changes the user's installation" },
    { action: "modify ~/.dsh or D:\\dsh", why: "out of scope and would alter the real installation" },
    { action: "substitute 0.2.0-rc.2 or 0.2.1-alpha.2", why: "neither is the pinned version; a name match is not a qualification" },
  ],
};

process.stdout.write(JSON.stringify(report, null, 2) + nl);
