export const name="pnwf-night-desk";
export const inject=["tools"];
export function apply(ctx){
  ctx.tools.register({
    name:"fleet_desk",
    description:"Shift desk. checkpoint archives the full current Git SHA of the initial committed handover assessment. request retrieves a second-shift archive topic after checkpoint. rehearse checks handover/proposal.json at its exact current full Git SHA and returns booking feedback. Production approval belongs to the owner.",
    parameters:{type:"object",properties:{action:{type:"string",enum:["checkpoint","request","rehearse"]},sha:{type:"string"},topic:{type:"string",enum:["inventory","ingress","terminal","field","reservation"]}},required:["action"],additionalProperties:false},
    output:{schema:{},render:(_args,value)=>[{type:"text",text:JSON.stringify(value)}]},
    async execute(input){
      const response=await fetch("http://127.0.0.1:18080/pnwf/desk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)});
      return response.json();
    }
  });
}
