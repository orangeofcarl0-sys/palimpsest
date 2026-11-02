/**
 * PC1 S09 — the product CLI commands.
 *
 * These are the ordinary-user entry points: init, continue, doctor, review, recover, outcomes.
 * They compose the same owners as the model tools; the review decisions and the local intent
 * admission are explicit operator actions, not model output.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";

import { installProduct, type InstalledProduct } from "./product.js";
import { runDoctor } from "./runtime/doctor.js";
import type { OperatorAuthorityPort } from "./project_review/index.js";
import type { ProjectIntentAdmissionPort } from "./project_intent/index.js";
import { makeDomainOutcomeService } from "./domain_outcome/index.js";

export interface ProductProfile {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly repository: string;
  readonly stateDir: string;
  readonly toolProfile: "normal" | "expert";
  /** The local operator identity for review decisions and the local intent admission. */
  readonly operatorId?: string | undefined;
  /** The purpose this local operator is allowed to decide; recorded, not a free-floating grant. */
  readonly operatorPurpose?: string | undefined;
}

type Options = Map<string, string>;

function option(options: Options, name: string): string | undefined {
  return options.get(`--${name}`);
}

function requiredOption(options: Options, name: string): string {
  const value = option(options, name);
  if (value === undefined || value === "") throw new Error(`--${name} is required`);
  return value;
}

function profilePath(options: Options): string {
  return resolve(option(options, "profile-file") ?? join(process.cwd(), ".palimpsest", "state", "product-profile.json"));
}

export function readProductProfile(path: string): ProductProfile {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as ProductProfile;
  if (parsed.schemaVersion !== 1 || parsed.projectId === "" || parsed.repository === "" || parsed.stateDir === "") {
    throw new Error(`profile ${path} is not a PC1 product profile`);
  }
  return parsed;
}

function writeProfile(path: string, profile: ProductProfile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(profile, null, 2)}\n`);
}

function localAuthority(operatorId: string | undefined): OperatorAuthorityPort | undefined {
  if (operatorId === undefined || operatorId === "") return undefined;
  return {
    policyRef: { policyId: "pc1-local-operator", version: "1" },
    authorize(actor) {
      return actor === operatorId
        ? { authorized: true, role: "operator" }
        : { authorized: false, role: "unknown", reason: `the configured local operator is ${operatorId}` };
    },
  };
}

function localIntentAdmission(profile: ProductProfile): ProjectIntentAdmissionPort | undefined {
  if (profile.operatorId === undefined || profile.operatorPurpose === undefined) return undefined;
  const policyRef = { policyId: "pc1-local-intent-admission", version: "1" };
  return {
    policyRef,
    async decide(input) {
      const provenanceDigest = createHash("sha256")
        .update(`${profile.operatorId}\u0000${profile.operatorPurpose}\u0000${input.proposal.digest}\u0000${input.currentness.status}`)
        .digest("hex");
      return {
        decision: "ADMIT",
        proposalDigest: input.proposal.digest,
        policyRef,
        provenanceDigest,
        detail: `local operator ${profile.operatorId} admitted the exact proposal digest for purpose: ${profile.operatorPurpose}`,
      };
    },
  };
}

function openProduct(profile: ProductProfile): InstalledProduct {
  return installProduct({ tools: { register: () => () => undefined } } as never, {
    projectId: profile.projectId,
    repository: profile.repository,
    stateDir: profile.stateDir,
    toolProfile: profile.toolProfile,
    standard: {
      statement: "the declared artifacts exist and the write scope is respected",
      clauses: [{ kind: "scope_respected" }],
      derivedFrom: ["PC1 default product standard"],
      confirmed: true,
      notes: ["A project may replace this with a stricter confirmed standard."],
    },
    operatorAuthority: localAuthority(profile.operatorId),
    ...(localIntentAdmission(profile) === undefined ? {} : { projectIntentAdmission: localIntentAdmission(profile) }),
  });
}

function repoHead(repository: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
}

function tasksFromOption(value: string | undefined, goal: string): Array<Record<string, unknown>> {
  if (value === undefined) {
    return [{ task_id: "task-1", objective: goal, depends_on: [], write_paths: [], required_artifacts: [] }];
  }
  const parsed: unknown = JSON.parse(readFileSync(resolve(value), "utf8"));
  if (!Array.isArray(parsed)) throw new Error("--tasks must point to a JSON array");
  return parsed as Array<Record<string, unknown>>;
}

export async function runProductCommand(command: string, options: Options, positional: readonly string[]): Promise<boolean> {
  if (!["init", "continue", "doctor", "review", "recover", "outcomes", "context-capsule"].includes(command)) return false;

  if (command === "doctor") {
    const report = runDoctor({
      repository: option(options, "repo") ?? process.cwd(),
      ...(option(options, "state") === undefined ? {} : { stateDir: option(options, "state") }),
      ...(option(options, "tool-profile") === undefined ? {} : { toolProfile: option(options, "tool-profile") }),
      spendAuthorizationRef: option(options, "spend-authorization") ?? null,
      ...(option(options, "provider-config") === undefined ? {} : { providerConfigPath: option(options, "provider-config") }),
      ...(option(options, "credential") === undefined ? {} : { credentialPath: option(options, "credential") }),
    });
    console.log(JSON.stringify(report, null, 2));
    return true;
  }

  if (command === "init") {
    const repository = resolve(requiredOption(options, "repo"));
    const projectId = requiredOption(options, "project");
    const stateDir = resolve(option(options, "state") ?? join(repository, ".palimpsest", "state"));
    const toolProfile = option(options, "tool-profile") === "expert" ? "expert" : "normal";
    const operatorId = option(options, "operator");
    const operatorPurpose = option(options, "operator-purpose");
    const profileFile = profilePath(options);
    mkdirSync(stateDir, { recursive: true });
    const profile: ProductProfile = {
      schemaVersion: 1,
      projectId,
      repository,
      stateDir,
      toolProfile,
      ...(operatorId === undefined ? {} : { operatorId }),
      ...(operatorPurpose === undefined ? {} : { operatorPurpose }),
    };
    writeProfile(profileFile, profile);
    const installed = openProduct(profile);
    try {
      const hasProject = (() => {
        try {
          installed.controller.work.project();
          return true;
        } catch {
          return false;
        }
      })();
      const goal = option(options, "goal");
      if (goal !== undefined && !hasProject) {
        installed.controller.start({
          projectId,
          goal,
          headCommit: repoHead(repository),
          tasks: tasksFromOption(option(options, "tasks"), goal) as never,
        });
      }
      const summary = await installed.application.projectWorkspace!.summary();
      console.log(JSON.stringify({ state: "INITIALIZED", profileFile, summary }, null, 2));
    } finally {
      await installed.dispose();
    }
    return true;
  }

  const profile = readProductProfile(profilePath(options));

  if (command === "continue" || command === "context-capsule") {
    const installed = openProduct(profile);
    try {
      const workspace = installed.application.projectWorkspace!;
      if (command === "context-capsule") {
        const maxBytes = option(options, "max-bytes");
        console.log(JSON.stringify(await workspace.contextCapsule(maxBytes === undefined ? {} : { maxBytes: Number(maxBytes) }), null, 2));
      } else {
        console.log(JSON.stringify({ summary: await workspace.summary(), next: await installed.application.projectWorkspace!.openLoops() }, null, 2));
      }
    } finally {
      await installed.dispose();
    }
    return true;
  }

  if (command === "review") {
    const [, subcommand, proposalId] = positional;
    const installed = openProduct(profile);
    try {
      if (subcommand === undefined) throw new Error("usage: palimpsest review <list|adopt|preview|approve|reject|request-changes|apply|verify-source|propose-plan> …");
      if (subcommand === "list") {
        // R5: list also performs the verified, idempotent adoption of structured Journal proposals,
        // so a model-originated proposal appears in the normal Operator Review experience.
        console.log(JSON.stringify(await installed.review.listAll(), null, 2));
        return true;
      }
      if (subcommand === "adopt") {
        console.log(JSON.stringify(await installed.review.adoptJournalProposal(proposalId ?? ""), null, 2));
        return true;
      }
      if (subcommand === "preview") {
        console.log(JSON.stringify(installed.review.preview(proposalId ?? ""), null, 2));
        return true;
      }
      if (subcommand === "propose-plan") {
        const file = requiredOption(options, "file");
        const body = JSON.parse(readFileSync(resolve(file), "utf8")) as {
          purpose: string; proposedAction: string; sources?: string[]; writePaths?: string[]; effects?: string[]; risk?: string; expectedArtifact?: string; reason: string; tasks: unknown[];
        };
        const proposal = installed.review.proposePlan({
          proposedBy: option(options, "actor") ?? "operator:cli",
          purpose: body.purpose,
          proposedAction: body.proposedAction,
          sources: body.sources ?? [],
          scope: { writePaths: body.writePaths ?? [], effects: body.effects ?? ["projectir_revision"] },
          ...(body.risk === undefined ? {} : { risk: body.risk }),
          ...(body.expectedArtifact === undefined ? {} : { expectedArtifact: body.expectedArtifact }),
          payload: { tasks: body.tasks as never, reason: body.reason },
        });
        console.log(JSON.stringify(proposal, null, 2));
        return true;
      }
      if (subcommand === "approve" || subcommand === "reject" || subcommand === "request-changes") {
        const actor = requiredOption(options, "actor");
        const decision = subcommand === "approve" ? "APPROVE" : subcommand === "reject" ? "REJECT" : "REQUEST_CHANGES";
        const preview = installed.review.decide(proposalId ?? "", { decision, actor, ...(option(options, "note") === undefined ? {} : { note: option(options, "note") }) });
        console.log(JSON.stringify(preview, null, 2));
        return true;
      }
      if (subcommand === "apply") {
        const actor = requiredOption(options, "actor");
        const outcome = await installed.review.apply(proposalId ?? "", { actor });
        console.log(JSON.stringify(outcome, null, 2));
        return true;
      }
      if (subcommand === "verify-source") {
        const resultCommit = requiredOption(options, "commit");
        console.log(JSON.stringify(installed.review.verifySourceIntake(proposalId ?? "", { resultCommit }), null, 2));
        return true;
      }
      throw new Error(`unknown review subcommand "${subcommand}"`);
    } finally {
      await installed.dispose();
    }
  }

  if (command === "recover") {
    const installed = openProduct(profile);
    try {
      const report = await installed.controller.promotions.reconcileAll();
      const head = await installed.controller.reconcileProjectHead();
      console.log(JSON.stringify({ report, head }, null, 2));
      process.exitCode = report.blocked.length === 0 ? 0 : 1;
    } finally {
      await installed.dispose();
    }
    return true;
  }

  if (command === "outcomes") {
    const [, subcommand] = positional;
    const installed = openProduct(profile);
    try {
      const service = makeDomainOutcomeService({
        workspace: {
          journal: (projectId?: string) => installed.application.projectWorkspace!.journal(projectId),
          recordJournalEntry: (input) => installed.application.projectWorkspace!.recordJournalEntry(input),
        },
        repository: profile.repository,
      });
      if (subcommand === "contracts") {
        console.log(JSON.stringify(service.contracts(), null, 2));
        return true;
      }
      if (subcommand === "project") {
        console.log(JSON.stringify(await service.project(), null, 2));
        return true;
      }
      if (subcommand === "evaluate") {
        const taskId = requiredOption(options, "task");
        const contractId = requiredOption(options, "contract");
        const artifact = option(options, "artifact");
        const params = option(options, "params");
        console.log(JSON.stringify(await service.evaluate({
          taskId,
          contractId,
          ...(artifact === undefined ? {} : { artifactPath: artifact }),
          ...(params === undefined ? {} : { parameters: JSON.parse(params) as Record<string, unknown> }),
        }), null, 2));
        return true;
      }
      throw new Error("usage: palimpsest outcomes <contracts|project|evaluate> …");
    } finally {
      await installed.dispose();
    }
  }

  return false;
}
