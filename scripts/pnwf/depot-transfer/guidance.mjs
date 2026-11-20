import assert from "node:assert/strict";

// The host keeps the unmodified filing decision. Only this copy reaches DSH.
export function filingFeedback(result,condition){
  if(!condition)return result;
  assert(["priority","hint"].includes(condition));
  const visible=structuredClone(result);
  for(const part of [visible.window,visible.refusal?.window,visible.refusal]){
    if(!part)continue;
    if(condition==="priority")delete part.unused;
    else delete part.authority;
  }
  if(condition==="priority"&&visible.refusal?.reason==="UNUSED_WINDOW_POWER"){
    visible.refusal.reason="FILING_REVIEW_REQUIRED";
    visible.refusal.nextAction="Review the order against the applicable records before filing.";
  }
  return visible;
}
