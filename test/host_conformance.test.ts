import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HostContractMismatchError, assertHostContract, runHostAdapterConformance } from "@ordarium/host-kit";

import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";

import { FakeClock, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig() {
  const operationsPath = join(mkdtempSync(join(tmpdir(), "palimpsest-conf-")), "ops.sqlite");
  const effects = createPalimpsestEffects({
    // PLMP-CONF-1 §1.3: the scratch-ledger rule - the conformance runner only
    // ever touches this temporary operations ledger, never $DSH_HOME.
    databasePath: operationsPath,
    git: new FakeGitPort(HEAD),
  });
  return { operationsPath, effects, cleanup: () => effects.close() };
}

describe("host adapter conformance (PLMP-CONF-1)", () => {
  it("CONF-A01: the handshake pins contract generation 1, fail-closed", () => {
    expect(assertHostContract(1)).toBeUndefined();
    expect(() => assertHostContract(2)).toThrow(HostContractMismatchError);

    // Assembly runs the handshake: every rig below would throw on mismatch.
    const { effects, cleanup } = makeRig();
    try {
      expect(effects.hostPort).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("CONF-A02: hostPort.invoke is a total pass-through of the host invocation", async () => {
    const { effects, cleanup } = makeRig();
    try {
      const outcome = await effects.hostPort.invoke(
        effects.actions.worktreeCreate,
        { worktreeId: "conf-att-1", baseCommit: HEAD },
        {
          identity: {
            source: "external-host",
            scope: "conf-project",
            callId: "host-call-1",
          },
          authorization: {
            decision: "allow",
            kind: "policy-decision",
            source: "conf-host",
            reason: "conformance probe",
          },
        },
      );
      expect(outcome.worktreePath).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("CONF-A03/A04: the runner passes all four scenarios on the scratch ledger", async () => {
    const { operationsPath, effects, cleanup } = makeRig();
    try {
      expect(operationsPath).toContain("palimpsest-conf-"); // scratch, not $DSH_HOME
      await expect(
        runHostAdapterConformance(effects.hostPort, effects.runtime.ledger),
      ).resolves.toBeUndefined();
    } finally {
      cleanup();
    }
  });
});
