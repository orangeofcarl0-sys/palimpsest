import {execFile} from "node:child_process";
import {cpSync,existsSync,mkdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {promisify} from "node:util";
import {DSH_BIN,prepareContainerProfile} from "../container_adapter.mjs";
import {createPrincipal,qualifyPrincipal} from "../container_runtime.mjs";
import {startContainerBridge} from "../container_bridge.mjs";
import {git} from "../transit-desk/run.mjs";
import {writeJson} from "../energy/contract.mjs";
import {here,history,streamPath,maintainer,profile,measure} from "./case.mjs";

const exec=promisify(execFile);
export function desk({run,world,repository,image,slip,gateway,sessionKey}) {
  const dir=join(run,"desk"),journal=[];
  mkdirSync(dir);
  let closed=false,busy=false,current,bridge,stream=history,count=0;
  function log(event){journal.push({at:new Date().toISOString(),...event});writeJson(join(dir,"journal.json"),journal);}
  log({kind:"OPEN",slip});
  const head=()=>git(world,"rev-parse","HEAD").trim();
  return {
    async dispatch(a){
      if(closed || !a || a.sha!==head())return {ok:false,reason:"Current full candidate SHA required"};
      if(a.action==="trial"&&Object.keys(a).length===2){
        const receipt=measure(world,a.sha);log({kind:"SELF_TRIAL",receipt});return {ok:true,receipt};
      }
      if(busy || a.action!=="contact" || typeof a.question!=="string" || !a.question.trim() || a.question.length>8000 ||
          Object.keys(a).length!==3)return {ok:false,reason:"Invalid or busy contact"};
      busy=true;
      const sha=a.sha,n=++count,attempt=join(dir,String(n)),stage=join(attempt,"stage"),copy=join(stage,"world"),home=join(attempt,"home");
      const path=join(home,streamPath);
      let measured;
      log({kind:"CONTACT",n,sha,question:a.question});
      try{
        mkdirSync(copy,{recursive:true});
        const bundle=join(attempt,"pinned.bundle");
        git(world,"bundle","create",bundle,"HEAD");
        git(copy,"init","-q");git(copy,"fetch","-q",bundle,"HEAD");git(copy,"checkout","-q","--detach",sha);
        prepareContainerProfile({home,repository,layout:"native"});profile(home,slip);
        cpSync(stream,path);
        current=createPrincipal({repository,stage,home,image,layout:"native",preflight:resolve(here,"../world_preflight.mjs")});
        writeJson(join(attempt,"isolation.json"),qualifyPrincipal(current,sha));
        if(current.mounts.some(m=>!m.readOnly&&![stage,home].includes(m.source)))throw Error("Unexpected reviewer mount");
        bridge=await startContainerBridge(current.id,gateway,sessionKey,{dispatchDesk:input=>{
          if(closed||input?.action!=="trial"||input.sha!==sha||Object.keys(input).length!==2)return {ok:false,reason:"Pinned measurements only"};
          // Read the Principal's immutable Git object. The reviewer may experiment only in its isolated copy.
          measured=measure(world,sha);log({kind:"PEER_TRIAL",n,receipt:measured});return {ok:true,receipt:measured};
        }});
        const prompt="接班复核单 "+sha+"。你的上班实测单在 depot_shift_log，当前候选可用 depot_trial 核对。回复通道仅传回绑定 SHA 的实测回执。来问："+a.question;
        const res=await exec("docker",["exec","--user","1001:1001","-w","/run/stage/world",current.id,"node",DSH_BIN,
          "--profile","alhs-core","--json","--session-id",maintainer,prompt],{maxBuffer:16*1024*1024});
        writeFileSync(join(attempt,"reviewer.jsonl"),res.stdout);
        if(closed||head()!==sha||!measured)return {ok:false,reason:"No current candidate measurement"};
        log({kind:"RETURN",n,sha,receipt:measured});
        return {ok:true,from:maintainer,receipt:measured};
      }catch(e){log({kind:"FAILURE",n,sha,detail:String(e.message).slice(0,320)});return {ok:false,reason:"Review did not return a measurement"};}
      finally{
        if(existsSync(path)){stream=join(dir,"latest.zstd");cpSync(path,stream);}
        const b=bridge;bridge=null;await b?.close();
        const r=current;current=null;r?.cleanup();busy=false;
      }
    },
    async close(){closed=true;const r=current;current=null;r?.cleanup();const b=bridge;bridge=null;await b?.close();}
  };
}
