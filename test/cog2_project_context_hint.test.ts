/**
 * COG-2 §15 — the launch-context seam: a cold principal must be told, in one sentence, that the
 * project has recorded earlier work. Measured failure: with a populated journal and no invitation,
 * a later principal made ZERO product calls and never discovered the journal; one sentence changed
 * that. This is presentation, not semantics: the hint carries a count and no entry title or body.
 *
 * The tests are written against the contract before the seam exists.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE = pathToFileURL(join(import.meta.dirname, "..", "host", "dsh", "lib", "project_hint.js")).href;

interface HintModule {
  readonly composeLaunchMessage: (workspace: unknown, message: string) => Promise<string>;
  readonly projectContextHint: (workspace: unknown) => Promise<string | null>;
}

async function load(): Promise<HintModule> {
  return (await import(MODULE)) as HintModule;
}

function entry(index: number): unknown {
  return {
    entry: {
      entryId: `pje-${index}`,
      kind: "REFERENCE_NOTE",
      title: `SECRET-TITLE-${index}`,
      body: `SECRET-BODY-${index}`,
    },
  };
}

const MESSAGE = "Produce the six-month programme plan.";

describe("COG-2 launch-context hint", () => {
  it("prepends a count-only hint when the workspace has recorded entries", async () => {
    const { composeLaunchMessage } = await load();
    const workspace = { journal: async () => [entry(1), entry(2), entry(3)] };
    const composed = await composeLaunchMessage(workspace, MESSAGE);

    expect(composed).toContain("3 journal entries");
    expect(composed.endsWith(MESSAGE)).toBe(true);
    expect(composed.indexOf("3 journal entries")).toBeLessThan(composed.indexOf(MESSAGE));
    // Presentation, not content: no title, body or entry id crosses the seam.
    expect(composed).not.toContain("SECRET");
    expect(composed).not.toContain("pje-");
  });

  it("uses the singular for one entry", async () => {
    const { composeLaunchMessage } = await load();
    const workspace = { journal: async () => [entry(1)] };
    expect(await composeLaunchMessage(workspace, MESSAGE)).toContain("1 journal entry");
  });

  it("leaves the message byte-identical when the journal is empty", async () => {
    const { composeLaunchMessage } = await load();
    expect(await composeLaunchMessage({ journal: async () => [] }, MESSAGE)).toBe(MESSAGE);
  });

  it("leaves the message byte-identical when the workspace is absent", async () => {
    const { composeLaunchMessage } = await load();
    expect(await composeLaunchMessage(undefined, MESSAGE)).toBe(MESSAGE);
    expect(await composeLaunchMessage({}, MESSAGE)).toBe(MESSAGE);
  });

  it("leaves the message byte-identical when the journal read fails", async () => {
    const { composeLaunchMessage } = await load();
    const workspace = {
      journal: async () => {
        throw new Error("the journal store is unavailable");
      },
    };
    expect(await composeLaunchMessage(workspace, MESSAGE)).toBe(MESSAGE);
  });
});
