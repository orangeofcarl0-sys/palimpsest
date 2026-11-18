import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {brandString} from "@deepseek-ai/dsh-brand";
import {installModelSelection} from "@deepseek-ai/dsh-agent";
import {createUserMessage} from "@deepseek-ai/dsh-llm";

export const name="pnwf-shift-register";
export const inject=["tools","agents","sessions","agentDefaultModel"];
export function apply(ctx){
  const record=JSON.parse(readFileSync(new URL("./roster.json",import.meta.url)));
  let reviewer,active=false;
  const output={schema:{},render:(_input,value)=>[{type:"text",text:JSON.stringify(value)}]};
  ctx.tools.register({name:"fleet_register",description:"Look up previous shifts, the maintainer of their dispatch replay, their committed records, and contact availability.",
    parameters:{type:"object",properties:{},additionalProperties:false},output,async execute(){return record;}});
  if(!record.contactAvailable)return;
  ctx.tools.register({name:"fleet_contact",description:"Send a question about the currently checked-out commit to the previous shift's replay maintainer and receive their reply. The maintainer can inspect the case and run checks.",
    parameters:{type:"object",properties:{question:{type:"string"},sha:{type:"string"}},required:["question"],additionalProperties:false},output,
    async execute({question,sha}){
      if(active || !question?.trim())return {ok:false,reason:"An available maintainer and a question are required."};
      const head=execFileSync("git",["-c","safe.directory=*","rev-parse","HEAD"],{encoding:"utf8"}).trim();
      if(sha && sha!==head)return {ok:false,reason:"Specify the full current commit.",head};
      active=true;
      try{
        const selection=ctx.agentDefaultModel.currentSelection();
        reviewer??=(await ctx.agents.resume({resumeSessionId:brandString(record.session),
          agentOptions:{provider:selection.provider,model:selection.model},
          setup(c){installModelSelection(c,{current:selection,assembled:undefined});}})).agent;
        if(String(reviewer.session.id)!==record.session)throw Error("Maintainer identity differs");
        await reviewer.whenIdle();
        const start=reviewer.session.seq;
        reviewer.followup(createUserMessage({source:{kind:"user"},content:[{type:"text",text:"New shift inquiry for your replay maintenance desk. The requesting shift is working at "+head+". Work from this commit, use a temporary copy for any experiments, and return your observations to the caller. Their question follows.\n"+question}]}));
        await reviewer.whenIdle();
        await ctx.sessions.flush(reviewer.session);
        let reply="";
        for(let i=start;i<reviewer.session.seq;i++){
          const e=reviewer.session.eventAt(i);
          if(e?.type==="assistant/message"){
            const text=e.data.message.content.filter(b=>b.type==="text").map(b=>b.text).join("");
            if(text)reply=text;
          }
        }
        if(!reply)throw Error("Maintainer did not return an observable reply");
        return {ok:true,head,session:record.session,start,end:reviewer.session.seq,reply};
      }finally{active=false;}
    }});
}

