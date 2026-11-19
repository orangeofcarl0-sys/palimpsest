import assert from "node:assert/strict";
import {appendFileSync,cpSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {archive,basis,previous,maintainer,recordRef,prepare} from "../night-review/fixture.mjs";
import {digest,git,writeJson} from "../../energy/contract.mjs";

export const here=fileURLToPath(new URL("./",import.meta.url));
export const replayContract="Dispatch replay contract. P and S are separate recorded field cases. Preserve both captures. A matching timestamp or request ID across cases does not make either a correction of the other. In each case, --require-anomaly requires an actual live display inversion: exit 0 and report diagnosis.reproduced=true if reproduced, otherwise exit 1 and report false. diagnosis.liveInversions lists the observed live inversions. Keep the existing --json interface. The working checkout contains the P capture.";
export function recordsAt(dir){
  mkdirSync(dir);
  const captures={};
  for(const [id,source] of [["P","redraw-solo"],["S","suppressed-solo"]]){
    const bytes=readFileSync(join(archive,source,"desk/packets/terminal.tsv"));
    writeFileSync(join(dir,id+".tsv"),bytes);
    captures[id]={path:"/run/dispatch-records/"+id+".tsv",sha256:digest(bytes),source:id==="P"?basis:previous};
  }
  writeJson(join(dir,"contract.json"),{contract:replayContract,captures});
  return captures;
}
export function prepareWorld(world,captures){
  prepare(world);
  for(const [label,ref] of [["P",basis],["S",recordRef]]){
    const raw=git(world,"rev-parse",ref+":handover/evidence/terminal.tsv");
    assert.equal(raw,git(world,"hash-object",join(captures,label+".tsv")));
  }
  rmSync(join(world,".git/FETCH_HEAD"));
}
export function profile(home,role,available){
  const dir=join(home,"profiles/node_modules/pnwf-isolated-review");
  cpSync(join(here,"plugin"),dir,{recursive:true});
  writeJson(join(dir,"role.json"),{role,contactAvailable:available,session:maintainer,previous,recordRef,contract:replayContract,
    catalogue:"/run/dispatch-records/contract.json",cases:["/run/dispatch-records/P.tsv","/run/dispatch-records/S.tsv"]});
  const disabled=["tool-subagent","tool-subagent-fork","tool-subagent-control","tool-subagent-list-agents","tool-workflow","workflow-ptc","subagent-spawn-in-process","subagent-fork-in-process"];
  appendFileSync(join(home,"profiles/alhs-core/cordis.patch.yml"),["","- insert:","    - id: pnwf-isolated-review","      name: pnwf-isolated-review",
    ...disabled.flatMap(id=>["- id: "+id,"  disabled: true"]),"",].join("\n"));
}
export function classify(sha,capture,row){
  assert(/^[0-9a-f]{40}$/.test(sha)&&["P","S"].includes(capture)&&row.event===capture);
  let json;try{json=JSON.parse(row.stdout);}catch{}
  const rows=json?.diagnosis?.liveInversions;
  const count=Array.isArray(rows)?rows.length:null;
  return {sha,capture,inputDigest:row.input,exit:row.exit,
    reproduced:typeof json?.diagnosis?.reproduced==="boolean"?json.diagnosis.reproduced:null,
    inversions:count,p17At40:Array.isArray(rows)?rows.some(x=>x?.panel==="p17"&&x.sequence===40):null,
    stdoutDigest:digest(row.stdout),stderrDigest:digest(row.stderr)};
}
