/**
 * G10-E1 participation machine proofs.
 *
 *   E1-M01  Activation ≠ Attempt
 *   E1-M02  Invocation ≠ Participation
 *   E1-M03  Invocation does not imply Participation
 *   E1-M04  Participation does not imply Attempt ownership
 *   E1-M05  ActivationRef derived from actual Activation
 *   E1-M06  AttemptRef derived from canonical Attempt (validated)
 *   E1-M07  terminal Attempt refuses new Participation start
 *   E1-M08  Participation can exist without Invocation
 *   E1-M09  same Invocation id + same content idempotent
 *   E1-M10  conflicting duplicate fails closed
 *   E1-M11  store restart/readback
 *   E1-M12  runtime artifacts remain immutable
 *   E1-M13  scheduler unchanged (no-diff + suite)
 *   E1-M14  AttemptExecutor unchanged (no-diff + suite)
 *   plus §156-style end-twice idempotency and unknown-participation fail-closed.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { materializeActivation } from "../src/runtime/index.js";
import type { Activation } from "../src/runtime/index.js";
import {
  ParticipationError,
  activationRefOf,
  attemptRefOf,
  materializeInvocation,
  materializeParticipation,
} from "../src/coordination/index.js";
import type { Invocation, Participation } from "../src/coordination/index.js";
import {
  SqliteCoordinationStore,
  makeParticipationService,
} from "../src/coordination/index.js";
import type { AttemptCatalogPort } from "../src/coordination/index.js";

const PARTICIPATION_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/coordination/participate.ts", import.meta.url)),
  "utf-8",
);

function activation(): Activation {
  return materializeActivation({
    activationId: "act-e1",
    agentDefinitionId: "A",
    runDefinition: { digest: "rd-1" },
    bindingResolution: { resolutionId: "res-1", digest: "rr-1" },
  });
}

/** Scripted canonical attempt catalog (E1-M06/E1-M07): real states, deterministic. */
function attemptCatalog(states: Record<string, string>): AttemptCatalogPort {
  return {
    assertAdmissibleAttempt: async (attempt) => {
      const state = states[`${attempt.projectId}/${attempt.attemptId}`];
      if (state === undefined) {
        throw new ParticipationError(
          "attempt_unknown",
          `attempt "${attempt.attemptId}" does not exist`,
        );
      }
      if (["COMPLETED", "FAILED", "EXPIRED", "CANCELLED", "STALE"].includes(state)) {
        throw new ParticipationError("attempt_terminal", `attempt is terminal (${state})`);
      }
    },
  };
}

function service(
  states: Record<string, string> = { "p1/attempt-1": "RUNNING" },
  store = new SqliteCoordinationStore(":memory:"),
) {
  let invocationCounter = 0;
  let participationCounter = 0;
  return {
    service: makeParticipationService({
      store,
      attempts: attemptCatalog(states),
      allocateInvocationId: () => `inv-${++invocationCounter}`,
      allocateParticipationId: () => `part-${++participationCounter}`,
    }),
    store,
  };
}

describe("E1-M01: Activation ≠ Attempt", () => {
  it("the two identities live in different artifacts with disjoint fields", () => {
    const act = activation();
    const attempt = attemptRefOf("p1", "attempt-1");
    expect(act.activationId).toBe("act-e1");
    expect(attempt).toEqual({ projectId: "p1", attemptId: "attempt-1" });
    expect(Object.keys(attempt)).toEqual(["projectId", "attemptId"]);
    expect(JSON.stringify(attempt)).not.toContain("agentDefinitionId");
  });
});

describe("E1-M02/M03: Invocation ≠ Participation; invocation never implies participation", () => {
  it("recording an Invocation appends no PARTICIPATION_STARTED", async () => {
    const { service: participationService, store } = service();
    const invocation = await participationService.recordInvocation({
      activation: activation(),
      attempt: attemptRefOf("p1", "attempt-1"),
    });
    expect(invocation.purpose).toBe("participate");
    const history = await store.replay();
    expect(history.map((event) => event.type)).toEqual(["INVOCATION_RECORDED"]);
    // Distinct artifacts: Invocation has no participationId; Participation has no purpose.
    const serialized = JSON.stringify(invocation);
    expect(serialized).not.toContain("participationId");
    const participation = materializeParticipation({
      participationId: "part-1",
      activation: activationRefOf(activation()),
      attempt: attemptRefOf("p1", "attempt-1"),
    });
    expect(JSON.stringify(participation)).not.toContain("purpose");
  });
});

describe("E1-M05: ActivationRef derived from an actual Activation (§25)", () => {
  it("carries the activation's own provenance — not caller-assembled", () => {
    const act = activation();
    const ref = activationRefOf(act);
    expect(ref).toEqual({
      activationId: "act-e1",
      agentDefinitionId: "A",
      runDefinition: { digest: "rd-1" },
      bindingResolution: { resolutionId: "res-1", digest: "rr-1" },
    });
    expect(Object.isFrozen(ref)).toBe(true);
    expect(Object.isFrozen(ref.runDefinition)).toBe(true);
  });
});

describe("E1-M06/M07: Attempt validation against canonical state (§34)", () => {
  it("unknown attempts fail closed; terminal attempts refuse NEW participation starts", async () => {
    const { service: participationService } = service({ "p1/attempt-1": "RUNNING", "p1/attempt-9": "COMPLETED" });
    // E1-M07: terminal attempt refuses new participation.
    await expect(
      participationService.beginParticipation({
        activation: activation(),
        attempt: attemptRefOf("p1", "attempt-9"),
      }),
    ).rejects.toMatchObject({ kind: "attempt_terminal" });
    // Unknown attempt fails closed.
    await expect(
      participationService.beginParticipation({
        activation: activation(),
        attempt: attemptRefOf("p1", "attempt-404"),
      }),
    ).rejects.toMatchObject({ kind: "attempt_unknown" });
    // Historical invocation against a now-terminal attempt is still a record.
    const invocation = await participationService.recordInvocation({
      activation: activation(),
      attempt: attemptRefOf("p1", "attempt-9"),
    });
    expect(invocation.invocationId).toBe("inv-1");
  });
});

describe("E1-M08: Participation without Invocation is representable (§29)", () => {
  it("voluntary participation has no invocation field", async () => {
    const { service: participationService, store } = service();
    const participation = await participationService.beginParticipation({
      activation: activation(),
      attempt: attemptRefOf("p1", "attempt-1"),
    });
    expect(participation.invocation).toBeUndefined();
    const history = await store.replay();
    const started = history.find((event) => event.type === "PARTICIPATION_STARTED");
    expect(JSON.stringify(started)).not.toContain("invocationId");
  });
});

describe("E1-M04: Participation does not imply Attempt ownership (§28)", () => {
  it("the participation payload contains no ownership/authority fields", async () => {
    const { service: participationService, store } = service();
    await participationService.beginParticipation({
      activation: activation(),
      attempt: attemptRefOf("p1", "attempt-1"),
    });
    const serialized = JSON.stringify(await store.replay());
    for (const forbidden of ["owner", "authority", "assignment", "grants", "evidence"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("E1-M09/M10: store idempotency and conflict fail-closed (§31/§79)", () => {
  it("same eventId + byte-identical payload is idempotent; different content fails closed", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    const invocation = materializeInvocation({
      invocationId: "inv-1",
      activation: activationRefOf(activation()),
      attempt: attemptRefOf("p1", "attempt-1"),
    });
    const base = {
      eventId: "evt-1",
      projectId: "p1",
      type: "INVOCATION_RECORDED" as const,
      payload: { invocation },
    };
    const first = await store.append(base);
    const second = await store.append({ ...base });
    expect(second[0]!.seq).toBe(first[0]!.seq);
    await expect(
      store.append({
        ...base,
        payload: {
          invocation: materializeInvocation({
            invocationId: "inv-1",
            activation: activationRefOf(activation()),
            attempt: attemptRefOf("p1", "attempt-2"),
          }),
        },
      }),
    ).rejects.toMatchObject({ kind: "coordination_conflict" });
    expect((await store.replay()).length).toBe(1);
  });
});

describe("E1-M11: restart/readback (§31)", () => {
  it("a reopened store replays the same history", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "palimpsest-e1-")), "coordination.sqlite");
    const store = new SqliteCoordinationStore(path);
    const { service: first } = service(undefined, store);
    await first.beginParticipation({
      activation: activation(),
      attempt: attemptRefOf("p1", "attempt-1"),
    });
    store.close();
    const reopened = new SqliteCoordinationStore(path);
    const history = await reopened.replay();
    expect(history.map((event) => event.type)).toEqual(["PARTICIPATION_STARTED"]);
    reopened.close();
  });
});

describe("E1-M12: coordination artifacts immutable (§32-draft §32 immutability)", () => {
  it("invocations and participations are deep-frozen and detached", () => {
    const invocation: Invocation = materializeInvocation({
      invocationId: "inv-1",
      activation: activationRefOf(activation()),
      attempt: attemptRefOf("p1", "attempt-1"),
    });
    const participation: Participation = materializeParticipation({
      participationId: "part-1",
      activation: activationRefOf(activation()),
      attempt: attemptRefOf("p1", "attempt-1"),
      invocation: { invocationId: "inv-1" },
    });
    expect(Object.isFrozen(invocation)).toBe(true);
    expect(Object.isFrozen(invocation.activation)).toBe(true);
    expect(Object.isFrozen(participation)).toBe(true);
    expect(Object.isFrozen(participation.attempt)).toBe(true);
    expect(() => {
      (invocation as { invocationId: string }).invocationId = "x";
    }).toThrow(TypeError);
  });
});

describe("participation lifecycle: end reasons are participation outcomes (§30)", () => {
  it("end after start appends PARTICIPATION_ENDED without touching Attempt state", async () => {
    const { service: participationService, store } = service();
    const participation = await participationService.beginParticipation({
      activation: activation(),
      attempt: attemptRefOf("p1", "attempt-1"),
    });
    const ended = await participationService.endParticipation({
      participationId: participation.participationId,
      endReason: "withdrawn",
    });
    expect(ended.payload.endReason).toBe("withdrawn");
    const history = await store.replay();
    expect(history.map((event) => event.type)).toEqual([
      "PARTICIPATION_STARTED",
      "PARTICIPATION_ENDED",
    ]);
    // Ending an unknown participation fails closed; ending twice is idempotent.
    await expect(
      participationService.endParticipation({ participationId: "part-404", endReason: "completed" }),
    ).rejects.toBeInstanceOf(ParticipationError);
    const again = await participationService.endParticipation({
      participationId: participation.participationId,
      endReason: "withdrawn",
    });
    expect(again.seq).toBe(ended.seq);
  });
});

describe("E1-M13/M14: scheduler and executors untouched (structural audits)", () => {
  it("no coordination imports enter the scheduler or executor modules", () => {
    const schedulerSource = readFileSync(
      fileURLToPath(new URL("../src/scheduler/scheduler.ts", import.meta.url)),
      "utf-8",
    );
    const executorSource = readFileSync(
      fileURLToPath(new URL("../src/effects/executor.ts", import.meta.url)),
      "utf-8",
    );
    for (const source of [schedulerSource, executorSource]) {
      expect(source).not.toMatch(/coordination|Invocation|Participation/);
    }
    // The participation service never touches the scheduler or executors.
    expect(PARTICIPATION_SOURCE).not.toMatch(/scheduler|AttemptExecutor|ClaimReportExecutor/);
  });
});
