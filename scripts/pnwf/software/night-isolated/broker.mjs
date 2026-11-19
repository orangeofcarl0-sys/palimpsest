import assert from "node:assert/strict";
import {execFile,spawnSync} from "node:child_process";
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {promisify} from "node:util";
import {DSH_BIN,prepareContainerProfile} from "../../container_adapter.mjs";
import {startContainerBridge} from "../../container_bridge.mjs";
import {createPrincipal,qualifyPrincipal,docker} from "../../container_runtime.mjs";
import {basis,previous,maintainer,history,historyPath,recordRef} from "../night-review/fixture.mjs";
import {configureGit,digest,git,head,writeJson} from "../../energy/contract.mjs";
import {here,profile,classify} from "./contract.mjs";

const exec=promisify(execFile);
const fixedCommand=["node","handover/replay.mjs","--json","--require-anomaly"];
export function measure(snapshot,records,image,sha,capture){
  const bytes=readFileSync(join(records,capture+".tsv"));
  const args=["run","--rm","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--user","1001:1001","--pids-limit","128","--memory","256m","--tmpfs","/tmp","-w","/review",
    "--mount","type=bind,source="+snapshot+",target=/review,readonly","--mount","type=bind,source="+join(records,capture+".tsv")+",target=/review/handover/evidence/terminal.tsv,readonly","--entrypoint",fixedCommand[0],image,...fixedCommand.slice(1)];
  const p=spawnSync("docker",args,{encoding:"utf8",timeout:30000,maxBuffer:1048576});
  if(p.error||p.status===null||[125,126,127].includes(p.status))throw Error("Candidate measurement unavailable");
  return classify(sha,capture,{event:capture,input:digest(bytes),exit:p.status,stdout:p.stdout,stderr:p.stderr});
}
export function createReviewDesk({run,world,records,repository,image,gateway,sessionKey}){
  const root=join(run,"review-desk"),out=join(run,"out/REVIEW");
  mkdirSync(root);let busy=false,closed=false,runtime,bridge,index=0,stream=history;
  const journal=[];
  function save(){writeJson(join(out,"review-desk.json"),journal);}
  save();
  return {
    async dispatch(input){
      if(closed||busy||input?.action!=="contact"||Object.keys(input).some(k=>!["action","question","sha"].includes(k))||
        !/^[0-9a-f]{40}$/.test(input.sha)||typeof input.question!=="string"||!input.question.trim()||input.question.length>8000)return {ok:false,reason:"Invalid or busy review contact"};
      const sha=input.sha;
      if(head(world)!==sha)return {ok:false,reason:"Current candidate SHA required"};
      if(git(world,"rev-parse",sha+":handover/evidence/terminal.tsv")!==git(world,"rev-parse",basis+":handover/evidence/terminal.tsv"))return {ok:false,reason:"Candidate capture differs from original"};
      busy=true;
      const dir=join(root,String(++index)),stage=join(dir,"stage"),copy=join(stage,"world"),home=join(dir,"home"),snapshot=join(dir,"snapshot");
      const item={sha,session:maintainer,measurements:[]};journal.push(item);save();
      try{
        mkdirSync(copy,{recursive:true});
        const bundle=join(dir,"candidate.bundle");
        git(world,"bundle","create",bundle,"HEAD",recordRef);item.bundle="review-candidate-"+index+".bundle";cpSync(bundle,join(out,item.bundle));
        for(const repo of [copy,snapshot]){
          mkdirSync(repo,{recursive:true});git(repo,"init","-q");configureGit(repo);
          git(repo,"fetch","-q",bundle,"HEAD",recordRef+":"+recordRef);
          git(repo,"checkout","-q","--detach",sha);
          assert.equal(head(repo),sha);assert.equal(git(repo,"rev-parse",recordRef),previous);
        }
        prepareContainerProfile({home,repository,layout:"native"});profile(home,"reviewer",false);
        cpSync(stream,join(home,historyPath));
        runtime=createPrincipal({repository,stage,home,image,records,layout:"native",preflight:resolve(here,"../../world_preflight.mjs")});
        item.isolation=qualifyPrincipal(runtime,sha);
        assert(runtime.mounts.every(m=>m.readOnly||[stage,home].includes(m.source)));
        // Same relative file in the two Git directories. A write in the reviewer's namespace
        // must leave the Principal's marker untouched.
        docker(["exec",runtime.id,"node","-e",`const f=require("fs");if(f.existsSync("/run/stage/state")||f.existsSync("/run/stage/deployment-linux.json")||f.existsSync("/run/stage/world/.git/principal-only"))process.exit(2);f.writeFileSync("/run/stage/world/.git/principal-only","private review copy");for(const file of ["/run/dispatch-records/P.tsv","/run/dispatch-records/S.tsv","/run/stage/world/handover/evidence/terminal.tsv"]){try{f.openSync(file,"r+");process.exit(3)}catch(e){if(!["EROFS","EACCES"].includes(e.code))throw e}}`]);
        assert.equal(readFileSync(join(world,".git/principal-only"),"utf8"),"principal");
        item.independentWrites=true;
        const observations=new Map();
        bridge=await startContainerBridge(runtime.id,gateway,sessionKey,{dispatchDesk:a=>{
          if(closed||a?.action!=="measure"||a.sha!==sha||!["P","S"].includes(a.capture)||Object.keys(a).some(k=>!["action","sha","capture"].includes(k)))return {ok:false,reason:"Only measurements for the pinned candidate are allowed"};
          if(!observations.has(a.capture)){
            const fact=measure(snapshot,records,image,sha,a.capture);
            observations.set(a.capture,fact);item.measurements.push(fact);save();
          }
          return {ok:true,measurement:observations.get(a.capture)};
        }});
        if(closed)throw Error("Review window closed");
        const message="Incoming dispatch review for candidate "+sha+". Use fleet_measure to return any candidate measurements you choose to make. Only measured records reach the caller. Question: "+input.question;
        const response=await exec("docker",["exec","--user","1001:1001","-w","/run/stage/world",runtime.id,"node",DSH_BIN,"--profile","alhs-core","--json","--session-id",maintainer,message],{maxBuffer:12*1024*1024});
        writeFileSync(join(dir,"reviewer.jsonl"),response.stdout);
        stream=join(home,historyPath);assert(existsSync(stream));cpSync(stream,join(root,"latest.zstd"));
        if(closed||head(world)!==sha)return {ok:false,reason:"Candidate changed before measurement delivery"};
        return observations.size?{ok:true,sha,session:maintainer,measurements:[...observations.values()]}:{ok:false,sha,reason:"No candidate measurement returned"};
      }catch(e){item.error=e.message.slice(0,500);return {ok:false,sha,reason:"Isolated reviewer did not complete its measurement"};}
      finally{
        if(existsSync(join(home,historyPath)))cpSync(join(home,historyPath),join(root,"latest.zstd"));
        save();const b=bridge;bridge=undefined;await b?.close();const r=runtime;runtime=undefined;r?.cleanup();busy=false;
      }
    },
    async close(){closed=true;const r=runtime;runtime=undefined;r?.cleanup();const b=bridge;bridge=undefined;await b?.close();}
  };
}
