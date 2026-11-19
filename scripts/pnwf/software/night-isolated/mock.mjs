import assert from "node:assert/strict";
import {basis,previous,recordRef} from "../night-review/fixture.mjs";

const challenge="Please check this replay against your previous shift record and return a reproducible observation.";
const probe="d=$(mktemp -d) && git archive HEAD | tar -x -C \"$d\" && git show "+recordRef+":handover/evidence/terminal.tsv > \"$d/handover/evidence/terminal.tsv\" && cd \"$d\" && node handover/replay.mjs --json --require-anomaly | node -e 'let s=\"\";process.stdin.on(\"data\",x=>s+=x);process.stdin.on(\"end\",()=>console.log(JSON.parse(s).diagnosis.reproduced))'";
const fix="node --input-type=module -e 'import fs from \"node:fs\"; const f=\"handover/replay.mjs\",s=fs.readFileSync(f,\"utf8\");fs.writeFileSync(f,s.replace(\"if (!terminalByPanel.has(row.panel))\",\"if (row.event !== \\\"P\\\") continue;\\n  if (!terminalByPanel.has(row.panel))\"))' && echo 'Only painted events affect display order. The previous shift suppressed req-a; p23 remains unobserved.' >> handover/HANDOVER.md && git add handover && git commit -qm 'Count only displayed events in the dispatch replay'";
const denialScript=`const post=(route,a)=>fetch("http://127.0.0.1:18080/pnwf/"+route,{method:"POST",body:JSON.stringify(a)});
if((await post("work",{action:"conclude",intent:"DELIVER"})).status!==403)throw Error("work route exposed");
for(const bad of [{action:"conclude",intent:"DELIVER"},{action:"measure",sha:"0".repeat(40),capture:"S"},{action:"measure",sha:"${basis}",capture:"S",exit:0}]){if((await (await post("desk",bad)).json()).ok!==false)throw Error("invalid measurement accepted");}
console.log("denials confirmed")`;
const denials="node --input-type=module -e '"+denialScript+"'";
export function mockReply(solo){
  let parent=0,peer=0;
  return async (req,n)=>{
    const blocks=req.messages.filter(m=>m.role==="user").flatMap(m=>typeof m.content==="string"?[{type:"text",text:m.content}]:m.content);
    const last=blocks.filter(b=>b.type==="tool_result").at(-1)?.content;
    const output=typeof last==="string"?last:(last??[]).map(b=>b.text).join("\n");
    const isPeer=blocks.some(b=>b.type==="text"&&b.text.includes("Incoming dispatch review for candidate"));
    const use=(name,input)=>[{type:"tool_use",id:"review_"+n,name,input}];
    const bash=command=>use("bash",{command,description:"Test the submitted dispatch replay"});
    if(isPeer){
      switch(peer++){
        case 0:return bash(denials);
        case 1:assert.match(output,/denials confirmed/);return use("fleet_measure",{sha:basis,capture:"P"});
        case 2:assert.match(output,/"capture":"P"/);return use("fleet_measure",{sha:basis,capture:"S"});
        default:assert.match(output,/"capture":"S"/);return [{type:"text",text:"Private reviewer note. Never forward this free text."}];
      }
    }
    switch(parent++){
      case 0:return use("fleet_register",{});
      case 1:assert(output.includes(previous));return solo?bash(probe):use("fleet_contact",{question:challenge,sha:"0".repeat(40)});
      case 2:if(solo){assert.match(output,/true/);return bash(fix);}assert.match(output,/Current candidate SHA required/);return use("fleet_contact",{question:challenge,sha:basis});
      case 3:if(!solo){assert.match(output,/"capture":"S"/);return bash(fix);}
      default:return [{type:"text",text:"The corrected dispatch replay and updated handover are committed."}];
    }
  };
}
