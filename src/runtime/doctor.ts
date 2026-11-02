/**
 * PC1 S07 — the doctor.
 *
 * It reports what this installation ACTUALLY has, from the installed runtime and the filesystem. It
 * never prints a credential, never calls the network, and never turns "not checked" into "available".
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

export const DOCTOR_STATUSES = ["PASS", "WARN", "FAIL", "UNKNOWN", "BLOCKED"] as const;
export type DoctorStatus = (typeof DOCTOR_STATUSES)[number];

export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorStatus;
  readonly detail: string;
  readonly remedy: string;
}

export interface DoctorReport {
  readonly schema: "pc1-doctor/v1";
  readonly at: string;
  readonly platform: string;
  readonly checks: readonly DoctorCheck[];
  readonly supportedStack: string;
  readonly limitations: readonly string[];
  readonly liveModel: "READY" | "BLOCKED";
  readonly liveModelDetail: string;
}

export interface DoctorInput {
  readonly repository: string;
  readonly stateDir?: string | undefined;
  readonly toolProfile?: string | undefined;
  readonly spendAuthorizationRef?: string | null | undefined;
  readonly providerConfigPath?: string | undefined;
  readonly credentialPath?: string | undefined;
  readonly dshHome?: string | undefined;
  readonly now?: (() => string) | undefined;
}

function commandVersion(command: string, args: readonly string[]): string | null {
  try {
    return execFileSync(command, [...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function check(id: string, status: DoctorStatus, detail: string, remedy: string): DoctorCheck {
  return Object.freeze({ id, status, detail, remedy });
}

export function runDoctor(input: DoctorInput): DoctorReport {
  const checks: DoctorCheck[] = [];
  const limitations: string[] = [];
  const node = process.versions.node;
  const required = (() => {
    try {
      const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { engines?: { node?: string } };
      return pkg.engines?.node ?? ">=24.15.0";
    } catch {
      return ">=24.15.0";
    }
  })();
  const want = required.replace(/^[^0-9]*/u, "");
  const majorMinor = (value: string): [number, number] => {
    const [major = 0, minor = 0] = value.split(".").map((part) => Number(part));
    return [major, minor];
  };
  const [nodeMajor, nodeMinor] = majorMinor(node);
  const [wantMajor, wantMinor] = majorMinor(want);
  checks.push(
    nodeMajor > wantMajor || (nodeMajor === wantMajor && nodeMinor >= wantMinor)
      ? check("node", "PASS", `Node ${node} satisfies ${required}`, "none")
      : check("node", "WARN", `Node ${node} is below the declared engine ${required}; the build can still pass, but this is not the supported runtime`, `install Node ${want} or newer`),
  );

  const git = commandVersion("git", ["--version"]);
  checks.push(git === null ? check("git", "FAIL", "git is not on PATH", "install Git and ensure it is on PATH") : check("git", "PASS", git, "none"));
  if (git !== null) {
    try {
      const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: resolve(input.repository), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      checks.push(check("repository", "PASS", `canonical repository: ${top}`, "none"));
    } catch (error) {
      checks.push(check("repository", "FAIL", `not a readable Git work tree: ${error instanceof Error ? error.message : String(error)}`, "point the profile at a real repository"));
    }
  }

  const dsh = commandVersion("dsh", ["--version"]);
  checks.push(dsh === null ? check("dsh", "UNKNOWN", "the dsh executable is not on PATH", "install the DSH runtime or set the host profile to its absolute path") : check("dsh", "PASS", `DSH ${dsh}`, "none"));
  const ordarium = (() => {
    try {
      const pkg = JSON.parse(readFileSync(resolve("node_modules/@ordarium/core/package.json"), "utf8")) as { version?: string };
      return pkg.version ?? null;
    } catch {
      return null;
    }
  })();
  checks.push(ordarium === null ? check("ordarium", "UNKNOWN", "the @ordarium/core version could not be read from node_modules", "run the locked install") : check("ordarium", "PASS", `@ordarium/core ${ordarium}`, "none"));

  if (input.stateDir !== undefined) {
    try {
      mkdirSync(input.stateDir, { recursive: true });
      const probe = join(input.stateDir, `.doctor-${process.pid}`);
      writeFileSync(probe, "ok");
      unlinkSync(probe);
      checks.push(check("state", "PASS", `state directory is writable: ${input.stateDir}`, "none"));
    } catch (error) {
      checks.push(check("state", "FAIL", `state directory is not writable: ${error instanceof Error ? error.message : String(error)}`, "choose a writable directory and re-run the profile"));
    }
  }

  const linux = process.platform === "linux";
  const bwrap = linux ? commandVersion("bwrap", ["--version"]) : null;
  if (linux) {
    checks.push(bwrap === null ? check("sandbox", "WARN", "bubblewrap is not on PATH; only a filesystem-level confinement would be available", "install bubblewrap for the qualified Linux/WSL2 runtime") : check("sandbox", "PASS", `bubblewrap ${bwrap}`, "none"));
  } else if (process.platform === "win32") {
    checks.push(check("sandbox", "WARN", "Windows ACL sandbox confines writes only; it is not a general isolation boundary", "use the Linux/WSL2 runtime for scored or untrusted execution"));
    limitations.push("Windows: write-confinement only; no qualified read/child-process isolation.");
  } else {
    checks.push(check("sandbox", "UNKNOWN", `no qualified sandbox adapter for ${process.platform}`, "use Linux/WSL2"));
  }

  const providerConfig = input.providerConfigPath;
  checks.push(
    providerConfig === undefined
      ? check("provider", "UNKNOWN", "no provider configuration path was supplied", "configure the host provider store")
      : existsSync(providerConfig)
        ? check("provider", "PASS", `provider configuration is present at ${providerConfig} (contents not read)`, "none")
        : check("provider", "WARN", `provider configuration not found at ${providerConfig}`, "configure the host provider store"),
  );
  checks.push(
    input.credentialPath === undefined
      ? check("credential", "UNKNOWN", "no credential store path was supplied", "configure the host credential store")
      : existsSync(input.credentialPath)
        ? check("credential", "PASS", "the credential store file exists (contents not read)", "none")
        : check("credential", "WARN", "the credential store file does not exist", "configure the host credential store"),
  );

  const liveModel = input.spendAuthorizationRef === null || input.spendAuthorizationRef === undefined ? "BLOCKED" : "READY";
  checks.push(
    liveModel === "BLOCKED"
      ? check("live-model", "BLOCKED", "no spend authorization is configured; live model trials must not start", "the owner must provide an explicit spend authorization and budget window")
      : check("live-model", "PASS", `spend authorization: ${input.spendAuthorizationRef}`, "none"),
  );

  checks.push(check("tool-profile", "PASS", `advertised tool profile: ${input.toolProfile ?? "expert"}`, "use `normal` for the ordinary product path"));
  checks.push(check("doctor-credentials", "PASS", "this report never reads or prints a credential value", "none"));

  const supported = process.platform === "linux"
    ? "Linux/WSL2 + bubblewrap (qualified by the C6-R runtime evidence)"
    : "Windows is an engineering/verification host; scored untrusted execution is not supported";
  return Object.freeze({
    schema: "pc1-doctor/v1",
    at: (input.now ?? (() => new Date().toISOString()))(),
    platform: process.platform,
    checks: Object.freeze(checks),
    supportedStack: supported,
    limitations: Object.freeze(limitations),
    liveModel,
    liveModelDetail: liveModel === "BLOCKED" ? "no spend authorization: live trials are BLOCKED, not failed" : "an explicit authorization was supplied",
  });
}
