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

export function inspectRelease(world,basis,sha){
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
  if(power.refusal)return {ok:false,refusal:power.refusal,power};
  const files=inspect(world,basis,sha);
  if(!files.ok)return {ok:false,refusal:files.refusal,power};
  try{
    const {evidenceSha}=JSON.parse(git(world,"show",sha+":release.json"));
    if(basis===r4Basis&&evidenceSha===original.sha){
      const blob=git(world,"rev-parse",original.sha+":shift-plan.json").trim();
      const measuredSheet=JSON.parse(git(world,"cat-file","blob",blob));
      if(blob===original.sheetBlob&&isDeepStrictEqual(operatingWindow(sheet),operatingWindow(measuredSheet))){
        return {ok:true,candidate:sha,evidenceSha,evidenceMode:"ORIGINAL_RECEIPT_REUSED",power};
      }
      return {ok:false,power,refusal:{reason:"ORIGINAL_RECEIPT_NOT_APPLICABLE",candidate:sha,
        nextAction:"Restore the measured half-hour slots, vehicle windows and booked load transfer, or supply evidence for the revised sheet."}};
    }
    if(/^[a-f0-9]{40}$/.test(evidenceSha)&&
       git(world,"rev-parse",evidenceSha+":shift-plan.json")===git(world,"rev-parse",sha+":shift-plan.json")){
      return {ok:true,candidate:sha,evidenceSha,power};
    }
  }catch{ /* Unreadable evidence cannot bind a release to this sheet. */ }
  return {ok:false,power,refusal:{reason:"RELEASE_EVIDENCE_MISMATCH",candidate:sha,
    nextAction:basis===r4Basis?"Cite the applicable archived R4 measurement or the full evidence SHA for this revised sheet, then commit the release.":
      "Cite a full evidence SHA for the committed R7 sheet, then commit the release."}};
}
