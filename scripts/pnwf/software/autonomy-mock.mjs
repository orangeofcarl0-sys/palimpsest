import assert from "node:assert/strict";
import { prompt } from "./autonomy-evidence.mjs";

const question = "Measure the Fleet client's zero and omitted stream limits against this release, and return a reproducible counterexample.";
const finding = "Both the explicit-zero and omitted requests returned zero Readings for site-a on the basis although Fleet requires three.";
const note = "Use the measured zero-frame counterexample to revise the stream default and its public tests. Preserve the existing wire contract.";
export const mockFinding = { finding, note };
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const shell = command => ({name:"bash",input:{command,description:"Check the Fleet release"}});
const resultText = blocks => typeof blocks === "string" ? blocks : (blocks ?? []).map(b => b.text ?? "").join("\n");
const command = "const fs=require('fs');const s=require('./service/grpc_server').createGrpcServer();s.listen(0,'127.0.0.1',async()=>{try{const c=require('./service/grpc_client').createGrpcClient(s.address().port);const counts=[(await c.getReadings('site-a',0)).length,(await c.getReadings('site-a')).length]; console.log(JSON.stringify(counts));fs.mkdirSync('.palimpsest',{recursive:true});fs.writeFileSync('.palimpsest/child-observation.json',JSON.stringify(counts));}finally{s.close()}})";
export function mockReply(patch) {
  let principal = 0, child = 0, contributionId;
  return async (request, ordinal) => {
    const messages = request.messages.filter(m => m.role === "user");
    const user = messages.flatMap(m => typeof m.content === "string" ? [{type:"text",text:m.content}] : m.content);
    const result = resultText(user.filter(b => b.type === "tool_result").at(-1)?.content);
    const isChild = user.some(b => b.type==="text" && b.text.includes(question)) &&
      !user.some(b => b.type==="text" && b.text.includes(prompt));
    let call;
    if (isChild) {
      if (child++ === 0) call = shell("node -e " + quote(command));
      else { assert(result.includes("[0,0]"),result); return [{type:"text",text:finding}]; }
    } else {
      switch(principal++) {
        case 0: call={name:"subagent",input:{description:"Fleet compatibility measurement",prompt:question}};break;
        case 1: call=shell("for n in $(seq 1 25); do test -s .palimpsest/child-observation.json && break; sleep 1; done; cat .palimpsest/child-observation.json");break;
        case 2:
          assert(result.includes("[0,0]"),result);
          call={name:"palimpsest_contribute",input:{action:"record",sourceKind:"NATIVE_SUBAGENT",sourceRef:"fleet-compatibility-measurement",task:question,finding,artifacts:["service/grpc_server.js","test/integration.test.js"]}};break;
        case 3:
          contributionId=result.match(/ctb-[0-9a-f]{32}/u)?.[0];assert(contributionId,result);
          call={name:"palimpsest_contribute",input:{action:"decide",contributionId,decision:"ACCEPT_AS_CANDIDATE",decisionNote:note}};break;
        case 4:
          assert(result.includes("ACCEPT_AS_CANDIDATE"),result);
          call=shell("printf %s " + quote(patch.toString("base64")) + " | base64 -d | git apply - && node --test && git add -u && git commit -m 'Apply the measured Fleet default correction'");break;
        case 5:
          assert(result.includes("Apply the measured Fleet default correction"),result);
          return [{type:"text",text:"The tested revision is committed and awaiting release review."}];
        default:return [{type:"text",text:"The revision is ready for release review."}];
      }
    }
    assert(request.tools.some(t=>t.name===call.name),"ordinary DSH tool missing: "+call.name);
    return [{type:"tool_use",id:"fleet_"+ordinal,...call}];
  };
}
