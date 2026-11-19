import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import test from "node:test";
import {readJson} from "../energy/contract.mjs";
import {ReceiptStore} from "./receipt-store.mjs";

const archive=new URL("../../../research-evidence/pnwf-task-selection/2026-11-19/depot-shift-log/live/P/",import.meta.url);
const journal=readJson(new URL("desk/journal.json",archive));
const calls=readJson(new URL("trajectory.json",archive)).traces.find(t=>t.role==="principal").calls;
const original=calls.find(c=>c.seq===75),retry=calls.find(c=>c.seq===81);
const event=journal.find(e=>e.kind==="PEER_TRIAL"),receipt=event.receipt;
test("the timed-out call and busy retry share the measured SHA across running review and restart",async()=>{
  assert.equal(original.reply,"Error: fetch failed");assert.match(retry.reply,/busy/);
  assert.equal(original.input.sha,retry.input.sha);assert.equal(retry.input.sha,receipt.sha);
  assert(Date.parse(event.at)<retry.at);
  const tmp=mkdtempSync(join(tmpdir(),"duty-store-")),file=join(tmp,"receipts.sqlite");
  const store=new ReceiptStore(file,receipt.captureDigest);
  const measured=Promise.withResolvers(),finished=Promise.withResolvers();let launches=0;
  const review=async publish=>{launches++;await measured.promise;publish(receipt);await finished.promise;};
  try{
    const lost=store.request(original.input.sha,review);
    const joined=store.request(retry.input.sha,review);
    await Promise.resolve();assert.equal(launches,1);assert.equal(store.read(receipt.sha),null);
    measured.resolve();assert.deepEqual(await lost,receipt);assert.deepEqual(await joined,receipt);
    assert.deepEqual(await store.request(retry.input.sha,review),receipt);
    const reopened=new ReceiptStore(file,receipt.captureDigest);
    try{assert.deepEqual(await reopened.request(retry.input.sha,review),receipt);}finally{await reopened.close();}
    assert.equal(launches,1);
    assert.equal(store.read("0".repeat(40)),null);
    const anotherSource=new ReceiptStore(file,"f".repeat(64));
    try{assert.equal(anotherSource.read(receipt.sha),null);}finally{await anotherSource.close();}
  }finally{finished.resolve();await store.close();rmSync(tmp,{recursive:true,force:true});}
});
test("a failed review cannot poison the next retry or file another SHA",async()=>{
  const store=new ReceiptStore(":memory:",receipt.captureDigest);
  try{
    await assert.rejects(store.request(receipt.sha,async()=>{}),/without a measurement/);
    await assert.rejects(store.request(receipt.sha,async publish=>publish({...receipt,sha:"0".repeat(40)})));
    assert.equal(store.read(receipt.sha),null);
    assert.deepEqual(await store.request(receipt.sha,async publish=>publish(receipt)),receipt);
  }finally{await store.close();}
});
