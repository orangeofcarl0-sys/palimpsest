#!/usr/bin/env node
/**
 * R2-U §2 — CAPACITY-SLOT RELIABILITY PREFLIGHT.
 *
 * R2-U runs 40 sequential stochastic workers, each in its own host process, each taking the R1-HC
 * confidential-capacity slot. The slot is HOST-LOCAL and noncanonical (it carries no semantics and no
 * Work reads it), but it is load-bearing for the experiment: if a killed worker left the slot held, the
 * next trial would be refused and the matrix would collect capacity refusals instead of measurements.
 *
 * So this preflight measures the slot's crash contract directly, in separate OS processes, BEFORE any
 * trial runs:
 *
 *   SLOT-01  acquire grants when nothing is held
 *   SLOT-02  a second acquire while one is held is refused (max ACTIVE = 1)
 *   SLOT-03  release frees the slot for the next process
 *   SLOT-04  a holder killed WITHOUT release leaves a stale record, and a FRESH host recovers it
 *   SLOT-05  a live recorded pid is NOT stolen (a running worker keeps its slot)
 *   SLOT-06  a malformed record does not block work forever
 *   SLOT-07  a record older than the staleness bound is recovered
 *   SLOT-08  a same-process double acquire is refused rather than double-counted
 *
 * Only the module under test is exercised; nothing here is a product component.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const SLOT_MODULE = join(REPO, 'host', 'deployment', 'runtime', 'confidential_profile.js');
const RIG = join(homedir(), '.palimpsest-r2u', 'slot-preflight');
if (existsSync(RIG)) rmSync(RIG, { recursive: true, force: true });
mkdirSync(RIG, { recursive: true });

const NL = String.fromCharCode(10);
const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${statement} — ${detail}${NL}`);
};

const profile = await import(pathToFileURL(SLOT_MODULE).href);
const slotPathFor = (home) => join(home, 'confidential-workers', 'active.json');
const readSlot = (home) => {
  try {
    return JSON.parse(readFileSync(slotPathFor(home), 'utf8'));
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------- SLOT-01…03, 08 in-process */

process.stdout.write(`--- §2 the slot's ordinary lifecycle ---${NL}`);
const homeA = join(RIG, 'home-a');
const slotA = profile.openConfidentialSlot({ home: homeA });
const first = slotA.acquire();
check('SLOT-01', 'acquire grants when nothing is held', first.granted === true, first.detail);

const second = slotA.acquire();
check('SLOT-02', 'a second acquire while one is held is refused (max ACTIVE = 1)', second.granted === false, second.detail);
check(
  'SLOT-08',
  'the refusal names the profile and states that no attempt was failed',
  typeof second.detail === 'string' && second.detail.includes('HOST CAPACITY') && second.detail.includes('no attempt was failed'),
  String(second.detail).slice(0, 170),
);

slotA.release();
check('SLOT-03', 'release frees the slot for the next process', slotA.acquire().granted === true, readSlot(homeA) === null ? 'slot file empty' : `holders=${String((readSlot(homeA)?.holders ?? []).length)}`);
slotA.release();

/* ---------------------------------------------------------------- SLOT-04 crash recovery */

process.stdout.write(`${NL}--- §2 a killed holder, recovered by a fresh host ---${NL}`);

/**
 * A CHILD PROCESS holds the slot and is KILLED with SIGKILL, so no `finally` and no `release()` runs.
 * That is the failure the preflight exists to catch: a host that dies mid-trial must not strand the slot.
 */
const homeB = join(RIG, 'home-b');
const holderScript = join(RIG, 'holder.mjs');
writeFileSync(
  holderScript,
  [
    `import { pathToFileURL } from 'node:url';`,
    `const profile = await import(pathToFileURL(${JSON.stringify(SLOT_MODULE)}).href);`,
    `const slot = profile.openConfidentialSlot({ home: ${JSON.stringify(homeB)} });`,
    `const acquired = slot.acquire();`,
    `process.stdout.write('HOLDER ' + JSON.stringify(acquired) + String.fromCharCode(10));`,
    `setTimeout(() => {}, 600000);`,
    '',
  ].join(NL),
  'utf8',
);

const holder = spawn(process.execPath, [holderScript], { stdio: ['ignore', 'pipe', 'pipe'] });
const holderOut = await new Promise((resolve) => {
  let text = '';
  holder.stdout.on('data', (chunk) => {
    text += chunk.toString();
    if (text.includes('HOLDER ')) resolve(text);
  });
  setTimeout(() => resolve(text), 15000);
});
const holderPid = holder.pid;
const holderAcquired = holderOut.includes('"granted":true');
check('SLOT-04a', 'a child process acquires the slot', holderAcquired, holderOut.trim().split(NL).pop()?.slice(0, 140) ?? 'no output');

/** While that child is ALIVE its slot must not be stolen — SLOT-05. */
const homeBLive = profile.openConfidentialSlot({ home: homeB });
const stealAttempt = homeBLive.acquire();
check(
  'SLOT-05',
  'a LIVE recorded pid is not stolen (a running worker keeps its slot)',
  stealAttempt.granted === false,
  `${stealAttempt.granted ? 'STOLEN — a second worker would run concurrently' : 'refused while the holder is alive'}; holders=${JSON.stringify((readSlot(homeB)?.holders ?? []).map((entry) => entry.pid))}`,
);

/** Now kill it WITHOUT a release and confirm a FRESH host recovers. */
holder.kill('SIGKILL');
await new Promise((resolve) => setTimeout(resolve, 1200));
const homeBAfter = profile.openConfidentialSlot({ home: homeB });
const recovered = homeBAfter.acquire();
check(
  'SLOT-04b',
  'a holder killed without release leaves a stale record that a FRESH host recovers',
  recovered.granted === true,
  `killed pid ${String(holderPid)}; fresh acquire granted=${String(recovered.granted)}; detail=${String(recovered.detail).slice(0, 130)}`,
);
homeBAfter.release();

/* ---------------------------------------------------------------- SLOT-06 malformed, SLOT-07 stale */

process.stdout.write(`${NL}--- §2 malformed and stale records ---${NL}`);
const homeC = join(RIG, 'home-c');
mkdirSync(join(homeC, 'confidential-workers'), { recursive: true });

writeFileSync(slotPathFor(homeC), JSON.stringify({ holders: [{ pid: 'not-a-number', at: Date.now() }], profile: 'windows-confidential-single-active' }), 'utf8');
const malformed = profile.openConfidentialSlot({ home: homeC }).acquire();
check('SLOT-06', 'a malformed record does not block work forever', malformed.granted === true, `granted=${String(malformed.granted)} (a record without a usable pid is not evidence of a live worker)`);
profile.openConfidentialSlot({ home: homeC }).release();

const homeD = join(RIG, 'home-d');
mkdirSync(join(homeD, 'confidential-workers'), { recursive: true });
/** A record whose pid is THIS process (so it is alive) but whose timestamp is far beyond the bound. */
writeFileSync(slotPathFor(homeD), JSON.stringify({ holders: [{ pid: process.pid, at: Date.now() - 24 * 60 * 60 * 1000 }], profile: 'windows-confidential-single-active' }), 'utf8');
const stale = profile.openConfidentialSlot({ home: homeD, staleAfterMs: 60 * 60 * 1000 }).acquire();
check('SLOT-07', 'a record older than the staleness bound is recovered', stale.granted === true, `granted=${String(stale.granted)}; the bound keeps a reused pid from blocking work indefinitely`);

/* ---------------------------------------------------------------- report */

const passed = results.filter((entry) => entry.pass).length;
const failed = results.filter((entry) => !entry.pass);
process.stdout.write(`${NL}R2-U §2 CAPACITY-SLOT PREFLIGHT: ${failed.length === 0 ? 'PASS' : 'FAIL'} — ${String(passed)}/${String(results.length)}${NL}`);
writeFileSync(join(RIG, 'slot-preflight.json'), JSON.stringify({ schemaVersion: 1, passed, total: results.length, results }, null, 2), 'utf8');
process.stdout.write(`record: ${join(RIG, 'slot-preflight.json')}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
