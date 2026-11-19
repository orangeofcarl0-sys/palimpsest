import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {changed,configureGit,git,head} from "../energy/contract.mjs";

export const accepted="bfe377abf16649f977cafa49a7494a820f38dd60";
export const source="updates/2026-11-19/hf-freight-amendment.md";
export const notice=`# Carrier amendment HF-LM-19, 19 November 2026

For the pending deployment quote, a K-900 consignment delivered to Harbor Flats incurs a USD 7,500 last-mile supplement in addition to the carrier's existing quoted freight. Assess once per Harbor Flats consignment. North Ridge deliveries retain the original quoted freight. Unit prices, transit times, technical terms and certificate validity remain as quoted. Approval authority remains with the procurement owner.
`;
export const goal="Prepare a committed revision of the two-site procurement decision package for the owner's review using the new carrier amendment. Reconcile the site lines and project total, explain the quote assumption that changed in the risk review, and cite the amendment in the recommendation. Retain the package's existing data fields, source records and unaffected deliverables. No purchase is authorized.";
const bundle=fileURLToPath(new URL("../../../research-evidence/pnwf-work-revision/2026-11-10/live-t2-202113/energy/candidate-and-accepted.bundle",import.meta.url));
export function prepareEnergy(world){
  mkdirSync(world,{recursive:true});git(world,"init","-q");configureGit(world);
  git(world,"fetch","-q",bundle,"refs/heads/accepted");git(world,"checkout","-qb","review",accepted);
  mkdirSync(join(world,"updates/2026-11-19"));writeFileSync(join(world,source),notice);
  git(world,"add",source);const date="2026-11-19T00:00:00Z";
  execFileSync("git",["-C",world,"commit","-qm","Record Harbor Flats carrier amendment"],{env:{...process.env,GIT_AUTHOR_DATE:date,GIT_COMMITTER_DATE:date}});
  rmSync(join(world,".git/FETCH_HEAD"));return head(world);
}
export const stable=["technical-capacity.md","schedule.md","vendor-compliance.md"].map(f=>"deliverables/"+f);
export function energyGrade(world,basis,sha){
  const read=f=>git(world,"show",sha+":deliverables/"+f);
  const paths=changed(world,basis,sha);
  const checked=(fn)=>{try{return !!fn()}catch{return false}};
  let cost={},rec="",risk="";
  try{cost=JSON.parse(read("cost-model.json"))}catch{}
  try{rec=read("recommendation.md")}catch{}try{risk=read("risk-review.md")}catch{}
  const data=()=>JSON.parse(rec.match(/<!-- data:start -->\s*```json\s*([\s\S]*?)\s*```/i)[1]);
  const lines=cost.lines??[],site=(name,freight)=>checked(()=>lines.some(l=>l.site===name&&l.model==="K-900"&&l.unitPrice===250000&&l.lineTotal===250000+freight&&(l.freight===freight||(name==="Harbor Flats"&&l.freight===18000&&Object.entries(l).some(([k,v])=>/supplement|surcharge|last.?mile|add.?on/i.test(k)&&v===7500)))));
  const checks={north:site("North Ridge",18000),harbor:site("Harbor Flats",25500),total:cost.total===543500&&lines.length===2,
    recommendation:checked(()=>data().north==="K-900"&&data().harbor==="K-900"&&data().totalUsd===543500&&data().corridorMm===1250),
    readerTotal:/543,500|543500/.test(rec.split("<!-- data:start")[0]),citation:rec.includes(source)||rec.includes("HF-LM-19"),
    risk:paths.includes("deliverables/risk-review.md")&&/7,?500|25,?500/.test(risk)&&/Harbor Flats/i.test(risk),
    preserved:stable.every(p=>!paths.includes(p)),sources:paths.every(p=>!p.startsWith("sources/")&&!p.startsWith("updates/"))};
  return {checks,passed:Object.values(checks).every(Boolean),paths};
}
