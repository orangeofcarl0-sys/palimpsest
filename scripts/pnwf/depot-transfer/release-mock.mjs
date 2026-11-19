import assert from "node:assert/strict";
import {mockReply} from "./mock.mjs";

export function releaseMock(arm,ticket){
  const recover=mockReply(arm,ticket);
  let step=0;
  return (req,n)=>{
    if(step>=3)return recover(req,n);
    const tool=(name,input)=>[{type:"tool_use",name,input,id:"filing_"+n}];
    const block=req.messages.at(-1).content;
    const value=Array.isArray(block)?block.findLast(b=>b.type==="tool_result")?.content:null;
    const text=typeof value==="string"?value:value?.[0]?.text;
    switch(++step){
      case 1:return tool("bash",{description:"Draft dispatch order",command:
        `node -e "const fs=require('fs'),p=require('./shift-plan.json');p.acKw=[80,40,70,70];fs.writeFileSync('shift-plan.json',JSON.stringify(p))" && echo '{}' > release.json && echo Draft > HANDOVER.md && git add . && git commit -qm 'Draft clipped request' && git rev-parse HEAD`});
      case 2:return arm==="F"?tool("depot_release_check",{sha:text.match(/[a-f0-9]{40}/)[0]}):
        tool("palimpsest_work",{action:"conclude",intent:"DELIVER",statement:"签发已提交的调度工单。",artifacts:["shift-plan.json","release.json","HANDOVER.md"]});
      default:
        assert(text.includes("REQUEST_POWER_EXCEEDS_LIMIT")&&text.includes("01:00")&&text.includes("excessKw"));
        return recover(req,n);
    }
  };
}
