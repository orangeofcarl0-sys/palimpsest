import assert from "node:assert/strict";
import {existsSync,readFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {join,resolve} from "node:path";
import {readJson,writeJson} from "./energy/contract.mjs";
import {readStream} from "./analyze_energy_trajectory.mjs";

const dir=resolve(process.argv[2]),matrix=readJson(join(dir,"matrix.json"));
const cases=matrix.cases.map(({label})=>{
  const base=join(dir,label),r=readJson(join(base,"result.json")),m=readJson(join(base,"manifest.json"));
  const timelines=readdirSync(join(base,"out/NIGHT/attribution")).filter(p=>p.endsWith(".json")).map(p=>readJson(join(base,"out/NIGHT/attribution",p)).summary);
  const traces=Object.entries(m).filter(([p])=>p.endsWith(".zstd")).map(([p,h])=>{
    const events=readStream(join(base,p),h),meta=events[0],timeline=timelines.find(t=>t.session.id===meta.id);
    const bySeq=new Map(events.map(e=>[e.seq,e])),receipts=new Map(timeline.results.map(row=>[row.callId,row]));
    const calls=timeline.calls.map(c=>{
      const paired=receipts.get(c.callId),e=bySeq.get(c.seq),res=bySeq.get(paired?.seq);
      let args=e.data.arguments??{};
      if(typeof args==="string"){
        try{args=JSON.parse(args);}catch{args={unparsed:args};}
      }
      const op=e.data.name;
      const row={seq:c.seq,id:c.callId,tool:op,resultSeq:paired?.seq??null,offsetMs:c.offsetMs};
      if(paired)assert.equal(paired.callSeq,c.seq,"Call ID was reused within a trace");
      if(op==="fleet_desk"){
        Object.assign(row,args);
        try{const out=JSON.parse(res.data.message.content[0].text);Object.assign(row,{ok:out.ok,booking:out.booking,commit:out.commit,reason:out.reason});}catch{/* unconfirmed reply stays unclassified */}
      }else if(/^(?:subagent|workflow|job_output|palimpsest_)/.test(op)){
        row.input=args;
        row.reply=res?.data?.message?.content?.filter(b=>b.type==="text").map(b=>b.text).join("\n").slice(0,1800);
      }else if(["edit","write","read"].includes(op))row.path=args.file_path??args.path;
      else if(op==="bash")row.command=args.command?.slice(0,220);
      return row;
    });
    const tools=events.find(e=>e.type==="request/header")?.data.header.tools.map(t=>t.name)??[];
    return {id:meta.id,parent:meta.parentSession??null,role:r.evidence.traces.find(t=>t.id===meta.id).role,
      collaborationTools:tools.filter(name=>/^(?:subagent|workflow)/.test(name)),calls,counts:timeline.counts};
  });
  const last=r.bookings?.at(-1);
  const proposalPath=join(base,"final/handover/proposal.json");
  const bytes=existsSync(proposalPath)?readFileSync(proposalPath):null;
  const finalProposalBlob=bytes?createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex"):null;
  return {label,basis:r.basis,draft:r.draft,head:r.head,changed:r.changed,children:r.children,natural:r.execution.natural,
    requests:r.evidence.requests,unknown:r.accounting.unresolvedRequests,tokens:r.evidence.totalTokens,usage:r.evidence.usage,usageByRole:r.evidence.usageByRole,elapsedMs:r.evidence.elapsedMs,
    bookingCount:r.bookings?.length,lastBooking:last??null,receiptMatchesFinalHead:Boolean(last&&last.commit===r.head),
    finalProposalBlob,receiptMatchesProposalBlob:Boolean(last&&last.proposalBlob===finalProposalBlob),traces};
});
assert.equal(new Set(cases.map(c=>c.basis)).size,1);
const write=resolve(process.argv[3]);writeJson(write,{mode:matrix.mode,cases});
console.log(cases.map(({label,children,requests,tokens,natural,receiptMatchesFinalHead})=>({label,children:children?.length,requests,tokens,natural,receiptMatchesFinalHead})));
