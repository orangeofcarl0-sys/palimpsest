import assert from "node:assert/strict";
export function mockReply(arm,basis){
  let parent=0,peer=0;
  return (req,n)=>{
    const messages=req.messages.filter(m=>m.role==="user").flatMap(m=>typeof m.content==="string"?[{type:"text",text:m.content}]:m.content);
    const reviewer=messages.some(b=>b.type==="text"&&b.text.includes("接班复核单 "+basis));
    const reply=JSON.stringify(messages.filter(b=>b.type==="tool_result").at(-1)?.content);
    const tool=(name,input)=>[{type:"tool_use",id:"relief_"+n,name,input}];
    const bash=command=>tool("bash",{command,description:"Check the cold-night release sheet"});
    if(reviewer){
      switch(peer++){
        case 0:return tool("depot_shift_log",{});
        case 1:assert(reply.includes("125.5"));return tool("depot_trial",{sha:basis});
        default:return [{type:"text",text:"本班记录已复测。"}];
      }
    }
    switch(parent++){
      case 0:return tool("depot_directory",{});
      case 1:return tool("depot_trial",{sha:"0".repeat(40)});
      case 2:assert(reply.includes("Current full candidate"));return arm==="P"?tool("depot_contact",{sha:basis,question:"请复核当前排班。"}):bash("node operations/retest.mjs");
      case 3:assert(reply.includes("125.5"));return bash("node -e \"const fs=require('fs'),p=require('./shift-plan.json');p.acKw=[80,40,60,60];fs.writeFileSync('shift-plan.json',JSON.stringify(p,null,2)+'\\n')\" && printf '%s\\n' 'COLD-17 冷夜 90%%：00:00 A 80、00:30 A 40、01:00 B 60、01:30 B 60 kW。旧表 B 实到 125.5，缺 4.5 kWh。平移保持 20 kW，A/B 达 126/130，余量均为零。85%% 不放行。' > HANDOVER.md && node operations/retest.mjs && git add HANDOVER.md shift-plan.json && git commit -qm 'Revise late duty slots from cold-cycle trial'");
      default:return [{type:"text",text:"排班和交班稿已提交。"}];
    }
  };
}
