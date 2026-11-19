import assert from "node:assert/strict";
import {originalSha} from "./case.mjs";
export function mockReply(arm,ticket){
  let step=0,sha,source=originalSha,amount=130;
  return (req,n)=>{
    const blocks=req.messages.filter(m=>m.role==="user").flatMap(m=>typeof m.content==="string"?[{type:"text",text:m.content}]:m.content);
    const intro=blocks.filter(b=>b.type==="text"&&b.text.includes("接班复核单 ")).at(-1);
    const result=blocks.filter(b=>b.type==="tool_result").at(-1)?.content;
    const text=typeof result==="string"?result:result?.[0]?.text??"";
    const tool=(name,input)=>[{type:"tool_use",name,input,id:"transfer_"+n}];
    const bash=command=>tool("bash",{command,description:"Prepare morning vehicle release"});
    if(intro)return tool("depot_trial",{sha:intro.text.match(/接班复核单 ([0-9a-f]{40})/)[1]});
    if(step++===0)return bash("cat operations/original-receipt.json operations/release-format.md");
    if(step===2){
      assert(text.includes("DUTY-2340"));
      return bash('node -e "const f=require(\'fs\'),p=require(\'./shift-plan.json\');p.acKw=[80,40,50,70];f.writeFileSync(\'shift-plan.json\',JSON.stringify(p,null,2))" && git add shift-plan.json && git commit -qm "Adjust B slots" && git rev-parse HEAD');
    }
    if(step===3){
      sha=text.match(/[0-9a-f]{40}/)[0];
      if(ticket==="controller")return tool("depot_contact",{sha,question:"请给出台架本表离场净电量。"});
    }
    if(step===4&&ticket==="controller"){
      const packet=JSON.parse(text);assert.equal(packet.receipt.sha,sha);
      amount=packet.receipt.departureKwh[1];source=sha;assert.equal(amount,124);
    }
    if(step===(ticket==="controller"?4:3)){
      const decision=amount>=130?"GO":"HOLD";
      const release={departureKwh:[126,amount],marginKwh:[0,amount-130],at90:{A:"GO",B:decision},at85:{A:"HOLD",B:"HOLD"},evidenceSha:source};
      const note="B 01:00/01:30=50/70 kW。按 "+source+"，90% A 126余0可放行，B "+amount+"余"+(amount-130)+" "+decision+"；85% 两车停发。";
      return bash("echo '"+JSON.stringify(release)+"' > release.json && echo '"+note+"' > HANDOVER.md && git add release.json HANDOVER.md && git commit -qm 'File vehicle release'");
    }
    if(arm==="P"&&step===(ticket==="controller"?5:4))return tool("palimpsest_work",{action:"conclude",intent:"DELIVER",statement:"已核对本班车辆放行依据并提交可执行班表、放行单和交班稿。",artifacts:["shift-plan.json","release.json","HANDOVER.md"]});
    return [{type:"text",text:"班表和逐车决定已提交。"}];
  };
}
