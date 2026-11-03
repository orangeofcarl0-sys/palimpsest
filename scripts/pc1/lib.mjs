/**
 * PC1 S08 — shared staging helpers for the two evaluation scenarios.
 *
 * These helpers copy visible material, stage arrivals by simulation time, compute digests, and
 * compare P/F facts. They never read `evaluator-only`, never write an expected answer, and never
 * call a model.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(path) {
  return sha256(readFileSync(path));
}

export function walkFiles(root, base = root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root).sort()) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walkFiles(full, base));
    else out.push(relative(base, full).replace(/\\/gu, "/"));
  }
  return out;
}

export function treeDigest(root) {
  const lines = walkFiles(root).map((path) => `${path}\u0000${sha256File(join(root, path))}`);
  return sha256(`${lines.join("\n")}\n`);
}

export function visibleSetDigest(root) {
  if (!existsSync(root)) return sha256("");
  return treeDigest(root);
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

export function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

/**
 * Stage the update files whose arrival time is at or before `at`. The source root is the scenario's
 * visible/updates tree; the destination is the project's inbox. A future file is never copied.
 */
export function stageUpdates(input) {
  const copied = [];
  for (const event of input.timeline.events) {
    if (Date.parse(event.arrivedAt) > Date.parse(input.at)) continue;
    for (const path of event.paths) {
      const from = resolve(input.visibleRoot, path.replace(/^visible\//u, ""));
      const to = join(input.inbox, path.replace(/^visible\//u, ""));
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to, { recursive: true });
      copied.push({ event: event.id, path, standing: event.standing, arrivedAt: event.arrivedAt, sha256: sha256File(to) });
    }
  }
  return copied;
}

/**
 * Compare two fact maps by digest. A confounder is any key whose values differ, or any key present on
 * one side only. An empty list is the only clean result.
 */
export function compareFacts(left, right) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const confounders = [];
  for (const key of keys) {
    if (!(key in left)) {
      confounders.push({ key, detail: "present only on the F side" });
      continue;
    }
    if (!(key in right)) {
      confounders.push({ key, detail: "present only on the P side" });
      continue;
    }
    if (left[key] !== right[key]) confounders.push({ key, detail: `${String(left[key])} != ${String(right[key])}` });
  }
  return confounders;
}

export function factDigest(value) {
  return sha256(JSON.stringify(value));
}
