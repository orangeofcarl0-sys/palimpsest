/** Scripted tool choices exercise DSH. All Git, test and authority operations are real. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assert } from "../energy/contract.mjs";
import { CORRECTION_PATH, FIRST, REQUIRED, RETAINED, REVIEW, SCOPE } from "./contract.mjs";

const TASK = "revise-fleet-default";
const SUBJECT = "Revise Fleet default limit";
const FIRST_SUBJECT = "Deliver gRPC migration";
const REVIEW_SUBJECT = "Deliver accepted migration review";
const CHILD = "Software migration Mock subtask. Apply the Fleet note in this isolated worktree.";
const shell = command => ({ name: "bash", input: { command, description: "Verify and commit the software artifacts" } });
const work = (action, args = {}) => ({ name: "palimpsest_work", input: { action, ...args } });
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

function writeFiles(files, subject) {
  const script = "const fs=require('node:fs'),path=require('node:path');for(const [p,v] of Object.entries(" +
    JSON.stringify(files) + ")){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v);}";
  return "node -e " + quote(script) + " && node --test && git add -- " + Object.keys(files).join(" ") + " && git commit -m " + quote(subject);
}

export function scriptedArtifacts(fixture) {
  const expected = join(fixture, "expected");
  const read = path => readFileSync(join(expected, path), "utf8").replaceAll("\r\n", "\n");
  const server = read("server/final/service/grpc_server.js");
  // A full gap still rejects buffered delivery, with slack for timer rounding on two intervals.
  const integration = read("client/test/integration.test.js").replace("span >= FRAME_GAP_MS * 2", "span >= FRAME_GAP_MS");
  const defaultTest = (title, expected) => '\ntest("' + title + '", async () => {\n  assert.deepEqual(await grpc.streamReadings("site-a", 0), ' + expected + ');\n});\n';
  const first = {
    "proto/energy.proto": read("server/final/proto/energy.proto"),
    "service/wire.js": read("server/final/service/wire.js"),
    "service/grpc_server.js": server,
    "service/grpc_client.js": read("client/service/grpc_client.js"),
    "test/server.test.js": read("server/final/test/server.test.js"),
    "test/integration.test.js": integration + defaultTest("zero limit gives an empty stream", "[]"),
    "MIGRATION.md": "# gRPC migration\n\nGetReading is unary. StreamReadings sends one Reading per frame in source order. An explicit zero or omitted limit gives an empty stream. Positive limits and the REST API keep their behavior. Unknown sites return NOT_FOUND.\n",
  };
  const revisedServer = server.replace("Math.max(0, limit)", "limit === 0 ? 3 : Math.max(0, limit)");
  assert(revisedServer !== server, "FIXTURE_DEFAULT_IMPLEMENTATION_DRIFT");
  const revised = {
    "service/grpc_server.js": revisedServer,
    "test/integration.test.js": integration + defaultTest("zero limit gives the first three readings", 'await rest.getReadings("site-a", 3)'),
    "MIGRATION.md": "# gRPC migration\n\nThe Fleet correction in " + CORRECTION_PATH + " replaces the empty stream default. An explicit zero or omitted limit now gives the first three available readings in source order, one Reading per frame. Positive limits, unary GetReading, REST, NOT_FOUND and protocol field numbers are unchanged.\n",
  };
  return { first, revised };
}

function messages(input, role, type) {
  return input.messages.filter(message => message.role === role).flatMap(message =>
    typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content).filter(block => block.type === type);
}

export function qualificationReply({ arm, session, basis, artifacts }) {
  const turns = new Map();
  let advanced = false;
  let concluded = false;
  return async (input, ordinal) => {
    const users = messages(input, "user", "text");
    const actor = users.some(block => block.text?.includes("You are a Palimpsest WORK WORKER")) ? "worker" :
      users.some(block => block.text?.includes(CHILD)) ? "child" : "principal";
    const step = turns.get(actor) ?? 0;
    turns.set(actor, step + 1);
    const content = messages(input, "user", "tool_result").at(-1)?.content;
    const result = typeof content === "string" ? content : (content ?? []).map(block => block.text ?? "").join("");
    const conclude = (intent, paths) => work("conclude", { intent, statement: "The committed migration artifacts are ready for this episode.",
      ...(paths ? { artifacts: paths } : {}) });
    let call;
    if (actor !== "principal") {
      assert(session === "T2", "UNEXPECTED_MOCK_EXECUTOR");
      if (step === 0) {
        if (actor === "worker") assert(users.some(block => [...SCOPE, ...RETAINED, "including comments"].every(path => block.text?.includes(path))),
          "MOCK_WORKER_SCOPE_NOT_VISIBLE");
        call = shell("git show HEAD:" + CORRECTION_PATH);
      } else if (step === 1) {
        assert(result.includes("first three"), "FLEET_CORRECTION_NOT_READ");
        call = shell(writeFiles(artifacts.revised, SUBJECT));
      } else if (step === 2) {
        assert(result.includes(SUBJECT), "MOCK_EXECUTOR_COMMIT_NOT_OBSERVED");
        if (actor === "worker") call = { name: "palimpsest_worker_result", input: { kind: "READY_FOR_SETTLEMENT", summary: "The Fleet correction is committed and tested." } };
      }
    } else if (session === "T1") {
      if (step === 0) call = shell("test ! -e expected && test ! -e /product/scripts && " + writeFiles(artifacts.first, FIRST_SUBJECT));
      else if (step === 1) {
        assert(result.includes(FIRST_SUBJECT), "MOCK_FIRST_COMMIT_NOT_OBSERVED");
        if (arm === "P") call = conclude("DELIVER", FIRST);
      }
    } else if (session === "T2" && arm === "P") {
      if (step === 1) assert(result.includes("SOFTWARE_REVISION_SCOPE_MISMATCH") && result.includes("including comments"), "MOCK_SCOPE_REFUSAL_NOT_VISIBLE");
      if (step <= 1) call = work("plan", { reason: "Fleet compatibility changed.", tasks: [{
        task_id: TASK, objective: "Apply the Fleet note, preserve compatibility, and commit the tested candidate.",
        depends_on: [], write_paths: step === 0 ? [...SCOPE, RETAINED[0]] : SCOPE, required_artifacts: REQUIRED,
      }] });
      else if (step === 2) call = work("delegate", { taskId: TASK });
      else if (step === 3) call = work("workers");
      else if (!concluded && advanced) {
        assert(result.includes("VERIFYING"), "MOCK_TASK_NOT_VERIFYING");
        call = conclude("WAIT_FOR_OPERATOR");
        concluded = true;
      } else if (!concluded && /FINISHED/u.test(result) && /SETTLED/u.test(result)) {
        call = work("run", { maxSteps: 8 });
        advanced = true;
      } else if (!concluded && step < 64) {
        assert(!/HOST_ERROR|HOST_FAILURE|NEEDS_ESCALATION/u.test(result), "MOCK_WORKER_NOT_SETTLED " + result);
        await delay(900);
        call = work("workers");
      }
    } else if (session === "T2") {
      if (step === 0) call = shell("git worktree add -b software-candidate .palimpsest/native-candidate");
      else if (step === 1) call = { name: "subagent", input: { cwd: ".palimpsest/native-candidate", description: "Revise Fleet compatibility", prompt: CHILD } };
      else if (step === 2 || (step < 20 && !result.includes(SUBJECT))) call = shell("sleep 1; git log -1 --format=%s software-candidate");
    } else if (step === 0) {
      call = shell("cat acceptance.json " + CORRECTION_PATH + " MIGRATION.md");
    } else if (step === 1) {
      assert(result.includes(basis) && result.includes("first three"), "ACCEPTED_INPUT_NOT_READ");
      call = shell(writeFiles({ [REVIEW]: "# Migration review\n\nAccepted HEAD: " + basis + "\n\n" +
        "Fleet correction: " + CORRECTION_PATH + ". The first release returned an empty stream for zero or omitted limits. " +
        "Either form now returns the first three available readings in source order, one Reading per frame. " +
        "Positive limits, unary GetReading, unknown-site NOT_FOUND, protocol field numbers and REST behavior stay compatible.\n\n" +
        "Verification: node --test passed for gRPC server, integration and REST tests.\n" }, REVIEW_SUBJECT));
    } else if (step === 2) {
      assert(result.includes(REVIEW_SUBJECT), "MOCK_REVIEW_COMMIT_NOT_OBSERVED");
      if (arm === "P") call = conclude("DELIVER", [REVIEW]);
    }
    if (!call) return [{ type: "text", text: "The requested qualification step is complete." }];
    assert(input.tools?.some(tool => tool.name === call.name), "MOCK_TOOL_UNAVAILABLE " + call.name);
    if (arm === "F" && actor === "principal") {
      assert(["bash", "subagent", "workflow"].every(name => input.tools.some(tool => tool.name === name)), "NATIVE_CAPABILITIES_MISSING");
    }
    return [{ type: "tool_use", id: "software_" + ordinal + "_" + actor, ...call }];
  };
}
