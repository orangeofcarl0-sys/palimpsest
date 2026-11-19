import {execFile} from "node:child_process";
import {cpSync,existsSync,mkdirSync,renameSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {promisify} from "node:util";
import {DSH_BIN,prepareContainerProfile} from "../container_adapter.mjs";
import {createPrincipal,qualifyPrincipal} from "../container_runtime.mjs";
import {startContainerBridge} from "../container_bridge.mjs";
import {git} from "../transit-desk/run.mjs";
import {readJson,writeJson} from "../energy/contract.mjs";
import {ReceiptStore} from "./receipt-store.mjs";
import {here,history,streamPath,maintainer,profile,measure,publicLog,privateLog,snapshot} from "./case.mjs";

const exec=promisify(execFile);
export function desk({run,world,repository,image,slip,gateway,sessionKey,wallClockMs,peerMeasure=measure}) {
  const dir=join(run,"desk");
  mkdirSync(dir,{recursive:true});
  const journalPath=join(dir,"journal.json"),latest=join(dir,"latest.zstd");
  const journal=existsSync(journalPath)?readJson(journalPath):[];
  const store=new ReceiptStore(join(dir,"receipts.sqlite"),slip.captureDigest);
  const deadline=Date.now()+wallClockMs;
  let draining=null;
  let closed=false,current,bridge,stream=existsSync(latest)?latest:history,count=Math.max(0,...journal.map(e=>e.n??0));
  function log(event){journal.push({at:new Date().toISOString(),...event});writeJson(join(dir,"journal.json"),journal);}
  log({kind:"OPEN",slip});
  const head=()=>git(world,"rev-parse","HEAD").trim();
  return {
    async dispatch(a){
      if(closed || !a || a.sha!==head())return {ok:false,reason:"Current full candidate SHA required"};
      if(a.action==="trial"&&Object.keys(a).length===2){
        const receipt=measure(world,a.sha,publicLog);log({kind:"SELF_TRIAL",receipt});return {ok:true,receipt};
      }
      if(a.action!=="contact" || typeof a.question!=="string" || !a.question.trim() || a.question.length>8000 ||
          Object.keys(a).length!==3)return {ok:false,reason:"Invalid contact"};
      const sha=a.sha,n=++count,attempt=join(dir,String(n)),stage=join(attempt,"stage"),copy=join(stage,"world"),home=join(attempt,"home");
      const path=join(home,streamPath);
      const handoff=Promise.withResolvers();
      log({kind:"CONTACT",n,sha,question:a.question,cached:!!store.read(sha),principal:snapshot(world)});
      try{
        const measured=await store.request(sha,async publish=>{
          if(head()!==sha)throw Error("Candidate changed before review");
          log({kind:"START_REVIEW",n,sha});
          try{
          mkdirSync(copy,{recursive:true});
          const bundle=join(attempt,"pinned.bundle");
          git(world,"bundle","create",bundle,"HEAD");
          git(copy,"init","-q");git(copy,"fetch","-q",bundle,"HEAD");git(copy,"checkout","-q","--detach",sha);
          prepareContainerProfile({home,repository,layout:"native"});profile(home,{record:privateLog,originalTrial:slip});
          const plugin=join(home,"profiles/node_modules/depot-shift-desk");
          renameSync(join(plugin,"index.js"),join(plugin,"desk.js"));
          cpSync(join(here,"review-entry.mjs"),join(plugin,"index.js"));
          cpSync(join(here,"review-trial.mjs"),join(plugin,"review-trial.mjs"));
          writeFileSync(join(plugin,"pinned-sha"),sha);
          cpSync(stream,path);
          current=createPrincipal({repository,stage,home,image,layout:"native",preflight:resolve(here,"../world_preflight.mjs")});
          writeJson(join(attempt,"isolation.json"),qualifyPrincipal(current,sha));
          if(current.mounts.some(m=>!m.readOnly&&![stage,home].includes(m.source)))throw Error("Unexpected reviewer mount");
          bridge=await startContainerBridge(current.id,gateway,sessionKey,{dispatchDesk:async input=>{
            if(closed||input?.action!=="trial"||input.sha!==sha||Object.keys(input).length!==2)return {ok:false,reason:"Pinned measurements only"};
            // Read the Principal's immutable Git object. The reviewer may experiment only in its isolated copy.
            const receipt=publish(peerMeasure(world,sha));
            log({kind:"PEER_TRIAL",n,receipt});
            const deliveredSha=await handoff.promise;
            if(deliveredSha===sha)draining??=Promise.withResolvers();
            return {ok:true,receipt,deliveredSha};
          }});
          const prompt="接班复核单 "+sha+"。你的值班台保留上一班采集及原表实测单（depot_shift_log）。depot_trial 在本席用这份采集重放提交。回复通道仅传回绑定 SHA 的实测回执。来问："+a.question;
          const res=await exec("docker",["exec","--user","1001:1001","-w","/run/stage/world",current.id,"node",DSH_BIN,
            "--profile","alhs-core","--json","--session-id",maintainer,prompt],{maxBuffer:16*1024*1024});
          writeFileSync(join(attempt,"reviewer.jsonl"),res.stdout);
          log({kind:"REVIEW_EXIT",n,sha,exitCode:0});
          }catch(error){log({kind:"REVIEW_EXIT_ERROR",n,sha,detail:String(error.message).slice(0,250)});throw error;}
          finally{
            draining?.resolve();draining=null;
            if(existsSync(path)){cpSync(path,latest);stream=latest;}
            const b=bridge;bridge=null;await b?.close();
            const r=current;current=null;r?.cleanup();
          }
        });
        if(closed||head()!==sha)return {ok:false,reason:"Current full candidate SHA required"};
        log({kind:"RETURN",n,sha,principal:snapshot(world),receipt:measured});
        handoff.resolve(sha);
        return {ok:true,from:maintainer,receipt:measured};
      }catch(e){log({kind:"FAILURE",n,sha,detail:String(e.message).slice(0,320)});return {ok:false,reason:"Review did not return a measurement"};}
      finally{handoff.resolve(null);}
    },
    async close(){
      closed=true;
      if(draining){
        let timer;
        try{await Promise.race([draining.promise,new Promise(done=>{
          timer=setTimeout(done,Math.max(0,Math.min(2000,deadline-Date.now())));
        })]);}finally{clearTimeout(timer);}
      }
      await store.close(async()=>{const r=current;current=null;r?.cleanup();});
    }
  };
}
