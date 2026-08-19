import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ClaimGraph } from "../src/evidence/index.js";
import { DomainValidationError } from "../src/domain/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function sampleGraph(): ClaimGraph {
  const graph = new ClaimGraph();
  graph
    .addNode({ id: "CLAIM-17", kind: "claim", label: "modulation improves long-delay generalization" })
    .addNode({ id: "EVD-31", kind: "evidence", label: "EXP-31 outcome" })
    .addNode({ id: "EVD-42", kind: "evidence", label: "EXP-42 outcome" })
    .addNode({ id: "EXP-31", kind: "experiment", label: "candidate vs baseline" })
    .addNode({ id: "CONFIG-1", kind: "config", label: "seeds/params" })
    .addNode({ id: "COMMIT-A", kind: "commit", label: "code at hash" })
    .addNode({ id: "DATA-T", kind: "data", label: "metrics.csv" });
  return graph;
}

describe("scientific evidence graph (R7)", () => {
  it("records supported/contradicted evidence and derives claim status", () => {
    const graph = sampleGraph();
    graph.addEdge("EVD-31", "CLAIM-17", "supported_by");
    graph.addEdge("EVD-42", "CLAIM-17", "contradicted_by");
    expect(graph.claimStatus("CLAIM-17").status).toBe("PARTIALLY_SUPPORTED");
    expect(graph.claimStatus("CLAIM-17").supportedBy).toEqual(["EVD-31"]);
    expect(graph.claimStatus("CLAIM-17").contradictedBy).toEqual(["EVD-42"]);
  });

  it("status is supported / contradicted / inconclusive / stale — always derived", () => {
    const supported = sampleGraph();
    supported.addEdge("EVD-31", "CLAIM-17", "supported_by");
    expect(supported.claimStatus("CLAIM-17").status).toBe("SUPPORTED");

    const contradicted = sampleGraph();
    contradicted.addEdge("EVD-42", "CLAIM-17", "contradicted_by");
    expect(contradicted.claimStatus("CLAIM-17").status).toBe("CONTRADICTED");

    const inconclusive = sampleGraph();
    expect(inconclusive.claimStatus("CLAIM-17").status).toBe("INCONCLUSIVE");

    const stale = sampleGraph();
    stale.addEdge("EVD-31", "CLAIM-17", "supported_by");
    const node = stale.node("EVD-31")!;
    // Invalidate the evidence: status must become STALE even though the edge exists.
    const updated = stale.snapshot().nodes.map((n) =>
      n.id === "EVD-31" ? { ...n, invalidated: true } : n,
    );
    const rebuilt = new ClaimGraph();
    for (const n of updated) rebuilt.addNode(n);
    for (const e of stale.snapshot().edges) rebuilt.addEdge(e.source, e.target, e.relation);
    expect(rebuilt.claimStatus("CLAIM-17").status).toBe("STALE");
    void node;
  });

  it("rejects illegal edges (non-evidence cannot support a claim)", () => {
    const graph = sampleGraph();
    expect(() => graph.addEdge("EXP-31", "CLAIM-17", "supported_by")).toThrow(DomainValidationError);
    expect(() => graph.addEdge("CLAIM-17", "EXP-31", "derived_from")).toThrow(
      DomainValidationError,
    );
    expect(() => graph.addEdge("EVD-31", "CLAIM-17", "committed_in")).toThrow(
      DomainValidationError,
    );
  });

  it("walks the provenance chain CLAIM-EVIDENCE-EXPERIMENT-CONFIG-COMMIT-DATA", () => {
    const graph = sampleGraph();
    graph
      .addEdge("EVD-31", "CLAIM-17", "supported_by")
      .addEdge("EVD-31", "EXP-31", "produced_by")
      .addEdge("EXP-31", "CONFIG-1", "configured_by")
      .addEdge("EXP-31", "COMMIT-A", "committed_in")
      .addEdge("EXP-31", "DATA-T", "derived_from");
    const chain = graph.provenance("EVD-31");
    const kinds = chain.map((node) => node.kind);
    // Evidence leads to experiment, then to config/commit/data.
    expect(chain[0]).toMatchObject({ id: "EVD-31" });
    expect(kinds).toEqual(["evidence", "experiment", "config", "commit", "data"]);
    expect(graph.claimStatus("CLAIM-17").status).toBe("SUPPORTED");
  });

  it("claim status is not a stored field (no setter exists)", () => {
    const graph = sampleGraph();
    const status = graph.claimStatus("CLAIM-17");
    expect("status" in status).toBe(true);
    // The graph exposes no way to write a status directly.
    expect((graph as unknown as { setStatus?: unknown }).setStatus).toBeUndefined();
  });

  it("rejects duplicate nodes and unknown references", () => {
    const graph = sampleGraph();
    expect(() =>
      graph.addNode({ id: "CLAIM-17", kind: "claim", label: "dup" }),
    ).toThrow(DomainValidationError);
    expect(() => graph.addEdge("MISSING", "CLAIM-17", "supported_by")).toThrow(
      DomainValidationError,
    );
    expect(() => graph.claimStatus("MISSING")).toThrow(DomainValidationError);
  });

  it("controller exposes the claim graph surface", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-g7-")), "ops.sqlite"),
      git: new FakeGitPort(HEAD),
    });
    const controller = new ProjectController({
      store,
      effects,
      projectId: "scheduler-project",
      policy: new TaskPolicy({
        policy_id: "trusted-default",
        read_paths: ["src"],
        allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
        network_policy: "deny",
        network_allowlist: [],
        timeout_s: 60,
        lease_s: 10,
        attempt_limit: 8,
        candidate_limit: 4,
      }),
      clock: () => "2026-08-13T00:00:00Z",
    });
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      controller.claims
        .addNode({ id: "CLAIM-1", kind: "claim", label: "the mechanism works" })
        .addNode({ id: "EVD-1", kind: "evidence", label: "experiment outcome" })
        .addEdge("EVD-1", "CLAIM-1", "supported_by");
      expect(controller.claims.claimStatus("CLAIM-1").status).toBe("SUPPORTED");
    } finally {
      await effects.close();
      store.close();
    }
  });
});