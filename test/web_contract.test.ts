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

  it("WEB-FRESH-A02: the architect instruction embeds a FULL generation-time anchor", () => {
    const panels = read("Panels.tsx");
    // D8: the anchors come from ONE /api/canvas/anchor observation
    // (revision + digest, atomic), never from a client-side revision poll
    // plus a separate compile call.
    expect(panels).toMatch(/anchorCanvas\(props\.doc\)/);
    expect(panels).toMatch(/baseGraphDigest/);
    expect(panels).toMatch(/baseRevision/);
    // Review-time never injects the digest silently - the patch face shows
    // the anchor state of the SUBMITTED JSON, tri-state (a single anchor is
    // PARTIAL, never "anchored").
    expect(panels).toMatch(/锚状态/);
    expect(panels).toMatch(/FULL/);
    expect(panels).toMatch(/PARTIAL/);
    expect(panels).toMatch(/UNANCHORED/);
    expect(panels).toMatch(/未锚定/);
  });

  it("WEB-V3-A01: the v3 identity mirrors are present and pinned (PLMP-CANVAS-7)", () => {
    const types = read("types.ts");
    // The doc mirror is v3: edges[] is the one edge truth, identity rides
    // the doc, payload dependsOn is gone.
    expect(types).toMatch(/version: 3/);
    expect(types).toMatch(/CanvasEdge/);
    expect(types).toMatch(/CanvasIdentityState/);
    expect(types).toMatch(/namespace: string/);
    expect(types).toMatch(/nextNode: number/);
    expect(types).toMatch(/nextEdge: number/);
    const canvasTypes = types.slice(types.indexOf("CanvasTaskPayload"));
    expect(canvasTypes).not.toMatch(/\bdependsOn\b/);
    // The explicit v2→v3 converter mirror exists (node keys preserved).
    const upgrade = read("canvasV3.ts");
    expect(upgrade).toMatch(/upgradeCanvasV2ToV3/);
    expect(upgrade).toMatch(/allocateCanvasNodeId/);
    expect(upgrade).toMatch(/allocateCanvasEdgeId/);
    expect(upgrade).toMatch(/randomCanvasNamespace/);
    // The restore guard covers identity + edge + member integrity (the v2
    // members blind spot is closed).
    const integrity = read("canvasIntegrity.ts");
    expect(integrity).toMatch(/version !== 3/);
    expect(integrity).toMatch(/identity\.namespace/);
    expect(integrity).toMatch(/引用未知成员/);
    // D6/D9: the centralized mutation mirror is THE web mutation truth -
    // components delegate; no inline integrity logic may remain.
    const mutate = read("canvasMutate.ts");
    for (const fn of [
      "canvasAddNode",
      "canvasRemoveNode",
      "canvasDuplicateNode",
      "canvasAddEdge",
      "canvasRemoveEdge",
      "canvasReconnectEdge",
      "canvasMoveNodeScope",
      "canvasAddGroup",
      "canvasRemoveGroup",
    ]) {
      expect(mutate).toMatch(new RegExp(`export function ${fn}`));
    }
    expect(mutate).toMatch(/one-level lift/);
    const panels = read("Panels.tsx");
    expect(panels).not.toMatch(/genKey/);
    expect(panels).not.toMatch(/edges\.filter\(\(edge\) => edge\.source !== key && edge\.target !== key\)/);
    expect(panels).toMatch(/canvasRemoveNode\(doc, selected\.key\)/);
    // Connections ride the mirror too.
    const app = read("App.tsx");
    expect(app).toMatch(/upgradeCanvasV2ToV3/);
    expect(app).toMatch(/canvasAddEdge\(doc, \{ source: fromKey, target: toKey \}\)/);
    expect(app).toMatch(/canvasMoveNodeScope\(doc, key, ownerKey \?\? "root"\)/);
    expect(app).toMatch(/画布草稿已从 v2 升级到 v3/);
  });
});
