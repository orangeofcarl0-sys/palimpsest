/**
 * PLMP-GRAPH-5 §B3-B / §22: web mirror conformance tripwires. The web panel
 * is a separate build chain with structural type mirrors - these tripwires
 * pin the mirror to the kernel contracts it round-trips (assessment §P2):
 * graphDigest must be consumed, TaskProposal must cover every first-party
 * field, changeClass must be the literal union, and the architect
 * instruction must embed the REAL generation-time anchors. Source-level by
 * design (the web bundle has no runtime contract surface); real behavior is
 * browser-smoke verified.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = join(import.meta.dirname, "..", "web", "src");
const read = (file: string): string => readFileSync(join(webRoot, file), "utf8");

describe("web mirror contract (WEB-FRESH-A01/A02, WEB-CONTRACT-A01)", () => {
  it("WEB-FRESH-A01: the API mirror consumes graphDigest on compile and patch", () => {
    const api = read("api.ts");
    expect(api).toMatch(/graphDigest: string/);
    expect(api).toMatch(/compileCanvas/);
    // Both faces of the patch result carry the anchor.
    expect(api).toMatch(/CanvasPatchResult/);
  });

  it("WEB-CONTRACT-A01: the TaskProposal mirror covers every first-party field", () => {
    const types = read("types.ts");
    for (const field of [
      "title",
      "dependsOn",
      "writePaths",
      "requiredArtifacts",
      "gateId",
      "role",
      "suggestedSkills",
      "scopeId",
      "definitionId",
    ]) {
      expect(types).toMatch(new RegExp(`\\b${field}\\???:`));
    }
    // changeClass is the literal union, not a bare string.
    expect(types).toMatch(/changeClass: ChangeClass/);
    expect(types).toMatch(/"contract_breaking"/);
  });

  it("WEB-FRESH-A02: the architect instruction embeds generation-time anchors", () => {
    const panels = read("Panels.tsx");
    // The instruction is built from a fresh compile of the current draft.
    expect(panels).toMatch(/baseGraphDigest/);
    expect(panels).toMatch(/baseRevision/);
    expect(panels).toMatch(/compileCanvas\(props\.doc\)/);
    // Review-time never injects the digest silently - the patch face shows
    // the anchor state of the SUBMITTED JSON instead.
    expect(panels).toMatch(/锚状态/);
    expect(panels).toMatch(/未锚定/);
  });
});
