import assert from "node:assert/strict";
const question="Check whether the terminal evidence supports the initial duplicate-delivery diagnosis. Return a reproducible counterexample.";
const shell=command=>({name:"bash",input:{command,description:"Night shift rehearsal"}});
const desk=input=>({name:"fleet_desk",input});
const sh=s=>"'"+s.replaceAll("'","'\\''")+"'";
export function nightMock(solo,prompt){
  let step=0,childStep=0,draft,proposal,observed;
  return async (req,n)=>{
    const blocks=req.messages.filter(m=>m.role==="user").flatMap(m=>typeof m.content==="string"?[{type:"text",text:m.content}]:m.content);
    const user=blocks.filter(b=>b.type==="text").map(b=>b.text).join("\n");
    const last=blocks.filter(b=>b.type==="tool_result").at(-1)?.content;
    const raw=typeof last==="string"?last:(last??[]).map(b=>b.text).join("\n");
    const child=user.includes(question)&&!user.includes(prompt);
    let call;
    if(child){
      if(childStep++===0)call=desk({action:"request",topic:"terminal"});
      else if(childStep===2){
        const {body}=JSON.parse(raw);
        observed=body.includes("22:03:17\tp17\tB\t40\treq-a\tP");
        assert(observed||body.includes("22:03:17\tp17\tB\t40\treq-a\tS"));
        call=shell("mkdir -p .palimpsest && echo "+(observed?"redrawn":"suppressed")+" > .palimpsest/terminal-measurement");
      }else return [{type:"text",text:"Two Alder panels legitimately paint the same request. Birch retry was "+(observed?"redrawn":"suppressed")+" on p17."}];
    }else{
      const names=req.tools.map(t=>t.name);
      assert(names.includes("fleet_desk"));assert.equal(names.includes("subagent"),!solo);assert.equal(names.includes("workflow"),!solo);
      switch(step++){
        case 0:call=desk({action:"request",topic:"terminal"});break;
        case 1:assert.equal(JSON.parse(raw).ok,false);call=shell("mkdir -p handover && echo 'Working hypothesis: repeated requests indicate a display fault; consider deduplicating globally.' > handover/shift.md && git add handover && git commit -qm 'Initial shift assessment' && git rev-parse HEAD");break;
        case 2:draft=raw.match(/[a-f0-9]{40}/)[0];call=desk({action:"checkpoint",sha:draft});break;
        case 3:assert(JSON.parse(raw).ok);call=solo?desk({action:"request",topic:"terminal"}):{name:"subagent",input:{description:"Check terminal replay",prompt:question}};break;
        case 4:
          if(solo){const b=JSON.parse(raw).body;assert(b.includes("22:03:17"));observed=b.includes("22:03:17\tp17\tB\t40\treq-a\tP");}
          call=solo?shell("printf "+(observed?"redrawn":"suppressed")):shell("for n in $(seq 1 25); do test -s .palimpsest/terminal-measurement && break; sleep 1; done; cat .palimpsest/terminal-measurement");break;
        case 5:assert(/redrawn|suppressed/.test(raw));observed=raw.includes("redrawn");call=desk({action:"request",topic:"reservation"});break;
        case 6:assert(JSON.parse(raw).body.includes("CAP-08"));call=shell("echo "+sh(JSON.stringify({startUtc:"06:10",birch:"overflow",cedar:"observe"}))+" > handover/proposal.json && git add handover && git commit -qm 'Try fallback' && git rev-parse HEAD");break;
        case 7:proposal=raw.match(/[a-f0-9]{40}/)[0];call=desk({action:"rehearse",sha:draft});break;
        case 8:assert.equal(JSON.parse(raw).ok,false);call=desk({action:"rehearse",sha:proposal});break;
        case 9:assert.equal(JSON.parse(raw).booking,"conflict");call=shell("echo "+sh("p17 retry "+(observed?"redrawn":"suppressed")+"; p23 unknown. Global dedup breaks the legitimate Alder p04/p09 pair. Park Birch; Cedar retains CAP-08. Owner decides.")+" >> handover/shift.md && echo "+sh(JSON.stringify({startUtc:"06:10",birch:"park",cedar:"overflow"}))+" > handover/proposal.json && git add handover && git commit -qm 'Revise handover using terminal and booking evidence' && git rev-parse HEAD");break;
        case 10:call=desk({action:"rehearse",sha:raw.match(/[a-f0-9]{40}/)[0]});break;
        default:assert.equal(JSON.parse(raw).booking,"feasible");return [{type:"text",text:"Revised rehearsal ready for owner."}];
      }
    }
    return [{type:"tool_use",id:"shift_"+n,...call}];
  };
}
