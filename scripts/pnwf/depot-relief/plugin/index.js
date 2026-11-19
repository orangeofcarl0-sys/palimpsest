import {readFileSync} from "node:fs";
export const name = "depot-shift-desk";
export const inject = ["tools"];
const role = JSON.parse(readFileSync(new URL("./desk.json", import.meta.url)));
export function apply(ctx) {
  function tool(name, description, properties, execute) {
    ctx.tools.register({name, description, parameters: {type:"object", properties, required:Object.keys(properties), additionalProperties:false},
      output:{schema:{}, render:(_args,v)=>[{type:"text",text:JSON.stringify(v)}]}, execute});
  }
  async function post(a) {
    const res = await fetch("http://127.0.0.1:18080/pnwf/desk",{method:"POST",body:JSON.stringify(a)});
    return res.json();
  }
  tool("depot_directory","Look up the test-stand archive and previous shift duty contact.",{},async()=>role.directory);
  tool("depot_trial","Replay the committed four-slot sheet at the named full Git SHA against the meter capture.",
    {sha:{type:"string"}},({sha})=>post({action:"trial",sha}));
  if (role.maintainer) tool("depot_shift_log","Read the previous shift's measured exception slip.",{},async()=>role.slip);
  else tool("depot_contact","Ask the previous shift's schedule maintainer to check a committed sheet and return measured results.",
    {sha:{type:"string"},question:{type:"string"}},({sha,question})=>post({action:"contact",sha,question}));
}
