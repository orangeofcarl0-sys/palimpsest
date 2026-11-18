import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {prepare} from "./case.mjs";
import {deskPort} from "./port.mjs";

test("a mounted project can use only the fixed desk actions and exact version",t=>{
  const root=mkdtempSync(join(tmpdir(),"night-port-"));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const stage=join(root,"stage"),privateDir=join(root,"private");mkdirSync(stage);
  const {world,basis}=prepare(privateDir,"redraw",join(stage,"world"));
  const dispatch=deskPort(privateDir,world);
  assert(!existsSync(join(stage,"packets")));
  assert(!dispatch({action:"request",topic:"terminal"}).ok);
  assert(!dispatch({action:"request",topic:"terminal",variant:"redraw"}).ok);
  assert(!dispatch({action:"checkpoint",sha:basis}).ok);
  const git=(...args)=>execFileSync("git",["-C",world,...args],{encoding:"utf8"}).trim();
  mkdirSync(join(world,"handover"));writeFileSync(join(world,"handover","draft.md"),"Check the panel capture.");
  git("add","handover");git("-c","commit.gpgsign=false","commit","-qm","File draft");
  const draft=git("rev-parse","HEAD");
  assert.deepEqual(dispatch({action:"checkpoint",sha:draft}),dispatch({action:"checkpoint",sha:draft}));
  assert(!dispatch({action:"checkpoint",sha:basis}).ok);
  assert(!dispatch({action:"request",topic:"../seal.json"}).ok);
  assert(dispatch({action:"request",topic:"terminal"}).body.includes("22:03:17"));
  assert(!dispatch({action:"rehearse",sha:draft}).ok);
});
