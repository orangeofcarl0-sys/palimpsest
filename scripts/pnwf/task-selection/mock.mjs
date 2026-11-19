import assert from "node:assert/strict";
import {mockReply} from "../software/night-isolated/mock.mjs";
import {source} from "./energy.mjs";

const task="Check the carrier amendment against both accepted cost lines. Write the affected site and supplement to /tmp/route-energy-check as JSON.";
const inspect=`const f=require("fs");const note=f.readFileSync("${source}","utf8"),cost=require("./deliverables/cost-model.json");
const site=cost.lines.find(l=>note.includes(l.site)&&l.site==="Harbor Flats");const supplement=Number(note.match(/USD ([\\d,]+)/)[1].replaceAll(",",""));f.writeFileSync("/tmp/route-energy-check",JSON.stringify({site:site.site,supplement}));`;
const revise=`const f=require("fs"),base="deliverables/",finding=JSON.parse(f.readFileSync("/tmp/route-energy-check"));
const cost=JSON.parse(f.readFileSync(base+"cost-model.json")),line=cost.lines.find(l=>l.site===finding.site);line.freight+=finding.supplement;line.lineTotal=line.unitPrice+line.freight;cost.total=cost.lines.reduce((v,l)=>v+l.lineTotal,0);f.writeFileSync(base+"cost-model.json",JSON.stringify(cost,null,2)+"\\n");
let rec=f.readFileSync(base+"recommendation.md","utf8").replaceAll("536,000","543,500").replace("268,000 at Harbor","275,500 at Harbor").replace("18,000 freight = USD 268,000","25,500 freight = USD 275,500").replace('"totalUsd": 536000','"totalUsd": 543500').replace('"sources/quotes.csv",','"${source}",\\n    "sources/quotes.csv",');f.writeFileSync(base+"recommendation.md",rec);
let risk=f.readFileSync(base+"risk-review.md","utf8").replace("any change to the K-900 price or freight applies to both lines","the USD 7,500 Harbor Flats supplement applies to its consignment only");risk=risk.replaceAll("site-specific logistics are not","other site-specific logistics are not").replace("and any site-specific logistics","and other site-specific logistics");f.writeFileSync(base+"risk-review.md",risk);`;
const shell=js=>"node -e '"+js.replaceAll("'","'\\''")+"'";
export function scenarioMock(domain){
  if(domain==="software")return mockReply(false);
  let parent=0,child=0;
  return async(req,n)=>{
    const blocks=req.messages.filter(m=>m.role==="user").flatMap(m=>typeof m.content==="string"?[{type:"text",text:m.content}]:m.content);
    const use=(name,input)=>[{type:"tool_use",id:"pilot_"+n,name,input}];
    const bash=command=>use("bash",{command,description:"Reconcile the procurement revision"});
    if(blocks.some(b=>b.type==="text"&&b.text.includes(task))){
      if(!child++)return bash(shell(inspect));
      return [{type:"text",text:"Checked the Harbor Flats supplement against the accepted site lines."}];
    }
    switch(parent++){
      case 0:return use("subagent",{description:"Check freight",prompt:task});
      case 1:return bash("for i in $(seq 1 50); do test -s /tmp/route-energy-check && break; sleep 1; done; cat /tmp/route-energy-check");
      case 2:assert(JSON.stringify(blocks.filter(b=>b.type==="tool_result").at(-1)).includes("7500"));return bash(shell(revise)+" && git add deliverables && git commit -qm 'Revise Harbor Flats freight estimate'");
      default:return [{type:"text",text:"The revised procurement decision package is committed for review."}];
    }
  };
}
