import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {launchDeployment as launch} from "./base-entry.mjs";
export * from "./base-entry.mjs";

export function launchDeployment(profile,options) {
  const {rules,receiptPath,filing}=JSON.parse(readFileSync(new URL("./materials.json",import.meta.url)));
  const instructions=filing??(" Depot filing contract: edit only "+rules.mayWrite.join(", ")+
    ". Preserve all original materials, including operations/desk.md, operations/retest.mjs and the raw capture, byte-for-byte. "+
    "File the complete returned late-shift receipt object unchanged as JSON at "+receiptPath+".");
  const registry=options.context.tools;
  return launch(profile,{...options,host:{...options.host,taskObligations:{"depot-release":rules}},
    context:{...options.context,tools:{register(def) {
      if(def.name!=="palimpsest_work") return registry.register(def);
      return registry.register({...def,description:def.description+instructions,async execute(args,ctx) {
        if(args?.action!=="conclude" || args.intent!=="DELIVER") return def.execute(args,ctx);
        const head=()=>execFileSync("git",["-C",profile.repository,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
        const candidate=head();
        const response=await fetch("http://127.0.0.1:18080/pnwf/desk",{method:"POST",
          body:JSON.stringify({action:"inspect_delivery",sha:candidate})});
        if(!response.ok) throw Error("Delivery inspection unavailable");
        const result=await response.json();
        if(!result.ok) return {state:"NOT_READY",recorded:false,...result.refusal,filing:instructions};
        if(head()!==candidate) return {state:"NOT_READY",recorded:false,reason:"RESULT_DRIFT",nextAction:"REOBSERVE"};
        return def.execute(args,ctx);
      }});
    }}}});
}
