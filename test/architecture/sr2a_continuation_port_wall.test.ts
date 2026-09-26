/**
 * SR-2 §八 — the CONTINUATION INTERFACE WALL, as machine proofs.
 *
 *    先立接口墙，再拆实现。
 *
 * The D5-d service was never wrong; its KNOWLEDGE RADIUS was. It named `EventStore`, the D3-R
 * authorities (`CompatibilityIssuer`, `ObservationRecorder`, `SourceChangeObserver`,
 * `CrossBasisAdmissionRuntime`, `CrossBasisAdmissionStore`, `RematerializationRuntime`,
 * `ProjectWorldBasisRuntime`), the world observation port, and `WorkDelegationService` — one
 * authority at a time, each individually reasonable. SR-2a replaces that with five
 * consumer-owned ports, so the service can only see what it is entitled to understand.
 *
 * These proofs assert the WALL (the import set is closed), the ORDER it preserves, and that
 * removing the wall's first real violation did not paper over anything.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyseModuleArchitecture } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

/** Comments stripped, so a pin reads CODE rather than prose that mentions a forbidden name. */
function stripComments(source: string): string {
  const blockStripped = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  return blockStripped
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at === -1 || (at > 0 && line[at - 1] === ":")) return line;
      return line.slice(0, at);
    })
    .join("\n");
}

const SERVICE = "src/continuation/service.ts";

/* ================================================================== *
 * The wall: what the service may import
 * ================================================================== */

describe("SR-2 §八 the continuation service's import set is closed", () => {
  const service = stripComments(read(SERVICE));

  it("the service imports exactly THREE modules — its ports, the permit, and its own calculus", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const node = architecture.modules.find((module) => module.file === SERVICE);
    expect(node).toBeDefined();
    /**
     * SR-2 §十四 made this STRONGER: D5-a's calculus moved into this layer, so TWO of the three
     * imports are now the service's own siblings and only the PERMIT comes from outside
     * `src/continuation/`. The service reaches no other layer at all.
     */
    expect([...node!.imports].sort()).toEqual(
      ["src/continuation/assessment.ts", "src/continuation/ports.ts", "src/domain/rework_admission.ts"].sort(),
    );
    // The only cross-layer import is the permit, which is the service's own minting authority.
    const outsideLayer = node!.imports.filter((file) => !file.startsWith("src/continuation/"));
    expect(outsideLayer).toEqual(["src/domain/rework_admission.ts"]);
  });

  it("it does NOT import the event log, the controller, or any D3-R authority", () => {
    // The ruling's exact list. Each of these was a real import before SR-2a.
    for (const forbidden of [
      "../state/index.js",
      "../state/event_store.js",
      "../tools/controller.js",
      "../project_world/issuance.js",
      "../project_world/observation_authority.js",
      "../project_world/admission_store.js",
      "../deployment/source_change_observer.js",
      "../project_world/cross_basis.js",
      "../project_world/rematerialization.js",
      "../project_world/runtime.js",
      "../project_world/result_resolution.js",
      "../interaction/work_delegation.js",
    ]) {
      expect(service, `${SERVICE} must not import ${forbidden}`).not.toContain(`"${forbidden}"`);
    }
  });

  it("it does NOT name the concrete owner types those modules export", () => {
    // A type-only import is still knowledge, and the wall is about knowledge: naming
    // `EventStore` in a signature tells the next reader which module to reach for.
    for (const forbidden of [
      "EventStore",
      "ProjectController",
      "CompatibilityIssuer",
      "ObservationRecorder",
      "SourceChangeObserverPort",
      "CrossBasisAdmissionRuntime",
      "CrossBasisAdmissionStore",
      "RematerializationRuntime",
      "ProjectWorldBasisRuntime",
      "ProjectWorldObservationPort",
      "AuthoritativeResultResolver",
      "WorkDelegationService",
      "PromotionManager",
    ]) {
      expect(service, `${SERVICE} must not name ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("it does NOT build an event payload — the wire shape belongs to the work port", () => {
    for (const forbidden of ["parseNewEvent", "normalizeEventPayload", "actionKey", "appendReworkReopening"]) {
      expect(service, `${SERVICE} must not call ${forbidden}`).not.toContain(forbidden);
    }
    // The stronger form of the vocabulary pin: no TASK_* literal at all.
    expect([...service.matchAll(/"(TASK_[A-Z_]+)"/g)]).toEqual([]);
  });

  it("it does NOT read the event log to answer a Work question", () => {
    expect(service).not.toContain("listEvents");
    // The replay question is asked, not answered by scanning:
    expect(service).toContain("deps.work.reworkLineage");
  });

  it("the ONLY remaining import outside continuation is the permit", () => {
    // The permit is the service's own minting authority (D5-d's proof pins it as the only
    // product-code caller). SR-2 §十四 relocated the calculus to `src/continuation/assessment.ts`,
    // so the service no longer reaches into `project_world` at all.
    expect(service).toContain('from "../domain/rework_admission.js"');
    expect(service).toContain('from "./assessment.js"');
    expect(service).not.toContain("../project_world/");
  });
});

/* ================================================================== *
 * The ports themselves: structural, so no owner type leaks back in
 * ================================================================== */

describe("SR-2 §八 the ports are structural, not re-exports of owner types", () => {
  const ports = stripComments(read("src/continuation/ports.ts"));

  it("ports.ts imports NO concrete owner module", () => {
    // The permit is referenced by an inline `import(...)` type for the mint, which is the one
    // authority the service owns; everything else must be declared here.
    const imports = [...ports.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    expect(imports).toEqual([]);
  });

  it("the five capabilities are declared as plain data", () => {
    for (const port of [
      "ContinuationWorkPort",
      "ContinuationWorldPort",
      "ContinuationResultPort",
      "ContinuationCanonicalPort",
      "ContinuationExecutionPort",
    ]) {
      expect(ports).toContain(`interface ${port}`);
    }
    expect(ports).toContain("interface ResultContinuationPorts");
  });

  it("the result identity is mirrored structurally rather than re-exported", () => {
    expect(ports).toContain("interface ContinuationResultRef");
    expect(ports).toContain('readonly kind: "ATTEMPT_RESULT" | "DERIVED_RESULT"');
  });

  it("the execution port exposes ONE verb — no job, no world, no worker vocabulary", () => {
    expect(ports).toContain("startOrResume(input: { readonly taskId: string }): Promise<{ readonly jobId: string }>");
    for (const forbidden of ["worldPath", "worker", "prepareMutatingWork", "settleMutatingWork"]) {
      expect(ports, `the execution port must not expose ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the canonical port exposes head facts only — never the promotion manager", () => {
    expect(ports).toContain("interface ContinuationCanonicalPort");
    for (const forbidden of ["PromotionManager", "promotionId", "promotionFacts"]) {
      expect(ports).not.toContain(forbidden);
    }
  });
});

/* ================================================================== *
 * The violation SR-2.0 exposed is GONE, and its exception with it
 * ================================================================== */

describe("SR-2 §三十一 removing the wall's first violation did not paper over it", () => {
  it("the continuation layer has ZERO forbidden edges now", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const forbidden = architecture.forbiddenImports.filter((edge) => edge.from.startsWith("src/continuation/"));
    expect(forbidden).toEqual([]);
  });

  it("the baseline exception for that edge was DELETED, not left as a dormant permission", () => {
    // A recorded exception for an edge that no longer exists is a hole: it would silently permit
    // the edge to come back. §三十一 says a vanished exception must not be kept.
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as { permittedForbiddenEdges: readonly { from: string }[] };
    expect(baseline.permittedForbiddenEdges.filter((edge) => edge.from.startsWith("src/continuation/"))).toEqual([]);
  });

  it("the exception set is back to the SR-1 four — SR-2a removed one and added none", () => {
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as { permittedForbiddenEdges: readonly unknown[] };
    expect(baseline.permittedForbiddenEdges).toHaveLength(4);
  });

  it("continuation is still L3 — the wall did not get 'fixed' by reclassifying the module", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const node = architecture.modules.find((module) => module.file === SERVICE);
    expect(node!.layer).toBe("L3");
  });
});

/* ================================================================== *
 * The ORDER the wall must preserve
 * ================================================================== */

describe("SR-2 §八 the wall preserves the frozen order", () => {
  const service = stripComments(read(SERVICE));

  it("fresh observation ≺ assessment ≺ mint ≺ reopen", () => {
    // The authority kernel's order is its semantics; a refactor that reordered it would still
    // compile. Positions in the source are the cheap way to keep the sequence visible.
    const inspectAt = service.indexOf("const world = deps.world.inspect(");
    const assessAt = service.indexOf("assessContinuation({");
    const reobserveAt = service.indexOf("const targetBeforeMint = deps.world.observeTarget(");
    const mintAt = service.indexOf("ReworkAdmissionPermit.issue({");
    const reopenAt = service.indexOf("deps.work.reopen({");
    for (const [label, at] of [
      ["world.inspect", inspectAt],
      ["assessContinuation", assessAt],
      ["observeTarget (final)", reobserveAt],
      ["permit mint", mintAt],
      ["work.reopen", reopenAt],
    ] as const) {
      expect(at, `${label} must appear in startRework`).toBeGreaterThan(-1);
    }
    expect(inspectAt).toBeLessThan(assessAt);
    expect(assessAt).toBeLessThan(reobserveAt);
    expect(reobserveAt).toBeLessThan(mintAt);
    expect(mintAt).toBeLessThan(reopenAt);
  });

  it("the mint is still the ONLY product-code caller of ReworkAdmissionPermit.issue", () => {
    // D5-d's §24 proof 6, re-asserted after the refactor because the refactor moved code.
    // `src/domain/rework_admission.ts` DEFINES `static issue`; it does not call it. The
    // distinction matters because the claim is about callers: a second CALLER would be a second
    // mint surface, while the definition is where the capability lives.
    const architecture = analyseModuleArchitecture(REPO);
    const callers = architecture.modules
      .filter((module) => module.file !== "src/domain/rework_admission.ts")
      .filter((module) => read(module.file).includes("ReworkAdmissionPermit.issue"))
      .map((module) => module.file)
      .sort();
    expect(callers).toEqual(["src/continuation/service.ts"]);
  });

  it("the composition is the only place that sees the concrete wiring", () => {
    const composition = stripComments(read("src/composition/continuation.ts"));
    // It MUST name them — that is its job.
    for (const required of ["makeObservationAuthority", "makeCompatibilityIssuer", "makeCrossBasisAdmissionRuntime", "makeRematerializationRuntime"]) {
      expect(composition, `the composition must wire ${required}`).toContain(required);
    }
    // And it must be the one implementing the ports.
    expect(composition).toContain("const workPort: ContinuationWorkPort");
    expect(composition).toContain("const worldPort: ContinuationWorldPort");
    expect(composition).toContain("const resultPort: ContinuationResultPort");
    expect(composition).toContain("const canonicalPort: ContinuationCanonicalPort");
  });
});
