/** Read-only supervision at the work order's request checkpoint. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { readJson } from "../../energy/contract.mjs";

export const supervisionAt = 128;

function observe({ directory, basis, accounting }) {
  let git = null, observationError = null;
  try {
    const settled = join(directory, "submission-facts.json");
    if (existsSync(settled)) {
      const { submission } = readJson(settled);
      git = { head: submission.candidate, committedProgress: submission.valid && submission.candidate !== basis,
        partialWork: Boolean(submission.status) };
    } else {
      const info = readJson(join(directory, "out", "MAINTAIN", "qualification.json"));
      if (info.status !== "EVALUATION_ISOLATION_QUALIFIED" || !/^[0-9a-f]{64}$/u.test(info.containerId)) {
        throw new Error("Session container unavailable");
      }
      const command = (...args) => execFileSync("docker", ["exec", "--user", "1001:1001", "-e", "GIT_OPTIONAL_LOCKS=0",
        info.containerId, "git", "-C", "/run/stage/world", ...args],
      { encoding: "utf8", windowsHide: true, timeout: 8_000 }).trim();
      const head = command("rev-parse", "HEAD");
      git = { head, committedProgress: head !== basis, partialWork: Boolean(command("status", "--porcelain")) };
    }
  } catch (error) { observationError = error.message.split("\n", 1)[0]; }
  const decision = accounting.unknown > 0 ? "UPSTREAM_ACCOUNTING_STOP"
    : git?.committedProgress || git?.partialWork ? "CONTINUE_WITH_PROGRESS" : "CONTINUE_WITHOUT_CONFIRMED_GIT_PROGRESS";
  return { state: "OBSERVED", git, observationError, decision };
}

if (!isMainThread && workerData?.observeRequestCheckpoint) parentPort.postMessage(observe(workerData.observeRequestCheckpoint));

/** The checkpoint observes progress and leaves the request ledger's hard limit in force. */
export async function superviseRequestCheckpoint({ directory, binding, usedBefore, receiptPath, publish }, run) {
  const ledger = join(directory, "request-ledger.sqlite");
  let review;
  const check = () => {
    if (review || existsSync(receiptPath) || !existsSync(ledger)) return;
    const db = new DatabaseSync(ledger, { readOnly: true });
    let totals;
    try {
      totals = db.prepare("SELECT count(*) AS admitted, count(*) FILTER (WHERE state='UNKNOWN') AS unknown FROM requests").get();
    } catch (error) {
      if (!/no such table: requests|database is locked/u.test(error.message)) throw error;
      return;
    } finally { db.close(); }
    const admitted = usedBefore + totals.admitted;
    if (admitted < supervisionAt) return;
    const accounting = { ...totals, admitted, usedBefore };
    review = new Promise(resolve => {
      const worker = new Worker(new URL(import.meta.url),
        { workerData: { observeRequestCheckpoint: { directory, basis: binding.basis, accounting } } });
      worker.once("message", resolve);
      worker.once("error", error => resolve({ state: "ERROR", reason: error.message }));
      worker.once("exit", code => resolve({ state: "ERROR", reason: "Supervisor exited with " + code }));
    }).then(result => publish(receiptPath, { ...binding, threshold: supervisionAt, accounting, ...result }));
  };
  const observeLedger = () => {
    try { check(); }
    catch (error) { console.warn("Request supervision could not read the ledger:", error.message); }
  };
  const timer = setInterval(observeLedger, 1000);
  try { return await run(); }
  finally {
    clearInterval(timer);
    observeLedger();
    try { await review; }
    catch (error) { console.warn("Request supervision could not save its receipt:", error.message); }
  }
}
