import { isDeepStrictEqual } from "node:util";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { docker } from "../container_runtime.mjs";
import { assert, blob, changed, digest, git, writeJson } from "../energy/contract.mjs";
import { CORRECTION_PATH, FIRST, REVIEW, revisionResult, snapshot } from "./contract.mjs";

const PROBE = fileURLToPath(new URL("./probe.cjs", import.meta.url));
const readings = [4120, 4185, 4090, 4210, 4150, 3970].map((watts, index) => ({
  siteId: "site-a", watts, atMs: 1762300000000 + index * 60000,
}));
export const OFFLINE = ["--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "128", "--user", "1001:1001"];
const samePaths = (actual, expected) => isDeepStrictEqual([...actual].sort(), [...expected].sort());

function failures(rows, count) {
  const expected = {
    zero: readings.slice(0, count), omitted: readings.slice(0, count),
    positive2: readings.slice(0, 2), positive6: readings, unknownStream: [], unknownUnary: [], unary: readings.slice(0, 1),
  };
  return Object.entries(expected).filter(([key, frames]) =>
    !isDeepStrictEqual(rows[key], { status: key.startsWith("unknown") ? "5" : "0", frames })).map(([key]) => key);
}

export function scoreDelivery({ repo, basis, commit, revised, output, image }) {
  const changedPaths = revised ? revisionResult(repo, basis, commit) : changed(repo, basis, commit);
  assert(revised || samePaths(changedPaths, FIRST), "SOFTWARE_T1_ARTIFACTS_MISMATCH");
  const tree = git(repo, "rev-parse", commit + "^{tree}");
  snapshot(repo, commit, output);
  const protocol = readFileSync(join(output, "proto/energy.proto"), "utf8");
  assert(/rpc GetReading\s*\(SiteRequest\)\s*returns\s*\(Reading\)/u.test(protocol) &&
    /rpc StreamReadings\s*\(StreamRequest\)\s*returns\s*\(stream Reading\)/u.test(protocol), "SOFTWARE_PROTO_RPC_CONTRACT");
  assert(blob(repo, commit, "test/rest.test.js") === blob(repo, basis, "test/rest.test.js"), "SOFTWARE_REST_TEST_CHANGED");
  const container = docker(["run", "-d", "--network", "none", ...OFFLINE, "-v", output + ":/candidate:ro", "-w", "/candidate", image,
    "node", "-e", "require('./service/grpc_server.js').createGrpcServer(require('./service/data.js')).listen(17753,'127.0.0.1')"]);
  const evidence = { commit, tree, changedPaths, blobs: Object.fromEntries([...FIRST, "test/rest.test.js"].map(path => [path, blob(repo, commit, path)])) };
  try {
    const tests = docker(["exec", "--user", "1001:1001", "--workdir", "/candidate", container, "node", "--test"]);
    writeFileSync(join(output, "..", "public-tests.log"), tests + "\n");
    evidence.publicTests = Number(tests.match(/tests (\d+)/u)?.[1]);
    assert(evidence.publicTests >= 8, "SOFTWARE_PUBLIC_TESTS_NOT_OBSERVED");
    evidence.probes = JSON.parse(docker(["run", "--rm", "--network", "container:" + container, ...OFFLINE,
      "-v", PROBE + ":/probe.cjs:ro", image, "node", "/probe.cjs"]));
    evidence.oldRuleFailures = failures(evidence.probes, 0);
    evidence.newRuleFailures = failures(evidence.probes, 3);
    assert(samePaths(evidence.oldRuleFailures, revised ? ["zero", "omitted"] : []) &&
      samePaths(evidence.newRuleFailures, revised ? [] : ["zero", "omitted"]), "SOFTWARE_HTTP2_CONTRACT_FAILED");
    return evidence;
  } finally {
    writeJson(join(output, "..", "score.json"), evidence);
    docker(["rm", "-f", container]);
  }
}

export function scoreReview({ repo, basis, commit }) {
  const changedPaths = changed(repo, basis, commit);
  assert(samePaths(changedPaths, [REVIEW]), "SOFTWARE_REVIEW_SCOPE_MISMATCH");
  assert(git(repo, "ls-tree", commit, "--", REVIEW).startsWith("100644 blob "), "SOFTWARE_REVIEW_NOT_REGULAR");
  const bytes = execFileSync("git", ["-c", "safe.directory=*", "-C", repo, "cat-file", "blob", commit + ":" + REVIEW]);
  const body = bytes.toString("utf8");
  for (const item of [basis, CORRECTION_PATH, "empty stream", "zero or omitted", "first three", "source order",
    "one Reading per frame", "Positive limits", "unary GetReading", "NOT_FOUND", "protocol field numbers", "REST", "node --test passed"]) {
    assert(body.includes(item), "SOFTWARE_REVIEW_MISSING " + item);
  }
  return { commit, tree: git(repo, "rev-parse", commit + "^{tree}"), changedPaths, reviewSha256: digest(bytes) };
}
