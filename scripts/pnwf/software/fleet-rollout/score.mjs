import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changed, git } from "../../energy/contract.mjs";

export const inputs = ["BRIEF.md","registry.json","replay.json","traffic.csv","egress.json","change-orders.json"];
export const outputs = ["rollout/REVIEW.md","rollout/plan.json"];
export function readInputs(root) {
  const read = path => readFileSync(join(root,path),"utf8");
  return Object.fromEntries(inputs.map(path => [path,path.endsWith(".json") ? JSON.parse(read(path)) : read(path)]));
}

// Score all feasible allocations. Equal optima are valid.
export function evaluate(plan, sources) {
  const sites = sources["registry.json"].sites;
  const names = Object.keys(sites).sort();
  const replay = sources["replay.json"];
  const network = sources["egress.json"];
  const orders = sources["change-orders.json"].orders;
  const costs = Object.fromEntries(sources["traffic.csv"].trim().split(/\r?\n/).slice(1).map(line => {
    const [site,...peaks] = line.split(",");
    return [site,Math.ceil(Math.max(...peaks.map(Number))*network.headroomFactor)];
  }));
  assert.deepEqual(plan.siteUnits,costs,"site capacity reservations");
  assert.deepEqual(Object.keys(plan.windows).sort(),["W1","W2"]);
  for (const window of ["W1","W2"]) {
    const available = network.grossUnits[window] - orders.filter(o=>o.window===window).reduce((n,o)=>n+o.reservedUnits,0);
    const eligible = names.filter(site => {
      const planned = sources["registry.json"].planned.find(p=>p.site===site && p.after==="W1" && window==="W2");
      const deferred = orders.some(o=>o.site===site && o.effective==="after W2");
      const build = planned && !deferred ? planned.build : sites[site].build;
      return ["zero","omitted"].every(limit => replay.observations.some(r=>r.build===build && r.limit===limit && r.decoded===replay.requiredReadings));
    });
    const sum = (set,value) => set.reduce((n,site)=>n+value(site),0);
    const weight = set => sum(set,site=>sites[site].priority);
    const units = set => sum(set,site=>costs[site]);
    const options = eligible.reduce((sets,site)=>sets.concat(sets.map(set=>[...set,site])),[[]]);
    const best = Math.max(...options.filter(set=>units(set)<=available).map(weight));
    const row = plan.windows[window];
    assert.deepEqual([...row.grpc,...row.rest].sort(),names,window+" partition");
    assert(row.grpc.every(site=>eligible.includes(site)),window+" client compatibility");
    assert.equal(row.available,available,window+" net capacity");
    assert.equal(row.used,units(row.grpc),window+" actual use");
    assert(row.used<=available,window+" shared reservation");
    assert.equal(row.priority,weight(row.grpc),window+" score");
    assert.equal(row.priority,best,window+" optimality");
  }
}

export function assess(world,basis,candidate,fixture) {
  assert.equal(git(world,"merge-base",basis,candidate),basis);
  assert.deepEqual(changed(world,basis,candidate).sort(),outputs);
  const content = path => {
    assert(git(world,"ls-tree",candidate,"--",path).startsWith("100644 blob "));
    return execFileSync("git",["-C",world,"show",candidate+":"+path],{encoding:"utf8"});
  };
  const plan = JSON.parse(content(outputs[1]));
  evaluate(plan,readInputs(fixture));
  const review = content(outputs[0]);
  for (const ref of [...inputs.filter(f=>f!=="BRIEF.md"),"NET-31","OPS-17","REST","W1","W2"]) assert(review.includes(ref),"review missing "+ref);
  return {plan,review,checks:["scope","partition","compatibility","capacity","optimality","source references"]};
}
