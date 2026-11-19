import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {ExecutionBudget,USAGE_ONLY_SCHEMA} from "./execution_budget.mjs";
import {startPaidProxy} from "./bounded_provider.mjs";
import {OPENCODE_GO_MESSAGES,OPENCODE_GO_MODEL,requireOpenCodeGoProbe} from "./opencode_go.mjs";
import {readJson,writeJson} from "./energy/contract.mjs";

const [, , output, profileRef] = process.argv;
const dir = resolve(output);
const profileId = requireOpenCodeGoProbe(readJson(profileRef));
mkdirSync(dir);
const ledger = ExecutionBudget.initialize(join(dir,"requests.sqlite"), {
  schema:USAGE_ONLY_SCHEMA, cohortId:randomUUID(), aggregateCeiling:null,
  sessions:[{id:"probe",ceiling:null,softCeiling:null,maxRequests:1}]
});
const observations = [], sessionKey = randomUUID();
const report = {schema:"pnwf-opencode-go-probe/v1",model:OPENCODE_GO_MODEL,route:OPENCODE_GO_MESSAGES,
  profileId,observations,passed:false};
let gateway;
try {
  ledger.startSession("probe");
  gateway = await startPaidProxy({budget:ledger,sessionId:"probe",sessionKey,openCodeGoProfile:profileId,
    onObservation:event=>observations.push(event)});
  report.startedAt = new Date().toISOString();
  const start = performance.now();
  const response = await fetch(gateway.url + "/v1/messages", {
    method:"POST",headers:{"x-api-key":sessionKey,"content-type":"application/json"},
    body:JSON.stringify({model:"deepseek-flash",max_tokens:256,stream:true,
      messages:[{role:"user",content:"Call record_probe exactly once with integer value 7."}],
      tools:[{name:"record_probe",description:"Return value plus one.",
        input_schema:{type:"object",properties:{value:{type:"integer"}},required:["value"]}}]})
  });
  const body = await response.text();
  report.elapsedMs = Math.round(performance.now()-start);
  report.gatewayHttpStatus = response.status;
  assert.equal(response.status,200);
  const events = body.split(/\r?\n/u).filter(line=>line.startsWith("data:")).map(line=>JSON.parse(line.slice(5)));
  const starts = events.filter(e=>e.type==="content_block_start" && e.content_block.type==="tool_use");
  assert.equal(starts.length,1);
  const [{index,content_block:block}] = starts;
  const deltas = events.filter(e=>e.type==="content_block_delta" && e.index===index && e.delta.type==="input_json_delta");
  const input = deltas.length ? JSON.parse(deltas.map(e=>e.delta.partial_json).join("")) : block.input;
  assert.equal(block.name,"record_probe");
  assert.deepEqual(input,{value:7});
  assert.ok(block.id);
  report.tool = {call:{id:block.id,name:block.name,input},result:{type:"tool_result",tool_use_id:block.id,
    content:JSON.stringify({result:input.value+1})},resultReturnedToProvider:false};
  const message = events.find(e=>e.type==="message_start").message;
  const delta = events.findLast(e=>e.type==="message_delta");
  report.stream = {model:message.model,types:events.map(e=>e.type),stopReason:delta.delta.stop_reason,finalUsage:delta.usage};
  assert.equal(report.stream.stopReason,"tool_use");
  const [admitted, terminal] = observations;
  assert.equal(observations.length,2);
  assert.equal(terminal.kind,"TERMINAL");
  assert.equal(terminal.messageId,message.id);
  assert.equal(terminal.requestId,admitted.requestId);
  Object.assign(report,{requestId:terminal.requestId,providerResponseId:message.id,terminalUsage:terminal.usage,httpStatus:200});
  ledger.endSession("probe",true);
  report.accounting = ledger.snapshot();
  requireOpenCodeGoProbe({...report,passed:true});
  report.passed = true;
} finally {
  if (gateway) await gateway.close();
  if (ledger.snapshot().sessions[0].state==="RUNNING") ledger.endSession("probe",false);
  report.accounting = ledger.snapshot();
  report.endedAt = new Date().toISOString();
  writeJson(join(dir,"probe.json"),report);
  ledger.close();
  console.log(JSON.stringify({passed:report.passed,elapsedMs:report.elapsedMs,requests:report.accounting.requests}));
}
