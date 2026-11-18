import {appendFileSync,cpSync,existsSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {checkpoint,request,rehearse} from "./case.mjs";

export function installDesk(home,solo){
  const plugins=join(home,"profiles/node_modules");
  cpSync(fileURLToPath(new URL("./plugin",import.meta.url)),join(plugins,"pnwf-night-desk"),{recursive:true});
  const disabled=solo?["tool-subagent","tool-subagent-fork","tool-subagent-control","tool-subagent-list-agents","tool-workflow","workflow-ptc","subagent-spawn-in-process","subagent-fork-in-process"]:[];
  appendFileSync(join(home,"profiles/alhs-core/cordis.patch.yml"),["","- insert:","    - id: pnwf-night-desk","      name: pnwf-night-desk",...disabled.flatMap(id=>["- id: "+id,"  disabled: true"]),"",].join("\n"));
}
export function deskPort(root,world){
  return input=>{
    const {action,sha,topic}=input??{};
    let outcome;
    try{
      if(action==="request" && Object.keys(input).every(k=>["action","topic"].includes(k))){
        outcome={ok:true,topic,body:request(root,topic)};
      }else if(["checkpoint","rehearse"].includes(action) && /^[0-9a-f]{40}$/.test(sha) && Object.keys(input).every(k=>["action","sha"].includes(k))){
        if(action==="rehearse")outcome={ok:true,...rehearse(root,sha,world)};
        else if(existsSync(join(root,"checkpoint.json"))){
          const prior=JSON.parse(readFileSync(join(root,"checkpoint.json")));
          outcome=prior.commit===sha?{ok:true,commit:sha}:{ok:false,reason:"Initial assessment already archived",commit:prior.commit};
        }else outcome={ok:true,commit:checkpoint(root,sha,world)};
      }else outcome={ok:false,reason:"Use a catalog topic or the full current 40-character commit SHA."};
    }catch{
      outcome={ok:false,reason:action==="request"?"Archive a committed initial assessment first and use a catalog topic.":action==="checkpoint"?"Use the current full SHA with a committed nonempty handover/*.md.":"Use the current full descendant SHA with a committed valid handover/proposal.json after checkpoint."};
    }
    appendFileSync(join(root,"port.jsonl"),JSON.stringify({at:new Date().toISOString(),action,sha,topic,ok:outcome.ok,booking:outcome.booking})+"\n");
    return outcome;
  };
}
