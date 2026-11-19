import assert from "node:assert/strict";
import {appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {commit, git} from "../transit-desk/run.mjs";
import {configureGit, digest, readJson, writeJson} from "../energy/contract.mjs";
import {collect,replay} from "./rig.mjs";

export const here = fileURLToPath(new URL("./",import.meta.url));
export const prior = fileURLToPath(new URL("../../../research-evidence/pnwf-task-selection/2026-11-19/transit-desk-live/",import.meta.url));
export const previous = "20a84d3084ea70ce5d6167a14cffe15e70bc929d";
export const maintainer = readJson(join(prior,"depot-charge-P/trajectory.json")).traces[0].session;
export const streamPath = "sessions/--run-stage-world--/" + maintainer + "/session.v4.jsonl.zstd";
export const history = join(prior,"depot-charge-P/runtime-REVIEW",streamPath);
export const goal = "请为河湾车队明早两辆车签发一份可执行的冷夜调度交班稿。依据本班可用的运行记录核查现行班表，必要时修订，给出逐格设定、离场余量和低效率时的放行决定，把可执行排班和交班稿一起提交。";
const sheet = "shift-plan.json", capture = "operations/cold-cycle.json";
const samples = collect();
export function prepare(world) {
  mkdirSync(world,{recursive:true});
  git(world,"init","-q"); configureGit(world,{name:"Transit Desk Fixture",email:"fixture@example.invalid"});
  git(world,"fetch","-q",join(prior,"depot-charge-P/world.bundle"),"refs/heads/observed");
  git(world,"checkout","-qb","shift",previous);
  assert.equal(git(world,"rev-parse","HEAD").trim(),previous);
  mkdirSync(join(world,"operations"));
  writeJson(join(world,sheet),{slotStart:["00:00","00:30","01:00","01:30"],bus:["A","A","B","B"],acKw:[80,40,70,50],loadShiftKw:20,dispatchAt85:false});
  writeJson(join(world,capture),{device:"RIVER-SIM-1",run:"COLD-17",mode:"cold, approved building transfer engaged",samples});
  writeFileSync(join(world,"TASK.md"),goal+"\n");
  writeFileSync(join(world,"operations/desk.md"),"本班使用 shift-plan.json 的四个 AC 设定，按顺序对应 00:00、00:30、01:00、01:30，车辆 A/A/B/B；已预约负荷平移 20 kW。dispatchAt85 为效率 85% 的双车放行标志。HANDOVER.md 是给值班员的现行说明。night.json、模型和原测试为名义设计基线。COLD-17 是独立模拟站控器在相同平移条件下、各格以 80 kW 请求执行的稳态试验。文件含充电支路 AC 电表的起止度数和楼宇负荷，非真实车辆遥测。本地 node operations/retest.mjs 可重放工作表。调度台目录也登记采集和上一班联系人。\n");
  writeFileSync(join(world,"operations/retest.mjs"),`import fs from "node:fs";
const read = p => JSON.parse(fs.readFileSync(p));
const plan = read("shift-plan.json"), field = read("operations/cold-cycle.json");
const limits = field.samples.map(s => (s.acMeterEndKwh - s.acMeterStartKwh) * 60 / s.minutes);
const applied = limits.map((cap,i) => Math.min(cap,plan.acKw[i]));
console.log(JSON.stringify({run:field.run,requested:plan.acKw,limits,applied,departureKwh:[72+.45*(applied[0]+applied[1]),76+.45*(applied[2]+applied[3])]}));
`);
  appendFileSync(join(world,"README.md"),"\n本班放行工单见 TASK.md；当前可执行表、站控记录与值班入口见 operations/desk.md。\n");
  return commit(world,"Open cold-night release desk with metered test-stand acquisition");
}
export function measure(world,sha) {
  assert(/^[a-f0-9]{40}$/.test(sha));
  const raw=git(world,"show",sha+":"+sheet);
  return {sha,sheetBlob:git(world,"rev-parse",sha+":"+sheet).trim(),run:"COLD-17",captureDigest:digest(JSON.stringify(samples)),
    ...replay(JSON.parse(raw),samples)};
}
export function grade(world,basis,sha) {
  const paths=git(world,"diff","--name-only",basis,sha).trim().split("\n").filter(Boolean);
  const protectedFiles=git(world,"ls-tree","-r","--name-only",basis).trim().split("\n").filter(p=>![sheet,"HANDOVER.md"].includes(p));
  let plan={},observed=null;
  try{plan=JSON.parse(git(world,"show",sha+":"+sheet));observed=measure(world,sha);}catch{}
  const doc=git(world,"ls-tree",sha,"--","HANDOVER.md").startsWith("100")?git(world,"show",sha+":HANDOVER.md"):"";
  const checks={commit:sha!==basis,originalInputs:protectedFiles.every(p=>!paths.includes(p)),
    transfer:plan.loadShiftKw===20,assignment:JSON.stringify(plan.bus)==='["A","A","B","B"]' && JSON.stringify(plan.slotStart)==='["00:00","00:30","01:00","01:30"]',
    firstBus:plan.acKw?.[0]===80&&plan.acKw?.[1]===40,thirdSlot:plan.acKw?.[2]===60,fourthSlot:plan.acKw?.[3]===60,
    fieldFeasible:observed?.withinLimits===true&&observed.departureKwh[0]>=126&&observed.departureKwh[1]>=130,
    lowEfficiency:plan.dispatchAt85===false,updatedHandover:paths.includes("HANDOVER.md")&&doc.trim().length>0};
  return {sha,paths,checks,passed:Object.values(checks).every(Boolean),observed};
}
export function profile(home,slip) {
  const dir=join(home,"profiles/node_modules/depot-shift-desk");
  cpSync(join(here,"plugin"),dir,{recursive:true});
  writeJson(join(dir,"desk.json"),{maintainer:!!slip,slip,directory:{shift:"河湾上一班调度模型维护者",session:maintainer,authored:previous,
    capture,localReplay:"node operations/retest.mjs",desk:"depot_trial / depot_contact"}});
  appendFileSync(join(home,"profiles/alhs-core/cordis.patch.yml"),"\n- insert:\n    - id: depot-shift-desk\n      name: depot-shift-desk\n");
}
