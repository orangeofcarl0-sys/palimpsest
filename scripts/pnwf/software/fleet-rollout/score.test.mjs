import assert from "node:assert/strict";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {evaluate,readInputs} from "./score.mjs";

const fixture=fileURLToPath(new URL("../../../../fixtures/psvr/fleet-rollout/",import.meta.url));
const plan=()=>({siteUnits:{Alder:5,Birch:4,Cedar:4,Dune:3},windows:{
  W1:{grpc:["Alder","Birch"],rest:["Cedar","Dune"],used:9,available:10,priority:20},
  W2:{grpc:["Birch","Cedar"],rest:["Alder","Dune"],used:8,available:8,priority:17}
}});
test("cross-source allocation and retained REST fallback",()=>evaluate(plan(),readInputs(fixture)));
test("highest single priority can lose the total objective",()=>{
  const p=plan();p.windows.W2={grpc:["Alder"],rest:["Dune","Birch","Cedar"],used:5,available:8,priority:11};
  assert.throws(()=>evaluate(p,readInputs(fixture)),/optimality/);
});
test("discarding the backup reservation changes the optimum",()=>{
  const s=readInputs(fixture);s["change-orders.json"].orders=s["change-orders.json"].orders.filter(o=>o.id!=="NET-31");
  const p=plan();p.windows.W2.available=10;
  assert.throws(()=>evaluate(p,s),/optimality/);
  p.windows.W2=p.windows.W1;evaluate(p,s);
});
test("a planned upgrade becomes eligible only after the superseding delay expires",()=>{
  const s=readInputs(fixture);s["change-orders.json"].orders=s["change-orders.json"].orders.filter(o=>o.id!=="OPS-17");
  const p=plan();assert.throws(()=>evaluate(p,s),/optimality/);
  p.windows.W2={grpc:["Alder","Dune"],rest:["Birch","Cedar"],used:8,available:8,priority:26};evaluate(p,s);
});
test("passing omitted alone does not qualify Dune",()=>{
  const p=plan();p.windows.W2={grpc:["Alder","Dune"],rest:["Birch","Cedar"],used:8,available:8,priority:26};
  assert.throws(()=>evaluate(p,readInputs(fixture)),/compatibility/);
});
test("duplicate sites and misreported capacity are rejected",()=>{
  let p=plan();p.windows.W1.rest=["Cedar","Alder"];assert.throws(()=>evaluate(p,readInputs(fixture)),/partition/);
  p=plan();p.windows.W1.used=8;assert.throws(()=>evaluate(p,readInputs(fixture)),/actual use/);
});
