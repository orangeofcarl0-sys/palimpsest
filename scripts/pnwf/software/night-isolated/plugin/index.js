import {readFileSync} from "node:fs";

export const name="pnwf-isolated-review";
export const inject=["tools"];
const config=JSON.parse(readFileSync(new URL("./role.json",import.meta.url)));
export function apply(ctx){
  function register(name,description,properties,required,execute){
    ctx.tools.register({name,description,parameters:{type:"object",properties,required,additionalProperties:false},
      output:{schema:{},render:(_args,v)=>[{type:"text",text:JSON.stringify(v)}]},execute});
  }
  async function desk(input){
    const res=await fetch("http://127.0.0.1:18080/pnwf/desk",{method:"POST",body:JSON.stringify(input)});
    return res.json();
  }
  register("fleet_register","Read the dispatch replay contract, capture catalogue and previous shift contact.",{},[],async()=>config);
  if(config.role==="reviewer"){
    register("fleet_measure","Measure the specified capture against the pinned Git candidate. Only these host-observed results can be returned to the requesting shift.",
      {sha:{type:"string"},capture:{type:"string",enum:["P","S"]}},["sha","capture"],a=>desk({action:"measure",...a}));
  }else if(config.contactAvailable){
    register("fleet_contact","Request measurements from the previous replay maintainer on an independent copy of a committed candidate.",
      {sha:{type:"string"},question:{type:"string"}},["sha","question"],a=>desk({action:"contact",...a}));
  }
}
