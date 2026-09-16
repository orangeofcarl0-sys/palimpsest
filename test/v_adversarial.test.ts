/**
 * G10-V adversarial + source firewall.
 *
 *   ProjectWorkspace ≠ CanonicalStore     ProjectAssetAssociation ≠ AssetContent
 *   OpenLoop ≠ WorkTask                   Candidate ≠ Command
 *   Mode ≠ Authority                      No ManagerAgent     No autonomy scalar
 *   The external personal-asset boundary is described, not implemented
 *
 * Mechanically checkable V-N01…V-N30 / PW-A01…A36 invariants: the workspace and
 * management layers own no sibling store, reach no effect authority, expose no
 * escalation path, invent no autonomy score, and pull in no Proof federation.
 */

import { readFileSync, readdirSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { makePalimpsestApplicationSurface } from "../src/application/surface.js";
import { defineApplicationTools } from "../src/tools/application_tools.js";

import {
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
  makeProjectWorkspaceService,
  type ProjectWorkspaceView,
} from "../src/project_workspace/index.js";
import {
  AUTHORITY_REQUIRED_ACTIONS,
  CAPABILITY_EXTERNAL,
  MANAGEMENT_ACTION_CLASSES,
  MANAGEMENT_INVOLVEMENTS,
  SqliteManagementPreferenceStore,
  defaultAllowedActionClasses,
  defaultConfirmationBoundaries,
  deriveManagementActionCandidates,
  evaluateManagementAction,
  makeProjectManagementService,
  materializeManagementProfile,
} from "../src/project_management/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const WORKSPACE_DIR = fileURLToPath(new URL("../src/project_workspace", import.meta.url));
const MANAGEMENT_DIR = fileURLToPath(new URL("../src/project_management", import.meta.url));
const PROJECT = "adversarial-project";
const HEAD = "c".repeat(40);
const CLOCK = "2026-08-13T00:00:00Z";

/* ------------------------------------------------------------------ *
 * Source reading helpers
 * ------------------------------------------------------------------ */

interface SourceFile {
  readonly name: string;
  readonly path: string;
  readonly code: string;
}

const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function sourceFiles(dir: string): readonly SourceFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, path: join(dir, name), code: readFileSync(join(dir, name), "utf-8") }));
}

/** Every .ts file under src/, recursively. */
function allSrcFiles(): readonly SourceFile[] {
  const found: SourceFile[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, name);
      else if (entry.name.endsWith(".ts")) found.push({ name, path: full, code: readFileSync(full, "utf-8") });
    }
  };
  walk(SRC, "");
  return found;
}

function importSpecifiers(code: string): readonly string[] {
  const specifiers: string[] = [];
  for (const match of code.matchAll(/\bfrom\s+["']([^"']+)["']/gu)) specifiers.push(match[1]!);
  for (const match of code.matchAll(/\bimport\s+["']([^"']+)["']/gu)) specifiers.push(match[1]!);
  return specifiers;
}

const VERTICAL_FILES: readonly SourceFile[] = [
  ...sourceFiles(WORKSPACE_DIR).map((file) => ({ ...file, name: `project_workspace/${file.name}` })),
  ...sourceFiles(MANAGEMENT_DIR).map((file) => ({ ...file, name: `project_management/${file.name}` })),
];

/* ------------------------------------------------------------------ *
 * Firewall vocabulary
 * ------------------------------------------------------------------ */

/** Sibling store / effect-authority modules are never importable from the vertical. */
const FORBIDDEN_MODULES: readonly RegExp[] = [
  /(^|\/)organization\/store\.js$/u,
  /(^|\/)organization_evolution\/store\.js$/u,
  /(^|\/)runtime_evolution\/store\.js$/u,
  /(^|\/)runtime_scope\/store\.js$/u,
  /(^|\/)boundary_memory\/store\.js$/u,
  /(^|\/)coordination\//u,
  /(^|\/)reasoning_cell\/store\.js$/u,
  /(^|\/)proof_asset\//u,
  /(^|\/)organization_memory\//u,
  /(^|\/)federation\//u,
  /(^|\/)effects(\/|$)/u,
  /(^|\/)organization\//u,
  /(^|\/)institution\//u,
  /(^|\/)campaign\//u,
];

/** Only the canonical schema, the controller/graph, read-only recipe/reasoning ports,
 * the vertical itself and Node builtins may be imported. */
const ALLOWED_MODULES: readonly RegExp[] = [
  /^node:/u,
  /^\.\//u,
  /^\.\.\/schema\//u,
  /^\.\.\/tools\//u,
  /^\.\.\/recipes\//u,
  /^\.\.\/reasoning_cell\/service\.js$/u,
  /^\.\.\/project_workspace\//u,
  // G10-AB: the operating-posture plane. It owns NO authority: no effects, no
  // federation, no promotion, no sibling store - only the operator's Work Mode
  // preference and an append-only, non-authoritative activity log. The AB suite
  // asserts that authority freedom directly.
  /^\.\.\/project_operating\//u,
  // G10-AD §21 JUSTIFICATION: `project_management/service.ts` now imports
  // `../project_verification/index.js`. This is the SAME class of module the G10-AB
  // entry above admits: a narrowly-owned product plane with its OWN append-only,
  // non-authoritative store, which can emit NO Work Evidence, NO Proof publication,
  // NO Reasoning admission, NO task state, NO promotion eligibility and NO effect
  // authority (its own suite proves that statically AND behaviourally).
  //
  // The firewall's real invariant - "the vertical never imports a SIBLING CANONICAL
  // store or an effect-authority module" - is UNCHANGED: none of the FORBIDDEN
  // patterns above matches it, and the vertical uses ONLY the typed verification
  // seam (`status`/`history`/`verifyCurrentHead`), the pure `verificationIsDue`
  // derivation and the canonical run-ref builder. Spec §21 requires the bounded
  // management layer to return the durable `project_verification:<runId>` reference,
  // so the seam is a product requirement, not an escape hatch.
  /^\.\.\/project_verification\//u,
];

/** Identifiers that would signal mutating a sibling store or taking effect authority. */
const FORBIDDEN_TOKENS: readonly string[] = [
  "OrganizationStore",
  "RuntimeScopeStore",
  "RuntimeEvolutionStore",
  "OrganizationEvolutionStore",
  "BoundaryMemoryStore",
  "CoordinationStore",
  "ReasoningCellStore",
  "ProofEvidenceStore",
  "CommitmentService",
  "EventStore",
  "EffectAuthority",
  "PalimpsestEffectsRuntime",
  "grantAuthority",
  "appendEvent",
  "PersistentPoint",
];

const FORBIDDEN_AGENTS = /ManagerAgent|ProjectManagerAgent|SupervisorAgent|GlobalProjectManager/u;
const FORBIDDEN_SCORE = /autonomy\s*=|autonomyScore|managementScore/u;
const FORBIDDEN_ESCALATION = /set_mode_upward|setModeUpward|grant_authority|grantAuthority|approve_disclosure|approveDisclosure|force_commitment|forceCommitment/u;
const PERSONAL_ASSET = /PersonalAsset|PersonalKnowledge|ExternalAssetLibrary/u;

/* ------------------------------------------------------------------ *
 * Rig for behaviour checks
 * ------------------------------------------------------------------ */

interface Rig {
  readonly root: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly associations: SqliteProjectAssetAssociationStore;
  readonly journal: SqliteProjectJournalStore;
  readonly workspace: ReturnType<typeof makeProjectWorkspaceService>;
  readonly managementPath: string;
  cleanup(): Promise<void>;
}

function makeRig(): Rig {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-v-adv-"));
  const store = new EventStore(join(root, "palimpsest.sqlite"), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({ databasePath: join(root, "ops.sqlite"), git: new FakeGitPort(HEAD) });
  const controller = new ProjectController({
    store,
    effects,
    projectId: PROJECT,
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
  const associations = new SqliteProjectAssetAssociationStore(join(root, "project-workspace.sqlite"));
  const journal = new SqliteProjectJournalStore(join(root, "project-journal.sqlite"));
  controller.start({ projectId: PROJECT, goal: "g", requirements: [], decisions: [], tasks: [taskSpec("task-1")], committedAt: CLOCK });
  const workspace = makeProjectWorkspaceService({ controller, associations, journal, clock: () => CLOCK });
  return {
    root,
    store,
    controller,
    associations,
    journal,
    workspace,
    managementPath: join(root, "management.sqlite"),
    async cleanup() {
      for (const store0 of [associations, journal]) {
        try {
          store0.close();
        } catch {
          /* already closed */
        }
      }
      await controller.close();
      store.close();
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* windows handle lag */
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * V-N01…: source firewall
 * ------------------------------------------------------------------ */

describe("G10-V source firewall (V-N01…V-N06)", () => {
  it("V-N01: imports no sibling store, federation, or effect-authority module", () => {
    for (const file of VERTICAL_FILES) {
      for (const specifier of importSpecifiers(file.code)) {
        for (const forbidden of FORBIDDEN_MODULES) {
          expect(forbidden.test(specifier), `${file.name} imports forbidden module "${specifier}"`).toBe(false);
        }
        expect(ALLOWED_MODULES.some((allowed) => allowed.test(specifier)), `${file.name} imports non-allow-listed module "${specifier}"`).toBe(true);
      }
    }
  });

  it("V-N02: references no sibling store mutator or effect authority (ProjectController and own stores allowed)", () => {
    for (const file of VERTICAL_FILES) {
      const code = strip(file.code);
      for (const token of FORBIDDEN_TOKENS) {
        expect(code.includes(token), `${file.name} references "${token}"`).toBe(false);
      }
      // The allowed mutation surface is explicit: ProjectController and the two owned stores.
      if (file.name === "project_workspace/service.ts") {
        expect(code).toContain("ProjectController");
        expect(code).toContain(".appendAtomic(");
        expect(code).toContain("controller.plan(");
      }
    }
  });

  it("V-N03: names no ManagerAgent/supervisor/global manager anywhere in src", () => {
    for (const file of allSrcFiles()) {
      expect(FORBIDDEN_AGENTS.test(strip(file.code)), `src/${file.name} introduces an agent role`).toBe(false);
    }
  });

  it("V-N04: invents no autonomy scalar anywhere in src", () => {
    for (const file of allSrcFiles()) {
      expect(FORBIDDEN_SCORE.test(strip(file.code)), `src/${file.name} introduces an autonomy scalar`).toBe(false);
    }
  });

  it("V-N05: has no Personal Asset DB (only documentation/seam strings, never an implemented store)", () => {
    let codeHits = 0;
    for (const file of allSrcFiles()) {
      const lines = file.code.split(/\r?\n/u);
      for (const line of lines) {
        if (!PERSONAL_ASSET.test(line)) continue;
        // A hit is tolerated only inside a comment; any code-level occurrence fails.
        const withoutComment = strip(line);
        if (PERSONAL_ASSET.test(withoutComment)) codeHits += 1;
      }
    }
    expect(codeHits, "an external personal-asset store/type is implemented").toBe(0);
    // No class/interface/const declaration of that name exists anywhere in src.
    for (const file of allSrcFiles()) {
      expect(strip(file.code)).not.toMatch(/(class|interface|const|function)\s+[A-Za-z]*PersonalAsset/u);
      expect(strip(file.code)).not.toMatch(/(class|interface|const|function)\s+ExternalAssetLibrary/u);
    }
  });

  it("V-N06: the escalation verbs exist nowhere as code in src", () => {
    for (const file of allSrcFiles()) {
      expect(FORBIDDEN_ESCALATION.test(strip(file.code)), `src/${file.name} mentions an escalation verb in code`).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * V-N07…: management action surface
 * ------------------------------------------------------------------ */

describe("G10-V management surface (V-N07…V-N10)", () => {
  it("V-N07: the application surface and the tool expose no escalation member/action", async () => {
    const rig = makeRig();
    const store = new SqliteManagementPreferenceStore(rig.managementPath, { clock: () => CLOCK });
    try {
      const management = makeProjectManagementService({
        workspace: rig.workspace,
        control: { get: (id) => store.get(id), set: (input) => store.set(input) },
        controller: rig.controller,
        clock: () => CLOCK,
      });
      const application = makePalimpsestApplicationSurface({
        controller: rig.controller,
        projectWorkspace: rig.workspace,
        projectManagement: management,
      });

      const surface = application.projectManagement!;
      // G10-AB: the operating-posture READS and the Work Mode REQUEST join the
      // agent-facing surface. The surface still exposes NO mutation of the
      // user-level default: `setWorkModePreference` stays operator-only, exactly
      // like `applyOperatorModeChange`.
      expect(Object.keys(surface).sort()).toEqual([
        "activity",
        "operatingHistory",
        "posture",
        "preview",
        "recommend",
        "reconcileProjectHead",
        "requestModeChange",
        "requestWorkModeChange",
        "run",
        "status",
        "step",
      ]);
      for (const forbidden of [
        "applyOperatorModeChange",
        "setModeUpward",
        "set_mode_upward",
        "grantAuthority",
        "grant_authority",
        "approveDisclosure",
        "approve_disclosure",
        "forceCommitment",
        "force_commitment",
        // G10-AB: the operator-only Work Mode mutation is NOT on the agent surface.
        "setWorkModePreference",
        "set_work_mode",
        "applyWorkModeChange",
      ]) {
        expect(surface).not.toHaveProperty(forbidden);
      }
      expect(typeof (management as unknown as Record<string, unknown>).applyOperatorModeChange).toBe("function");

      const tools = defineApplicationTools(application);
      const manage = tools.find((tool) => tool.name === "palimpsest_manage");
      expect(manage).toBeDefined();
      const actions = (manage as unknown as { parameters: { properties: { action: { enum: readonly string[] } } } }).parameters.properties.action.enum;
      expect([...actions]).toEqual([
        "status",
        "recommend",
        "preview",
        "step",
        "run",
        "request_mode_change",
        "reconcile_project_head",
        "posture",
        "activity",
        "request_work_mode_change",
      ]);
      expect(actions.join(",")).not.toMatch(FORBIDDEN_ESCALATION);
    } finally {
      store.close();
      await rig.cleanup();
    }
  });

  it("V-N08: SEND_PEER_REQUEST exists as an action class but has no executable candidate and is policy-blocked", async () => {
    expect([...MANAGEMENT_ACTION_CLASSES]).toContain("SEND_PEER_REQUEST");

    // The deployment never attests semantic authority, and the external capability is unmapped.
    for (const involvement of MANAGEMENT_INVOLVEMENTS) {
      const profile = materializeManagementProfile({
        projectId: PROJECT,
        involvement,
        budgets: { maxStepsPerRun: 5 },
        allowedActionClasses: defaultAllowedActionClasses(involvement),
        confirmationBoundaries: defaultConfirmationBoundaries(involvement),
        updatedAt: CLOCK,
        updatedBy: "operator",
      });
      const evaluation = evaluateManagementAction({
        profile,
        actionClass: "SEND_PEER_REQUEST",
        hasSemanticAuthority: false,
        capabilityAvailable: false,
        isWithinEnvelope: true,
        confirmed: true,
      });
      expect(evaluation.permitted, involvement).toBe(false);
    }

    // Derivation never fabricates a peer request, and every authority-shaped candidate
    // is non-executable on the deliberately-unmapped external capability.
    const rig = makeRig();
    try {
      const real = await rig.workspace.view();
      const allLoops: ProjectWorkspaceView["openLoops"] = [
        { id: "BLOCKED_WORK", kind: "BLOCKED_WORK", detail: "blocked" },
        { id: "READY_WORK:task-1", kind: "READY_WORK", detail: "ready", subjectRef: { kind: "task", id: "task-1" } },
        { id: "CAMPAIGN_WATCH:p", kind: "CAMPAIGN_WATCH", detail: "watched", subjectRef: { kind: "project", id: "p" } },
        { id: "REASONING_UNRESOLVED:c", kind: "REASONING_UNRESOLVED", detail: "open", subjectRef: { kind: "reasoning_cell", id: "c" } },
        { id: "STALE_PROOF", kind: "STALE_PROOF", detail: "stale" },
        { id: "PENDING_COMMITMENT", kind: "PENDING_COMMITMENT", detail: "commitment", subjectRef: { kind: "commitment", id: "co-1" } },
        { id: "PENDING_BOUNDARY_DECISION", kind: "PENDING_BOUNDARY_DECISION", detail: "boundary", subjectRef: { kind: "boundary_decision", id: "bd-1" } },
        { id: "JOURNAL_OPEN_QUESTION", kind: "JOURNAL_OPEN_QUESTION", detail: "question" },
        { id: "JOURNAL_OPPORTUNITY", kind: "JOURNAL_OPPORTUNITY", detail: "opportunity" },
      ];
      const candidates = deriveManagementActionCandidates({ ...real, openLoops: allLoops });
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some((candidate) => candidate.kind === "SEND_PEER_REQUEST")).toBe(false);
      for (const candidate of candidates) {
        if (AUTHORITY_REQUIRED_ACTIONS.includes(candidate.kind)) {
          expect(candidate.executable).toBe(false);
          expect(candidate.capability).toBe(CAPABILITY_EXTERNAL);
        }
      }
      // The non-executable action class is refused with a stated reason, never executed.
      const serviceGuess = candidates.find((candidate) => candidate.kind === "CREATE_EXTERNAL_COMMITMENT");
      expect(serviceGuess?.executable).toBe(false);
    } finally {
      await rig.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * PW-A…: the workspace is a read model
 * ------------------------------------------------------------------ */

describe("G10-V workspace read-model firewall (PW-A01…PW-A10)", () => {
  it("PW-A01: exposes no canonical mutator other than the two owned stores and controller.plan", async () => {
    const rig = makeRig();
    try {
      expect(Object.keys(rig.workspace).sort()).toEqual([
        "appendDecision",
        "assets",
        "associateAsset",
        "history",
        "journal",
        "openLoops",
        "projectScopedAssets",
        "promoteOpportunity",
        "recordJournalEntry",
        "resolveJournalEntry",
        "view",
      ]);
      for (const forbidden of ["plan", "append", "appendEvent", "write", "mutate", "store", "close"]) {
        expect(rig.workspace).not.toHaveProperty(forbidden);
      }

      // The two owned stores expose ONLY their append/basis/replay surface (private fields
      // stay private, so nothing else is reachable).
      for (const store of [rig.associations, rig.journal]) {
        expect(Object.keys(store)).toEqual([]);
        expect(Object.getOwnPropertyNames(Object.getPrototypeOf(store)).sort()).toEqual([
          "appendAtomic",
          "basis",
          "close",
          "constructor",
          "projects",
          "replay",
        ]);
      }

      // Read paths call neither the store append nor controller.plan.
      const originalPlan = rig.controller.plan.bind(rig.controller);
      let planCalls = 0;
      (rig.controller as unknown as { plan: typeof originalPlan }).plan = (...args: Parameters<typeof originalPlan>) => {
        planCalls += 1;
        return originalPlan(...args);
      };
      let associationAppends = 0;
      const originalAppend = rig.associations.appendAtomic.bind(rig.associations);
      (rig.associations as unknown as { appendAtomic: typeof originalAppend }).appendAtomic = (...args: Parameters<typeof originalAppend>) => {
        associationAppends += 1;
        return originalAppend(...args);
      };
      try {
        const events = rig.controller.store.connection.prepare("SELECT COUNT(*) AS total FROM events").get() as { total: number };
        await rig.workspace.view();
        await rig.workspace.assets();
        await rig.workspace.openLoops();
        await rig.workspace.history();
        await rig.workspace.journal(PROJECT);
        await rig.workspace.projectScopedAssets(PROJECT);
        expect(planCalls).toBe(0);
        expect(associationAppends).toBe(0);
        const after = rig.controller.store.connection.prepare("SELECT COUNT(*) AS total FROM events").get() as { total: number };
        expect(after.total).toBe(events.total);
      } finally {
        delete (rig.controller as unknown as { plan?: unknown }).plan;
        delete (rig.associations as unknown as { appendAtomic?: unknown }).appendAtomic;
      }

      // Structural: the service source has exactly two store-append call sites and two
      // controller.plan call sites, and never writes a raw EventStore event.
      const code = strip(readFileSync(join(WORKSPACE_DIR, "service.ts"), "utf-8"));
      expect(code.match(/\.appendAtomic\(/gu) ?? []).toHaveLength(2);
      expect(code.match(/controller\.plan\(/gu) ?? []).toHaveLength(2);
      expect(code).not.toContain("store.append(");
    } finally {
      await rig.cleanup();
    }
  });

  it("PW-A02: the derived view is deep-frozen and owns no store handle", async () => {
    const rig = makeRig();
    try {
      const view = await rig.workspace.view();
      expect(Object.isFrozen(view)).toBe(true);
      expect(Object.isFrozen(view.project)).toBe(true);
      expect(Object.isFrozen(view.assets)).toBe(true);
      expect(Object.isFrozen(view.openLoops)).toBe(true);
      // A view never carries a DatabaseSync/connection/append function.
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain("DatabaseSync");
      expect(serialized).not.toContain("appendAtomic");
    } finally {
      await rig.cleanup();
    }
  });
});
