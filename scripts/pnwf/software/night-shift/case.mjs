import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {appendFileSync,copyFileSync,cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {createHash} from "node:crypto";

const repo=fileURLToPath(new URL("../../../../",import.meta.url));
const desk=fileURLToPath(new URL("./desk/",import.meta.url));
const catalog={inventory:"inventory.csv",ingress:"ingress.csv",terminal:"terminal.tsv",field:"field.txt",reservation:"reservation.txt"};
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const git=(world,...args)=>execFileSync("git",["-C",world,...args],{encoding:"utf8"}).trim();
const read=path=>readFileSync(path,"utf8");
const write=(path,data)=>writeFileSync(path,JSON.stringify(data,null,2)+"\n",{flag:"wx"});
const accepted="95b83e71ee9a37041b9918b5e8b797eebabf69c9";

export function prepare(root,variant) {
  assert(["redraw","suppressed"].includes(variant));
  mkdirSync(root);const world=join(root,"world");mkdirSync(world);
  git(world,"init","-q");
  const published=join(repo,"research-evidence/pnwf-software/2026-11-19");
  git(world,"fetch","-q",join(published,"autonomous-continuity/live/fleet.bundle"),"refs/heads/accepted");
  git(world,"checkout","-q","-b","rehearsal","FETCH_HEAD");
  assert.equal(git(world,"rev-parse","HEAD"),accepted);
  git(world,"config","user.name","Fleet rehearsal");git(world,"config","user.email","rehearsal@example.invalid");
  git(world,"config","core.autocrlf","false");
  cpSync(join(repo,"fixtures/psvr/fleet-night-shift"),world,{recursive:true});
  mkdirSync(join(world,"planning"));
  for(const file of ["plan.json","REVIEW.md"])copyFileSync(join(published,"fleet-rollout/live/rollout",file),join(world,"planning",file));
  git(world,"add","--all");
  execFileSync("git",["-C",world,"-c","commit.gpgsign=false","commit","-qm","Open simulated Fleet night shift"],{env:{...process.env,GIT_COMMITTER_DATE:"2026-11-19T00:00:00Z",GIT_AUTHOR_DATE:"2026-11-19T00:00:00Z"}});
  const basis=git(world,"rev-parse","HEAD");
  // Freeze the desk at initialization. Later source edits cannot change an open trial.
  const packets=join(root,"packets");mkdirSync(packets);
  const hashes={};
  for(const [topic,file] of Object.entries(catalog)){
    let body=read(join(desk,file)).replaceAll("\r\n","\n").trimEnd()+"\n";
    if(topic==="terminal")body+="22:03:17\tp17\tB\t40\treq-a\t"+(variant==="redraw"?"P":"S")+"\n\n"+read(join(desk,"format.txt")).trim()+"\n";
    writeFileSync(join(packets,file),body);hashes[topic]=sha256(body);
  }
  write(join(root,"seal.json"),{basis,variant,hashes});
  return {basis,world};
}

export function checkpoint(root,commit){
  const {basis}=JSON.parse(read(join(root,"seal.json"))),world=join(root,"world");
  assert(/^[0-9a-f]{40}$/.test(commit) && git(world,"rev-parse","HEAD")===commit && commit!==basis,"full current draft SHA required");
  assert.equal(git(world,"merge-base",basis,commit),basis);
  const files=git(world,"ls-tree","-r",commit,"--","handover");
  assert(files.split("\n").some(row=>/^100644 blob [0-9a-f]+\thandover\/.+\.md$/.test(row)&&git(world,"cat-file","-s",commit+":"+row.split("\t")[1])>0),"committed handover draft required");
  write(join(root,"checkpoint.json"),{basis,commit});
  return commit;
}

export function request(root,topic){
  assert(Object.hasOwn(catalog,topic),"unknown archive topic");
  assert(existsSync(join(root,"checkpoint.json")),"desk opens after the first assessment is archived");
  const {commit}=JSON.parse(read(join(root,"checkpoint.json")));
  const bytes=readFileSync(join(root,"packets",catalog[topic]));
  const digest=sha256(bytes);
  assert.equal(digest,JSON.parse(read(join(root,"seal.json"))).hashes[topic]);
  appendFileSync(join(root,"requests.jsonl"),JSON.stringify({topic,commit,digest,at:new Date().toISOString()})+"\n");
  return bytes.toString("utf8");
}

export function rehearse(root,commit){
  const world=join(root,"world");
  const {commit:draft}=JSON.parse(read(join(root,"checkpoint.json")));
  assert(/^[0-9a-f]{40}$/.test(commit) && git(world,"rev-parse","HEAD")===commit && git(world,"merge-base",draft,commit)===draft,"current proposal SHA required");
  const path="handover/proposal.json";
  assert(git(world,"ls-tree",commit,"--",path).startsWith("100644 blob "),"regular proposal file required");
  const proposal=JSON.parse(git(world,"show",commit+":"+path));
  assert(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(proposal.startUtc));
  for(const site of ["birch","cedar"])assert(["observe","park","overflow"].includes(proposal[site]));
  const booked=proposal.startUtc>="06:00" && proposal.startUtc<"06:30";
  const reasons=[];
  if(booked && proposal.birch==="overflow")reasons.push("CAP-08 reserves the lane for Cedar at this time");
  if(proposal.birch==="overflow" && proposal.cedar==="overflow")reasons.push("two sites request the only lane");
  const result={commit,proposalBlob:git(world,"rev-parse",commit+":"+path),booking:reasons.length?"conflict":"feasible",reasons,productionApproval:"unissued"};
  appendFileSync(join(root,"rehearsals.jsonl"),JSON.stringify(result)+"\n");
  return result;
}

if(import.meta.main){
  const {values:v}=parseArgs({options:Object.fromEntries(["action","root","variant","sha","topic"].map(k=>[k,{type:"string"}]))});
  const root=resolve(v.root);
  if(v.action==="prepare")console.log(JSON.stringify(prepare(root,v.variant)));
  else if(v.action==="checkpoint")console.log(checkpoint(root,v.sha));
  else if(v.action==="request")process.stdout.write(request(root,v.topic));
  else if(v.action==="rehearse")console.log(JSON.stringify(rehearse(root,v.sha)));
  else throw Error("Choose prepare, checkpoint, request or rehearse");
}
