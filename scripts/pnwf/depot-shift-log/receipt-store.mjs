import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";

// One host owns a desk. Review sessions share a single writable DSH history.
export class ReceiptStore {
  #db;
  #pending=new Map();
  #tail=Promise.resolve();
  #closed=false;
  constructor(path,sourceDigest,{validateKey=key=>/^[a-f0-9]{40}$/.test(key),
    validateReceipt=(receipt,key,source)=>{
      assert.equal(receipt.sha,key);
      assert.equal(receipt.captureDigest,source);
    }}={}){
    this.validateKey=validateKey;
    this.validateReceipt=validateReceipt;
    this.sourceDigest=sourceDigest;
    this.#db=new DatabaseSync(path);
    this.#db.exec("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS receipts (source TEXT NOT NULL, sha TEXT NOT NULL, receipt TEXT NOT NULL, PRIMARY KEY(source,sha))");
  }
  read(sha){
    const row=this.#db.prepare("SELECT receipt FROM receipts WHERE source=? AND sha=?").get(this.sourceDigest,sha);
    return row?JSON.parse(row.receipt):null;
  }
  async request(sha,launch){
    assert(this.validateKey(sha));
    if(this.#closed)throw Error("Review desk closed");
    const saved=this.read(sha);
    if(saved)return saved;
    const running=this.#pending.get(sha);
    if(running)return running.promise;
    const waiting=Promise.withResolvers();
    this.#pending.set(sha,waiting);
    this.#tail=this.#tail.then(async()=>{
      try{
        if(this.#closed)throw Error("Review desk closed");
        await launch(receipt=>{
          if(this.#closed)throw Error("Review desk closed");
          this.validateReceipt(receipt,sha,this.sourceDigest);
          this.#db.prepare("INSERT INTO receipts VALUES(?,?,?) ON CONFLICT(source,sha) DO NOTHING").run(this.sourceDigest,sha,JSON.stringify(receipt));
          const committed=this.read(sha);
          assert.deepEqual(committed,receipt);
          waiting.resolve(committed);
          return committed;
        });
        if(!this.read(sha))throw Error("Review ended without a measurement");
      }catch(error){waiting.reject(error);}
      finally{this.#pending.delete(sha);}
    });
    return waiting.promise;
  }
  async close(cancel){
    this.#closed=true;
    for(const waiting of this.#pending.values())waiting.reject(Error("Review desk closed"));
    try{await cancel?.();await this.#tail;}finally{this.#db.close();}
  }
}
