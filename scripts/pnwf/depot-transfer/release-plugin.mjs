import {apply as registerDesk} from "./desk.js";
import {existsSync,readFileSync} from "node:fs";
export {name,inject} from "./desk.js";
export function apply(ctx){
  registerDesk(ctx);
  const contract=new URL("./filing.json",import.meta.url);
  const scope=existsSync(contract)?" "+JSON.parse(readFileSync(contract)).authority:"";
  ctx.tools.register({
    name:"depot_release_check",
    description:"Check the committed dispatch order for filing. Each requested AC setpoint must fit its slot limit even if the station clips actual power. Returns the affected times and excess kW."+scope,
    parameters:{type:"object",properties:{sha:{type:"string"}},required:["sha"],additionalProperties:false},
    output:{schema:{},render:(_args,result)=>[{type:"text",text:JSON.stringify(result)}]},
    async execute({sha}){
      const response=await fetch("http://127.0.0.1:18080/pnwf/desk",{method:"POST",
        body:JSON.stringify({action:"release_check",sha})});
      return response.json();
    }
  });
}
