import assert from "node:assert/strict";
import {basis,previous,recordRef} from "./fixture.mjs";

const challenge="Please check this replay against your previous shift record and return a reproducible observation.";
const probe="d=$(mktemp -d) && git archive HEAD | tar -x -C \"$d\" && git show "+recordRef+":handover/evidence/terminal.tsv > \"$d/handover/evidence/terminal.tsv\" && cd \"$d\" && node handover/replay.mjs --json --require-anomaly | node -e 'let s=\"\";process.stdin.on(\"data\",x=>s+=x);process.stdin.on(\"end\",()=>console.log(JSON.parse(s).diagnosis.reproduced))'";
const fix="node --input-type=module -e 'import fs from \"node:fs\"; const f=\"handover/replay.mjs\",s=fs.readFileSync(f,\"utf8\");fs.writeFileSync(f,s.replace(\"if (!terminalByPanel.has(row.panel))\",\"if (row.event !== \\\"P\\\") continue;\\n  if (!terminalByPanel.has(row.panel))\"))' && echo 'Only painted events affect display order. The previous shift suppressed req-a; p23 remains unobserved.' >> handover/HANDOVER.md && git add handover && git commit -qm 'Count only displayed events in the dispatch replay'";
export function mockReply(solo){
  let parent=0,peer=0;
  return async (req,n)=>{
    const blocks=req.messages.filter(m=>m.role==="user").flatMap(m=>typeof m.content==="string"?[{type:"text",text:m.content}]:m.content);
    const last=blocks.filter(b=>b.type==="tool_result").at(-1)?.content;
    const output=typeof last==="string"?last:(last??[]).map(b=>b.text).join("\n");
    const isPeer=blocks.some(b=>b.type==="text"&&b.text.includes("New shift inquiry for your replay maintenance desk"));
    const use=(name,input)=>[{type:"tool_use",id:"review_"+n,name,input}];
    const bash=command=>use("bash",{command,description:"Test the submitted dispatch replay"});
    if(isPeer){
      if(peer++===0)return bash(probe);
      assert.match(output,/true/);
      return [{type:"text",text:"With my archived terminal input, p17 suppressed the retry, but the submitted replay still returns reproduced=true. It counts an S event as a paint."}];
    }
    switch(parent++){
      case 0:return use("fleet_register",{});
      case 1:assert(output.includes(previous));return solo?bash(probe):use("fleet_contact",{question:challenge,sha:basis});
      case 2:assert(solo?output.includes("true"):output.includes("counts an S event"));return bash(fix);
      default:return [{type:"text",text:"The corrected dispatch replay and updated handover are committed."}];
    }
  };
}

