import assert from "node:assert/strict";

const reviews = [
  {id:"clients",question:"Check deployed client compatibility for both windows using the replay and change orders.",
    compute:"const {sites}=get('registry.json'),replay=get('replay.json'),orders=get('change-orders.json').orders; const result=Object.keys(sites).filter(site=>['zero','omitted'].every(limit=>replay.observations.some(r=>r.build===sites[site].build&&r.limit===limit&&r.decoded===3))); if(!orders.some(o=>o.id==='OPS-17'&&o.effective==='after W2'))throw Error('recheck deployment');"},
  {id:"network",question:"Compute the shared capacity available in each window from the network reservation records.",
    compute:"const result=get('egress.json').grossUnits; for(const order of get('change-orders.json').orders)if(order.window)result[order.window]-=order.reservedUnits;"},
  {id:"dispatch",question:"Calculate the site costs and priority values for dispatch from traffic and the registry.",
    compute:"const sites=get('registry.json').sites; const result={}; for(const line of fs.readFileSync('fleet/traffic.csv','utf8').trim().split(/\\r?\\n/).slice(1)){const [site,a,b]=line.split(',');result[site]={units:Math.ceil(Math.max(+a,+b)*get('egress.json').headroomFactor),priority:sites[site].priority};}"}
];
const shell = command=>({name:"bash",input:{command,description:"Verify Fleet inputs"}});
const quote = value=>"'"+value.replaceAll("'","'\\''")+"'";
const node = code=>"node -e "+quote(code);
const prefix="const fs=require('fs');const get=name=>JSON.parse(fs.readFileSync('fleet/'+name));";
const synthesis = `const evidence=id=>JSON.parse(fs.readFileSync('.palimpsest/'+id+'.json'));
const clients=evidence('clients'),net=evidence('network'),dispatch=evidence('dispatch');
const windows={};for(const [w,available] of Object.entries(net)){
  let best={grpc:[],used:0,priority:0};
  for(let mask=1;mask<2**clients.length;mask++){
    const grpc=clients.filter((_,i)=>mask&(1<<i));
    const used=grpc.reduce((n,s)=>n+dispatch[s].units,0),priority=grpc.reduce((n,s)=>n+dispatch[s].priority,0);
    if(used<=available&&priority>best.priority)best={grpc,used,priority};
  }
  windows[w]={...best,available,rest:Object.keys(dispatch).filter(s=>!best.grpc.includes(s))};
}
fs.mkdirSync('rollout',{recursive:true});
fs.writeFileSync('rollout/plan.json',JSON.stringify({windows,siteUnits:Object.fromEntries(Object.entries(dispatch).map(([s,v])=>[s,v.units]))},null,2));
fs.writeFileSync('rollout/REVIEW.md','Use REST on rollback. registry.json and replay.json show Dune R1 cannot consume explicit zero; OPS-17 in change-orders.json defers its upgrade. traffic.csv and egress.json set the site reservations. NET-31 reduces W2 capacity. '+Object.entries(windows).map(([w,r])=>w+' selects '+r.grpc.join('+')+' for priority '+r.priority+' using '+r.used+'/'+r.available).join('; '));`;

export function mockProvider(prompt) {
  let step=0, contribution;
  const childSteps=new Set();
  return async (request,ordinal)=>{
    const blocks=request.messages.filter(m=>m.role==="user").flatMap(m=>typeof m.content==="string"?[{type:"text",text:m.content}]:m.content);
    const text=blocks.filter(b=>b.type==="text").map(b=>b.text).join("\n");
    const last=JSON.stringify(blocks.filter(b=>b.type==="tool_result").at(-1)?.content??"");
    const child=!text.includes(prompt) && reviews.find(r=>text.includes(r.question));
    const call = (name,input)=>[{type:"tool_use",id:"fleet_"+ordinal,name,input}];
    const invoke = t=>call(t.name,t.input);
    if(child) {
      if(childSteps.has(child.id))return [{type:"text",text:child.id+" measured "+last}];
      childSteps.add(child.id);
      return invoke(shell(node(prefix+child.compute+"fs.mkdirSync('.palimpsest',{recursive:true});fs.writeFileSync('.palimpsest/"+child.id+".json',JSON.stringify(result));console.log(JSON.stringify(result));")));
    }
    const i=step++;
    if(i<12) {
      const r=reviews[Math.floor(i/4)];
      switch(i%4){
        case 0:return call("subagent",{description:r.id,prompt:r.question});
        case 1:return invoke(shell("for n in $(seq 1 25); do test -s .palimpsest/"+r.id+".json && break; sleep 1; done; cat .palimpsest/"+r.id+".json"));
        case 2:assert(!last.includes("No such file"));return call("palimpsest_contribute",{action:"record",sourceKind:"NATIVE_SUBAGENT",sourceRef:r.id,task:r.question,finding:r.id+" measured "+last,artifacts:["rollout/plan.json"]});
        case 3:contribution=last.match(/ctb-[0-9a-f]{32}/)?.[0];assert(contribution);return call("palimpsest_contribute",{action:"decide",contributionId:contribution,decision:"ACCEPT_AS_CANDIDATE",decisionNote:"Use "+r.id+" measurement in window allocation"});
      }
    }
    if(i===12)return invoke(shell(node(prefix+synthesis)+" && git add rollout && git commit -m 'Combine Fleet window findings'"));
    return [{type:"text",text:"Fleet release review submitted."}];
  };
}
