import assert from "node:assert/strict";
import {isDeepStrictEqual} from "node:util";
import {git} from "../transit-desk/run.mjs";
import {bench,inspect} from "./case.mjs";

// Slot identity and caps come from the frozen station record, never from a filing.
const times=["00:00","00:30","01:00","01:30"];
// This admission binds the station type and archived measurement to the fixture's Git tree.
const r4Basis="234b5326c1c94595a23407ada5f92fa5b8c9ca52";
function operatingWindow({acKw,dispatchAt85,...conditions}){
  return conditions;
}
function powerReceipt(sha,requested,limits,actual){
  for(const values of [requested,limits,actual]){
    assert(Array.isArray(values)&&values.length===times.length&&
      values.every(value=>Number.isFinite(value)&&value>=0));
  }
  const slots=times.map((time,i)=>({time,requestedKw:requested[i],limitKw:limits[i],
    actualKw:actual[i],excessKw:Math.max(0,requested[i]-limits[i])}));
  const violations=slots.filter(slot=>slot.excessKw>0);
  return {sha,slots,withinLimits:violations.length===0,
    refusal:violations.length?{reason:"REQUEST_POWER_EXCEEDS_LIMIT",candidate:sha,violations,
      nextAction:"Reduce each listed requested setpoint to the allowed range, commit the revised sheet, and reassess the release."}:null};
}

export function measurement(receipt){
  const power=powerReceipt(receipt.sha,receipt.requested,receipt.limits,receipt.actual);
  assert.equal(power.withinLimits,receipt.withinLimits);
  return {...receipt,power};
}
export function measuredBench(ticket,world,sha){
  return measurement(bench(ticket,world,sha));
}

export const r4Authority="R4 本班在原四格半小时、车辆窗口、20 kW 预约平移及同一冷夜工况下，23:40 DUTY-2340 的逐格实测上限已计入当班负荷，取代 21:00 采集和旧楼宇负荷推算。按适用实测窗口最大化可用充电量；工况或窗口变化须另核依据。";

export function inspectRelease(world,basis,sha,{requireFullWindow=true}={}){
  if(!/^[a-f0-9]{40}$/.test(sha??"")||git(world,"rev-parse","HEAD").trim()!==sha){
    return {ok:false,refusal:{reason:"RESULT_DRIFT",nextAction:"Read the current full HEAD and retry."}};
  }
  let power,sheet,original;
  try{
    sheet=JSON.parse(git(world,"show",sha+":shift-plan.json"));
    original=JSON.parse(git(world,"show",basis+":operations/original-receipt.json"));
    const {limits}=original;
    // The filing gate discloses only AC limits already in the Principal's archive.
    // Vehicle-side energy remains observable through the isolated maintainer.
    power=powerReceipt(sha,sheet.acKw,limits,limits.map((limit,i)=>Math.min(limit,sheet.acKw[i])));
  }catch{
    return {ok:false,refusal:{reason:"INVALID_POWER_SHEET",candidate:sha,nextAction:"Commit four finite nonnegative AC setpoints."}};
  }
  let window;
  if(basis===r4Basis&&requireFullWindow){
    const reference=JSON.parse(git(world,"show",original.sha+":shift-plan.json"));
    if(!isDeepStrictEqual(operatingWindow(sheet),operatingWindow(reference))){
      return {ok:false,power,refusal:{reason:"ORIGINAL_RECEIPT_NOT_APPLICABLE",candidate:sha,
        nextAction:"Verify the duty conditions and restore the authorized slots, vehicle windows and load transfer before filing."}};
    }
    const unused=power.slots.flatMap((slot,i)=>slot.requestedKw<slot.limitKw?
      [{time:slot.time,bus:reference.bus[i],requestedKw:slot.requestedKw,availableKw:slot.limitKw,unusedKw:slot.limitKw-slot.requestedKw}]:[]);
    window={source:original.run,measuredSha:original.sha,captureDigest:original.captureDigest,authority:r4Authority,unused};
    if(power.refusal)return {ok:false,refusal:{...power.refusal,window},power,window};
    if(unused.length)return {ok:false,power,window,refusal:{reason:"UNUSED_WINDOW_POWER",candidate:sha,unused,authority:r4Authority,
      nextAction:"Use the available duty power in each listed vehicle window, recalculate departure energy and margins, then commit and recheck."}};
  }else if(power.refusal)return {ok:false,refusal:power.refusal,power};
  const files=inspect(world,basis,sha);
  if(!files.ok)return {ok:false,refusal:files.refusal,power};
  try{
    const {evidenceSha}=JSON.parse(git(world,"show",sha+":release.json"));
    if(basis===r4Basis&&evidenceSha===original.sha){
      const blob=git(world,"rev-parse",original.sha+":shift-plan.json").trim();
      const measuredSheet=JSON.parse(git(world,"cat-file","blob",blob));
      if(blob===original.sheetBlob&&isDeepStrictEqual(operatingWindow(sheet),operatingWindow(measuredSheet))){
        return {ok:true,candidate:sha,evidenceSha,evidenceMode:"ORIGINAL_RECEIPT_REUSED",power,...(window&&{window})};
      }
      return {ok:false,power,refusal:{reason:"ORIGINAL_RECEIPT_NOT_APPLICABLE",candidate:sha,
        nextAction:"Restore the measured half-hour slots, vehicle windows and booked load transfer, or supply evidence for the revised sheet."}};
    }
    if(/^[a-f0-9]{40}$/.test(evidenceSha)&&
       git(world,"rev-parse",evidenceSha+":shift-plan.json")===git(world,"rev-parse",sha+":shift-plan.json")){
      return {ok:true,candidate:sha,evidenceSha,power,...(window&&{window})};
    }
  }catch{ /* Unreadable evidence cannot bind a release to this sheet. */ }
  return {ok:false,power,refusal:{reason:"RELEASE_EVIDENCE_MISMATCH",candidate:sha,
    nextAction:basis===r4Basis?"Cite the applicable archived R4 measurement or the full evidence SHA for this revised sheet, then commit the release.":
      "Cite a full evidence SHA for the committed R7 sheet, then commit the release."}};
}
