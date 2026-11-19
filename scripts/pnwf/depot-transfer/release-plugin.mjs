import {apply as registerDesk} from "./desk.js";
export {name,inject} from "./desk.js";
export function apply(ctx){
  registerDesk(ctx);
  ctx.tools.register({
    name:"depot_release_check",
    description:"Check the committed dispatch order for filing. Each requested AC setpoint must fit its slot limit even if the station clips actual power. Returns the affected times and excess kW.",
    parameters:{type:"object",properties:{sha:{type:"string"}},required:["sha"],additionalProperties:false},
    output:{schema:{},render:(_args,result)=>[{type:"text",text:JSON.stringify(result)}]},
    async execute({sha}){
      const response=await fetch("http://127.0.0.1:18080/pnwf/desk",{method:"POST",
        body:JSON.stringify({action:"release_check",sha})});
      return response.json();
    }
  });
}
