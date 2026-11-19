import assert from "node:assert/strict";
import {existsSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {gunzipSync} from "node:zlib";
import {archive,basis,maintainer} from "../night-review/fixture.mjs";
import {configureGit,digest,git,readJson} from "../../energy/contract.mjs";
import {measure} from "./broker.mjs";
import {here,replayContract} from "./contract.mjs";

const root=resolve(process.argv[2]);
const matrix=readJson(join(root,"matrix.json"));
assert.equal(matrix.seal.basis,basis);
for(const [name,hash] of Object.entries(matrix.seal.inputs)){
  const launch=join(root,"../launch-sources",name+".gz");
  const archived=["mock.mjs","run.mjs"].includes(name)&&existsSync(launch);
  const source=readFileSync(join(here,name));
  const exact=archived?gunzipSync(readFileSync(launch)):source;
  assert.equal(digest(exact),hash,name);
  if(archived)assert.equal(exact.toString().replaceAll("\r\n","\n").trimEnd(),source.toString().replaceAll("\r\n","\n").trimEnd(),name);
}
for(const {arm} of matrix.cases){
  const dir=join(root,arm),out=join(dir,"out/REVIEW"),records=join(out,"records");
  const {contract,captures}=readJson(join(records,"contract.json"));
  assert.equal(contract,replayContract);
  for(const [key,source] of [["P","redraw-solo"],["S","suppressed-solo"]]){
    const bytes=readFileSync(join(records,key+".tsv"));
    assert(bytes.equals(readFileSync(join(archive,source,"desk/packets/terminal.tsv"))));
    assert.equal(captures[key].sha256,digest(bytes));
  }
  const {traces}=readJson(join(dir,"trajectory.json"));
  const principal=traces.find(t=>t.role==="principal");
  const contacts=principal.calls.filter(c=>c.tool==="fleet_contact");
  if(arm==="solo"){assert.equal(traces.length,1);assert.equal(contacts.length,0);continue;}
  const journal=readJson(join(out,"review-desk.json"));
  for(const item of journal){
    assert.equal(item.session,maintainer);
    if(item.measurements.length===0)continue;
    assert(item.independentWrites);
    assert(existsSync(join(out,item.bundle)));
    const temp=mkdtempSync(join(tmpdir(),"review-recompute-"));
    try{
      git(temp,"init","-q");configureGit(temp);git(temp,"fetch","-q",join(out,item.bundle),"HEAD");
      assert.equal(git(temp,"rev-parse","FETCH_HEAD"),item.sha);
      git(temp,"checkout","-q","--detach",item.sha);
      for(const fact of item.measurements){
        assert.deepEqual(measure(temp,records,matrix.seal.image,item.sha,fact.capture),fact);
      }
    }finally{rmSync(temp,{recursive:true,force:true});}
  }
  for(const c of contacts){
    if(!c.reply.startsWith("{"))continue;
    const reply=JSON.parse(c.reply);
    if(!reply.ok)continue;
    assert.deepEqual(Object.keys(reply).sort(),["measurements","ok","session","sha"]);
    assert.equal(reply.sha,c.input.sha);assert.equal(reply.session,maintainer);
    assert(journal.some(i=>i.sha===reply.sha&&JSON.stringify(i.measurements)===JSON.stringify(reply.measurements)));
  }
}
console.log("Verified original captures, measured candidate objects and delivered receipts:",matrix.mode);
