import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {git,readJson,writeJson} from "../energy/contract.mjs";

const root=resolve(process.argv[2]),matrix=readJson(join(root,"matrix.json"));
const rows=matrix.cases.map(c=>{
  const dir=join(root,c.domain+"-"+c.arm),r=readJson(join(dir,"result.json"));
  if(matrix.partial){
    const t=readJson(join(dir,"trajectory.json"));
    return {...c,submitted:r.submitted,confirmed:t.confirmed,total:t.total,knownUsage:t.usage,settled:t.settled,unknown:t.unknown,
      containerMs:t.containerMs,paired:t.paired,toolCalls:t.calls.length,conclusion:r.conclusion,gitHead:r.gitHead,clean:r.clean};
  }
  if(!c.accounted)return {...c,error:r.error,ledger:r.ledger};
  const t=readJson(join(dir,"trajectory.json"));
  if(process.argv[4]){
    const dest=resolve(process.argv[4]),store=mkdtempSync(join(tmpdir(),"pilot-diff-"));
    try{
      mkdirSync(dest,{recursive:true});git(store,"init","-q","--bare");git(store,"fetch","-q",join(dir,"submission.bundle"),"HEAD");
      const patch=execFileSync("git",["-C",store,"diff","--no-ext-diff","--no-textconv","--binary",c.basis,r.submission.selected],{maxBuffer:16*1024*1024});
      writeFileSync(join(dest,c.domain+"-"+c.arm+".patch"),patch);
    }finally{rmSync(store,{recursive:true,force:true});}
  }
  const roles=t.traces.map(trace=>{
    const bound=t.bindings.filter(b=>b.session===trace.session),usage={};
    for(const b of bound)for(const [key,value] of Object.entries(b.usage))usage[key]=(usage[key]??0)+value;
    const actions=trace.calls.filter(c=>/subagent|workflow|fleet_contact|palimpsest_|fleet_measure/.test(c.tool)).map(c=>({seq:c.seq,result:c.resultSeq,tool:c.tool,action:c.input?.action??c.input?.intent??null,refusal:c.refusal}));
    return {role:trace.role,session:trace.session,requests:bound.length,usage,toolCalls:trace.calls.length,paired:trace.calls.filter(c=>c.resultSeq!==null).length,actions};
  });
  const provider=readFileSync(join(dir,"out/REVIEW/request-observations.jsonl"),"utf8").trim().split("\n").map(JSON.parse).filter(o=>o.kind==="TERMINAL").map(o=>o.providerBilling);
  return {...c,candidate:r.submission.selected,commits:r.submission.commits,checks:r.submission.grade.checks,paths:r.submission.grade.paths,clean:r.submission.cleanWorld,
    conclusion:r.conclusion?.intent??null,roles,usage:t.usage,confirmed:t.confirmed,unknown:t.unknown,elapsedMs:t.elapsedMs,stop:r.execution.killedBy,
    provider:Object.fromEntries(["cost","listCost","allowance"].map(k=>[k,provider.every(b=>typeof b?.[k]==="number")?provider.reduce((sum,b)=>sum+b[k],0):null]))};
});
writeJson(resolve(process.argv[3]),{mode:matrix.mode,rows,...(matrix.partial?{notStarted:matrix.notStarted}:{})});
