/** Load exact basis mistakes from the original P/F calls paired to their refusal results. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { readJson } from "../energy/contract.mjs";

export function readReleaseContactRefusals(archive) {
  return Object.fromEntries(["P", "F"].map(arm => {
    const out = join(archive, "live", arm, "out", "RELEASE");
    const result = readJson(join(archive, "live", arm, "result.json"));
    const principal = result.evidence.traces.find(trace => trace.role === "principal");
    const timelines = join(out, "attribution");
    const timeline = readdirSync(timelines).filter(file => file.endsWith(".timeline.json"))
      .map(file => readJson(join(timelines, file)).summary).find(summary => summary.session.id === principal.id);
    assert(timeline);
    const rejected = readJson(join(out, "release-desk.json")).filter(row =>
      row.actor === "principal" && row.action === "contact" && row.code === "REVIEW_BASIS_OR_REQUEST_INVALID");
    assert.equal(rejected.length, 2);
    const fixtures = rejected.map(row => {
      const matches = timeline.calls.filter(call => call.kind === "release_contact" && call.args.basis === row.basis);
      assert.equal(matches.length, 1);
      const [call] = matches;
      const result = timeline.results.find(result => result.callId === call.callId);
      assert(result?.callSeq === call.seq);
      return { callId: call.callId, callSeq: call.seq, resultSeq: result.seq, args: call.args };
    });
    return [arm, fixtures];
  }));
}
