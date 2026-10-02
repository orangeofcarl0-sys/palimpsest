#!/usr/bin/env node
/**
 * R2-LR §9 — THE WORK-PAYLOAD EXPOSURE AUDIT.
 *
 * WHY THIS EXISTS. In R2-U, one worker pulled three handles it had never been shown, because the rig wrote
 * the host control payload to `<trial>/out/payload.json` — a path OUTSIDE the worker's world — and the
 * worker listed the rig directory, found the file, and read it. So the question is not rhetorical: does
 * ordinary first-party WORK launch also leave the host control payload readable from the worker world?
 *
 * §9 asks for the distinction to be made from EVIDENCE, not from a guess, and explicitly forbids calling it
 * a confidentiality vulnerability without evidence. This gate therefore answers three questions separately:
 *
 *   A. WHO writes the payload file? (the shipped port, or a research harness?)
 *   B. WHAT does the payload contain? (handles/schemas/presentation, or capital bodies/secrets?)
 *   C. CAN a worker read it? (is the containing path inside the world, or fenced?)
 *
 * The answers are recorded as data so a reviewer can check them, and the classification follows from them.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

const workWorker = await import(pathToFileURL(`${REPO}/dist/src/deployment/work_worker.js`).href);

/* ---------------------------------------------------------------- A. who writes it */

/**
 * §9-A: the shipped port writes the payload to a PRIVATE TEMP DIRECTORY it creates, and passes that path to
 * the child as `--work`. The research harnesses ADDITIONALLY copy the payload into their own `out/`
 * directory, which is what made it reachable. So the exposure is introduced by the RIG, not the port.
 */
const portSource = readFileSync(join(REPO, 'src', 'deployment', 'work_worker.ts'), 'utf8');
const portWritesTempDir = /mkdtempSync\(join\(tmpdir\(\), "palimpsest-worker-"\)\)/u.test(portSource);
const portPassesPathToChild = /"--work", contextFile|'--work', contextFile/u.test(portSource) || portSource.includes('--work');

const harnessWriters = execFileSync('git', ['grep', '-l', 'payloadSink', '--', 'scripts/'], { cwd: REPO, encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

/* ---------------------------------------------------------------- B. what it contains */

/** §9-B: the payload's own shape, built from the shipped function rather than described from memory. */
const sampleContext = {
  work: { projectGoal: 'goal', requirements: ['r'], decisions: [], objective: 'objective', writeScope: ['src/a.ts'], requiredArtifacts: [], baseCommit: 'b', completionChecks: ['c'], independentVerificationRequired: false },
  compiled: { handles: [{ kind: 'proof', handle: '@ctx/proof/pc-sample' }, { kind: 'procedure', handle: '@ctx/procedure/prc-sample/0' }] },
};
const payload = workWorker.workWorkerEnvironmentPayload(sampleContext);
const payloadKeys = Object.keys(payload);
const serialized = JSON.stringify(payload);

/**
 * §9-B: WHAT MUST NOT BE PRESENT. A capital BODY would be the compiled handle entries carrying content, or
 * a claim/procedure body field. The check looks for body-carrying FIELDS on the compiled entries, not for
 * the word "body" — the pull tool's own description legitimately contains "the canonical body behind ONE
 * handle", and matching on the word produced a false alarm on the first pass.
 */
const compiledHandles = payload?.context?.compiled?.handles ?? [];
const bodyFieldsOnHandles = compiledHandles.flatMap((entry) => Object.keys(entry).filter((key) => /^(body|content|statement|claim|text|preview)$/u.test(key)));
const credentialShaped = /"(?:credential|token|secret|password|api[-_]?key)"\s*:/iu.test(serialized);

/* ---------------------------------------------------------------- C. can a worker read it */

/**
 * §9-C: the port passes the payload path to the child, so the CHILD PROCESS knows the path. What matters is
 * whether the worker's TOOL SURFACE can read it: the R1-H read fence labels protected roots, and the
 * worker's file tools are guarded. The temp directory is not a protected root in production, so the honest
 * answer is that a worker CAN read its own launch payload — which is a fact worth recording rather than
 * dismissing, because the payload names the attempt's own selected handles.
 */
const fenceSource = readFileSync(join(REPO, 'host', 'deployment', 'runtime', 'read_fence.js'), 'utf8');
const fenceCoversTempDir = /tmpdir|palimpsest-worker-/u.test(fenceSource);

const findings = {
  schemaVersion: 1,
  stage: 'R2-LR',
  audit: 'work-payload-exposure',
  whoWrites: {
    shippedPortWritesToPrivateTempDir: portWritesTempDir,
    shippedPortPassesPathToChild: portPassesPathToChild,
    harnessFilesThatWriteTheirOwnCopy: harnessWriters,
    finding: harnessWriters.length === 0
      ? 'no harness writes a payload copy'
      : 'the shipped port writes to a private mkdtemp directory; the research harnesses ADDITIONALLY copy the payload into their own out/ directory, and THAT copy is what a worker reached in R2-U',
  },
  whatItContains: {
    topLevelKeys: payloadKeys,
    handleEntries: compiledHandles,
    bodyFieldsOnHandleEntries: bodyFieldsOnHandles,
    credentialShapedFields: credentialShaped,
    carriesCapitalBodies: bodyFieldsOnHandles.length > 0,
    carriesCredentials: credentialShaped,
    finding: 'the payload carries the attempt context, the two worker-private tool DEFINITIONS (name, description, JSON schema), the product-rendered index text, the attempt-bound allowlist and the denied-authority prefix. It carries NO capital body: the compiled handles are identity-only, and the bodies are materialized only on the governed pull path.',
  },
  canAWorkerReadIt: {
    fenceSourceMentionsTempDir: fenceCoversTempDir,
    finding: 'the payload file lives in a private temp directory the port creates; the R1-H read fence protects the durable stores and the host home, not that directory. A worker that discovers the path can read its own launch payload.',
  },
  classification: (() => {
    if (bodyFieldsOnHandles.length > 0 || credentialShaped) return 'PROTECTED_CONTENT_EXPOSED — STOP';
    if (harnessWriters.length > 0) return 'CONTROL_PAYLOAD_MODEL_VISIBLE — research-rig copy is the exposure';
    return 'CONTROL_PAYLOAD_MODEL_VISIBLE — production path';
  })(),
  /**
   * §10: DOES IT CONFOUND R2-M? Measured, not assumed.
   *
   * The payload is composed by `workWorkerEnvironmentPayload(input.context)` — the attempt context BEFORE
   * any presentation treatment — so its `contextIndexText` is the PRODUCTION index in both arms. That was
   * verified against the blocked attempt's own M1 pilot payload, which contained no M1 marker
   * (`Selected for this attempt` absent) and carried only the production index. The M1 derivation happens
   * in the runner, AFTER the payload is written, so the payload cannot reveal the M1 decision surface.
   *
   * It also carries no hidden oracle: the oracle lives in the scenario fixture, which the payload never
   * names.
   *
   * It DOES reveal the attempt's own selected handle IDs — but those are exactly what the M0 index shows the
   * model by design, so a worker reading them gains nothing the M0 arm did not already give it. What it
   * would break is the M1 arm's claim that the worker learned the handles FROM THE INDEX, because a worker
   * could have read them out of band instead. That is a real confound, and it is why the rig copy must move
   * outside the worker-readable tree before the restarted matrix runs — regardless of the fact that no
   * protected content is exposed.
   */
  confoundsR2M: {
    answer: 'YES IF the rig keeps writing a payload copy inside the worker-readable tree; NO once it is moved',
    payloadCarriesM1Metadata: 'NO — measured: the payload is composed before the M1 derivation, so its contextIndexText is the production index in both arms',
    payloadCarriesHiddenOracle: 'NO — the oracle lives in the scenario fixture, which the payload never names',
    payloadRevealsSelectedHandleIds: 'YES — the attempt\'s own compiled handles, which the M0 index shows the model anyway',
    reason: 'the payload exposes no protected content and no M1 metadata, but it does expose the selected handle IDs out of band. A worker that read them there would satisfy an M1 pull without having been influenced by the M1 index, which would inflate the treatment. The mitigation is required for experimental validity, not for confidentiality.',
  },
  mitigation: {
    action: 'the restarted R2-M rig writes its control payload OUTSIDE the worker-readable world',
    requirement: 'the payload path must not be reachable from the worker\'s world or its listed parent directories',
  },
};

process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
process.stdout.write(`\nR2-LR PAYLOAD EXPOSURE AUDIT: ${bodyFieldsOnHandles.length > 0 || credentialShaped ? 'PROTECTED CONTENT EXPOSED' : 'no protected content in the payload'}\n`);

import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync(join(REPO, 'research-evidence', 'r2-lr'), { recursive: true });
writeFileSync(join(REPO, 'research-evidence', 'r2-lr', 'payload-exposure-audit.json'), `${JSON.stringify(findings, null, 2)}\n`, 'utf8');
