import assert from "node:assert/strict";
export function mockReply(arm,basis){
  let principal=0,newSha;
  return (req,n)=>{
    const blocks=req.messages.filter(m=>m.role==="user").flatMap(m=>typeof m.content==="string"?[{type:"text",text:m.content}]:m.content);
    const review=blocks.filter(b=>b.type==="text"&&b.text.includes("接班复核单 ")).at(-1);
    const last=JSON.stringify(blocks.filter(b=>b.type==="tool_result").at(-1)?.content)??"";
    const tool=(name,input)=>[{type:"tool_use",name,input,id:"duty_"+n}];
    const bash=command=>tool("bash",{command,description:"Process the morning release sheet"});
    if(review){
      const sha=review.text.match(/接班复核单 ([a-f0-9]{40})/)[1];
      const current=blocks.slice(blocks.indexOf(review)+1).filter(b=>b.type==="tool_result");
      if(!current.length)return tool("depot_shift_log",{});
      if(current.length===1)return tool("depot_trial",{sha});
      return [{type:"text",text:"已按值班采集复核该提交。"}];
    }
    switch(principal++){
      case 0:return tool("depot_directory",{});
      case 1:return tool("depot_trial",{sha:"0".repeat(40)});
      case 2:assert(last.includes("Current full candidate"));return tool("depot_trial",{sha:basis});
      case 3:assert(last.includes("DESK-21")&&last.includes("130"));return tool("depot_contact",{sha:basis,question:"请核对当前发车表。"});
      case 4:assert(last.includes("DUTY-2340")&&last.includes("121"));return bash("node -e \"const f=require('fs'),p=require('./shift-plan.json');p.acKw=[80,40,50,70];f.writeFileSync('shift-plan.json',JSON.stringify(p,null,2)+'\\n')\" && printf '%s\\n' 'DUTY-2340 晚班 23:40。旧表 B 为121，缺9 kWh。A 80/40，B 01:00 为50、01:30 为70 kW；90%到126/130，余量为零。85%两车停发。' > HANDOVER.md && git add HANDOVER.md shift-plan.json && git commit -qm 'Use late shift readings for dispatch' && git rev-parse HEAD");
      case 5:newSha=last.match(/[a-f0-9]{40}/)?.[0];assert(newSha);return tool("depot_contact",{sha:newSha,question:"请核对修后工作表。"});
      default:assert(last.includes("130"));return [{type:"text",text:"修订和交班稿已提交。"}];
    }
  };
}
