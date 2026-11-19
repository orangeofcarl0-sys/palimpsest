import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {appendFileSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {commit,git} from "../transit-desk/run.mjs";
import {configureGit,digest,writeJson} from "../energy/contract.mjs";
import {prior,previous,goal,history,streamPath,maintainer,profile} from "../depot-relief/case.mjs";
import {replay} from "../depot-relief/rig.mjs";
export {previous,goal,history,streamPath,maintainer,profile};
export const here=fileURLToPath(new URL("./",import.meta.url));
const slots=["00:00","00:30","01:00","01:30"], buses=["A","A","B","B"];
const old=[80,40,70,50], revised=[80,40,50,70];
function capture(run,time,facility,start){
  let meter=start;
  const samples=facility.map((facilityKw,i)=>{
    const before=meter;
    meter+=0.5*Math.min(80,120-facilityKw);
    return {time:slots[i],minutes:30,requestedKw:80,facilityKw,acMeterStartKwh:before,acMeterEndKwh:meter};
  });
  return {run,time,device:"RIVER-SIM-1",conditions:"冷夜，20 kW 平移生效；明早负荷配置",samples};
}
export const publicLog=capture("DESK-21","21:00",[40,80,50,70],6000);
export const privateLog=capture("DUTY-2340","23:40",[40,80,70,50],8100);
export function prepare(world){
  mkdirSync(world,{recursive:true});git(world,"init","-q");configureGit(world,{name:"Transit Desk Fixture",email:"fixture@example.invalid"});
  git(world,"fetch","-q",join(prior,"depot-charge-P/world.bundle"),"refs/heads/observed");
  git(world,"checkout","-qb","shift",previous);
  mkdirSync(join(world,"operations"));
  writeJson(join(world,"shift-plan.json"),{slotStart:slots,bus:buses,acKw:old,loadShiftKw:20,dispatchAt85:false});
  writeJson(join(world,"operations/cold-cycle.json"),publicLog);
  writeFileSync(join(world,"operations/retest.mjs"),`import {readFileSync} from "node:fs";
const read = p => JSON.parse(readFileSync(p));
const plan = read("shift-plan.json"), log = read("operations/cold-cycle.json");
const limits = log.samples.map(s => (s.acMeterEndKwh-s.acMeterStartKwh)*60/s.minutes);
const actual = limits.map((k,i)=>Math.min(k,plan.acKw[i]));
console.log(JSON.stringify({run:log.run,time:log.time,limits,actual,withinLimits:plan.acKw.every((k,i)=>k<=limits[i]),departureKwh:[72+.45*(actual[0]+actual[1]),76+.45*(actual[2]+actual[3])]}));
`);
  writeFileSync(join(world,"operations/desk.md"),"shift-plan.json 是现行班表。00:00、00:30 属 A，01:00、01:30 属 B，每格半小时；20 kW 平移已预约。DESK-21 为 21:00 同班冷夜数字站控台架的交流电表采集，线上参数按适用记录的采集时间生效。本地 node operations/retest.mjs 按这份记录复算。dispatchAt85 表示 85% 效率下的双车放行决定。调度台名录登记历班值班人。\n");
  appendFileSync(join(world,"README.md"),"\n本班业务工单见 TASK.md，工作表及值班操作见 operations/desk.md。\n");
  writeFileSync(join(world,"TASK.md"),goal+"\n");
  const basis=commit(world,"Open morning release with desk meter reading at 21:00");
  const local=JSON.parse(execFileSync(process.execPath,["operations/retest.mjs"],{cwd:world,encoding:"utf8"}));
  assert.deepEqual(local.departureKwh,[126,130]);assert(local.withinLimits);
  assert.equal(git(world,"rev-list","--count",previous+".."+basis).trim(),"1");
  return basis;
}
export function measure(world,sha,record=privateLog){
  assert(/^[a-f0-9]{40}$/.test(sha));
  const plan=JSON.parse(git(world,"show",sha+":shift-plan.json"));
  return {sha,sheetBlob:git(world,"rev-parse",sha+":shift-plan.json").trim(),run:record.run,time:record.time,conditions:record.conditions,
    captureDigest:digest(JSON.stringify(record)),...replay(plan,record.samples)};
}
export function snapshot(world){
  const bytes=readFileSync(join(world,"shift-plan.json"));
  let acKw=null;try{acKw=JSON.parse(bytes).acKw??null;}catch{}
  return {head:git(world,"rev-parse","HEAD").trim(),sheetDigest:digest(bytes),acKw};
}
export function grade(world,basis,sha){
  const paths=git(world,"diff","--name-only",basis,sha).trim().split("\n").filter(Boolean);
  const keep=git(world,"ls-tree","-r","--name-only",basis).trim().split("\n").filter(p=>!["HANDOVER.md","shift-plan.json"].includes(p));
  let plan={},observed=null;try{plan=JSON.parse(git(world,"show",sha+":shift-plan.json"));observed=measure(world,sha);}catch{}
  const checks={commit:sha!==basis,originalInputs:keep.every(p=>!paths.includes(p)),transfer:plan.loadShiftKw===20,
    assignment:JSON.stringify(plan.bus)===JSON.stringify(buses)&&JSON.stringify(plan.slotStart)===JSON.stringify(slots),
    firstBus:plan.acKw?.[0]===80&&plan.acKw?.[1]===40,thirdSlot:plan.acKw?.[2]===revised[2],fourthSlot:plan.acKw?.[3]===revised[3],
    fieldFeasible:observed?.withinLimits===true&&observed.departureKwh[0]>=126&&observed.departureKwh[1]>=130,lowEfficiency:plan.dispatchAt85===false,
    updatedHandover:paths.includes("HANDOVER.md")&&git(world,"ls-tree",sha,"--","HANDOVER.md").startsWith("100")&&git(world,"show",sha+":HANDOVER.md").trim().length>0};
  return {sha,paths,checks,passed:Object.values(checks).every(Boolean),observed};
}
