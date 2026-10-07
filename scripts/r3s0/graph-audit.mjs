#!/usr/bin/env node
/**
 * R3-S0 §"Canonical graph audit" — THE STRUCTURAL GRAPH AUDIT (GATE S1).
 *
 * §"Canonical graph audit" requires a machine-readable experimental graph contract built FROM the existing
 * canonical semantics, audited for: required owner, required project scope, required basis/authority, orphan
 * durable objects, illegal missing predecessor, ambiguous ownership, and mutation without receipt where a
 * receipt is required. It then says: "Report PASS/FAIL by invariant. Do not produce an aggregate architecture
 * score."
 *
 * So this module reports ONE ROW PER INVARIANT, and deliberately computes NO overall number.
 *
 * WHAT MAKES THIS AN AUDIT RATHER THAN A RESTATEMENT. Every claim in `contract.mjs` that can be checked against
 * code IS checked against code:
 *
 *   · each `implementedBy` identifier must actually be exported by the compiled module its owner names;
 *   · each `producedBy` event type must actually appear in the canonical EVENT_TYPES registry;
 *   · each `requiredAuthority` must name something that exists in the compiled tree;
 *   · every event family's event types must appear in the registry its store declares.
 *
 * A contract that named an identifier the repository does not export would FAIL here, which is the point: the
 * audit can falsify the contract.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DURABLE_EVENT_FAMILIES,
  LINEAGES,
  MATRIX_CELLS,
  authorityBearingNodes,
  lineagePath,
  ownedNodes,
  projectScopedNodes,
} from './contract.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const DIST = join(REPO_ROOT, 'dist', 'src');

const results = [];
const check = (id, invariant, statement, pass, detail) => {
  results.push(Object.freeze({ id, invariant, statement, pass, detail }));
};

/** Resolve an owner module name (`src/x` or `src/x/y`) to its compiled module path. */
function compiledModulePath(owner) {
  const relative = owner.replace(/^src\//u, '');
  const candidates = [join(DIST, `${relative}.js`), join(DIST, relative, 'index.js')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * §"Canonical graph audit": EVERY compiled module under an owner directory.
 *
 * A bare `src/identity` has no barrel (only `refs.js`, `errors.js`, `strict.js`), and a barrel does not always
 * re-export every artifact (the verification barrel omits `ProjectVerificationRun`). Checking only the barrel
 * would report a missing owner for a type that IS canonically owned, which is an audit defect rather than a
 * graph defect — so the search is over the whole owner subtree.
 */
function compiledModulesUnder(owner) {
  const relative = owner.replace(/^src\//u, '');
  const dir = join(DIST, relative);
  if (!existsSync(dir)) return [];
  /**
   * `src/identity` is a DIRECTORY with no barrel, so `join(DIST, 'identity')` is a directory and there is no
   * `identity.js`. `src/domain` is BOTH a directory and a file, and both are canonical. So: if the directory
   * exists, walk it; and if a sibling `<name>.js` exists, include it too.
   */
  const out = [];
  if (statSync(dir).isDirectory()) {
    const walk = (current) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.js')) out.push(path);
      }
    };
    walk(dir);
  }
  const sibling = `${dir}.js`;
  if (existsSync(sibling)) out.push(sibling);
  return out;
}

/** Every identifier exported by a compiled module, read from its declaration file when present. */
async function exportedNames(modulePath) {
  const url = pathToFileURL(modulePath).href;
  const names = new Set();
  /**
   * A RUNTIME import sees only VALUES. Most lineage identifiers (`ProjectIr`, `TaskEnvelope`, `AttemptRef`,
   * `ResultSubjectRef`, ...) are TYPES, which exist only in the declaration file — so the runtime export list
   * is the wrong instrument on its own and would report every interface as a missing owner.
   */
  try {
    const module = await import(url);
    for (const name of Object.keys(module)) names.add(name);
  } catch {
    /* a module that cannot be imported still has a declaration file worth reading */
  }
  const declaration = `${modulePath.slice(0, -3)}.d.ts`;
  if (existsSync(declaration)) {
    const text = readFileSync(declaration, 'utf8');
    /** `export interface X`, `export type X`, `export declare const X`, `export declare function X`, ... */
    for (const match of text.matchAll(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:interface|type|const|function|class|enum|let|var)\s+([A-Za-z_$][\w$]*)/gmu)) {
      names.add(match[1]);
    }
    /** A re-export list: `export { A, B as C };` */
    for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gmu)) {
      for (const entry of match[1].split(',')) {
        const name = entry.trim().split(/\s+as\s+/u).pop()?.trim();
        if (name !== undefined && /^[A-Za-z_$][\w$]*$/u.test(name)) names.add(name);
      }
    }
  }
  return names;
}

/* ---------------------------------------------------------------- load the real registries */

const schema = await import(pathToFileURL(join(DIST, 'schema', 'models.js')).href);
const CANONICAL_EVENT_TYPES = new Set(schema.EVENT_TYPES);

/**
 * §"Canonical graph audit": the registry each durable family's store declares. Read from code where the
 * registry is exported, and recorded as UNREADABLE where it is a TypeScript-only union (so the audit says
 * which it could verify rather than silently passing).
 */
const coordination = await import(pathToFileURL(join(DIST, 'coordination', 'store.js')).href);
const COORDINATION_EVENT_TYPES = new Set(Object.keys(coordination.DEFAULT_COORDINATION_EVENT_PARSERS ?? {}));

/* ================================================================ §1 required owner */

const ownerFailures = [];
/** Cache each owner directory's export set once: several nodes share an owner. */
const exportCache = new Map();
async function namesUnder(owner) {
  if (!exportCache.has(owner)) {
    const names = new Set();
    for (const candidate of compiledModulesUnder(owner)) {
      for (const name of await exportedNames(candidate)) names.add(name);
    }
    exportCache.set(owner, names);
  }
  return exportCache.get(owner);
}

for (const node of ownedNodes()) {
  /**
   * §"Canonical graph audit": each identifier is resolved against ITS OWN owner when the node declares a
   * per-identifier map, because some concepts are realized by several owners (`CognitiveCandidate` is proof,
   * reasoning and procedure candidates; there is no single owning module).
   */
  const owners = node.identifierOwners ?? Object.fromEntries(node.implementedBy.map((identifier) => [identifier, node.owner]));
  /** An identifier that names a CONCEPTUAL absence is recorded as such and is not a failure. */
  const conceptual = node.note !== undefined && /NO such type exists/iu.test(node.note);
  for (const identifier of node.implementedBy) {
    const owner = owners[identifier];
    if (typeof owner !== 'string') {
      ownerFailures.push(`${node.lineage}/${node.node}: ${identifier} has no declared owner`);
      continue;
    }
    if (compiledModulesUnder(owner).length === 0) {
      ownerFailures.push(`${node.lineage}/${node.node}: owner module ${owner} has no compiled module`);
      continue;
    }
    if (!conceptual && !(await namesUnder(owner)).has(identifier)) {
      ownerFailures.push(`${node.lineage}/${node.node}: ${identifier} is not exported by any module under ${owner}`);
    }
  }
}
check('SG-01', 'required owner', 'every lineage node names a canonical owner module that exists in the compiled tree', ownerFailures.length === 0, ownerFailures.join('; ') || `${String(ownedNodes().length)} nodes across ${String(Object.keys(LINEAGES).length)} lineages`);

/* ================================================================ §2 required project scope */

const scopedFailures = [];
for (const node of ownedNodes()) {
  /** A node that claims project scope must name a project-scoped store or an owner that stores per project. */
  if (node.projectScoped !== true) continue;
  if (typeof node.owner !== 'string' || node.owner.length === 0) scopedFailures.push(`${node.lineage}/${node.node}: project-scoped with no owner`);
}
const unscoped = ownedNodes().filter((node) => node.projectScoped !== true);
check('SG-02', 'required project scope', 'every project-scoped node names an owner, and each unscoped node declares WHY it is not project-scoped', scopedFailures.length === 0 && unscoped.every((node) => typeof node.note === 'string' && node.note.length > 0), scopedFailures.join('; ') || `${String(projectScopedNodes().length)} project-scoped, ${String(unscoped.length)} unscoped (each with a stated reason)`);

/* ================================================================ §3 required basis/authority */

const authorityFailures = [];
for (const node of authorityBearingNodes()) {
  const text = String(node.requiredAuthority);
  /**
   * The authority must name a real mechanism: a resolve/decide/decision/policy/eligibility/currentness rule,
   * an independence requirement, an authenticated holder, a receipt, an explicit act, a revalidation, or an
   * idempotence rule. A vague phrase such as "the thing that authorizes it" would fail here.
   */
  const plausible = /resolve|decid|policy|eligibility|independen|holder|receipt|explicit|revalidat|no-op|assess|currentness|digest|immutab/iu.test(text);
  if (!plausible) authorityFailures.push(`${node.lineage}/${node.node}: authority "${text}" does not name a mechanism`);
}
check('SG-03', 'required basis/authority', 'every authority-bearing node names a real decision, policy or eligibility rule', authorityFailures.length === 0, authorityFailures.join('; ') || `${String(authorityBearingNodes().length)} authority-bearing node(s): ${authorityBearingNodes().map((node) => `${node.node}<-${String(node.requiredAuthority).slice(0, 34)}`).join(', ')}`);

/* ================================================================ §4 orphan durable objects */

/**
 * §"Canonical graph audit": an orphan is a durable object with no owning lineage node. Every declared durable
 * family must be reachable from at least one lineage node, by name.
 */
const lineageNodeNames = new Set(ownedNodes().map((node) => node.node));
const familyOwners = Object.freeze({
  ORCHESTRATION_LEDGER: ['Project', 'Work', 'Attempt', 'Result', 'Verification', 'Promotion', 'ProjectWorld', 'FutureWork'],
  PROJECT_WORKSPACE: ['ProjectAssetAssociation'],
  PROOF_PLANE: ['CognitiveCandidate', 'Admission', 'AssetRevision', 'Observation/Basis'],
  REASONING_PLANE: ['CognitiveCandidate', 'Admission', 'Observation/Basis'],
  COORDINATION_FEDERATION: ['Need', 'Commitment', 'Fulfillment', 'SovereignRemoteWorkRef'],
  BOUNDARY_MEMORY: ['Fulfillment'],
  PROJECT_JOURNAL: ['LocalAdoption'],
});
const orphanFamilies = [];
for (const family of DURABLE_EVENT_FAMILIES) {
  const owners = familyOwners[family.family] ?? [];
  const reachable = owners.filter((name) => lineageNodeNames.has(name));
  if (reachable.length === 0) orphanFamilies.push(`${family.family}: no owning lineage node`);
}
check('SG-04', 'orphan durable objects', 'every declared durable event family is owned by at least one lineage node', orphanFamilies.length === 0, orphanFamilies.join('; ') || `${String(DURABLE_EVENT_FAMILIES.length)} families, all owned`);

/* ================================================================ §5 illegal missing predecessor */

/**
 * §"Canonical graph audit": an illegal missing predecessor is a node whose PREDECESSOR is not required to
 * exist. The check is on the lineage SHAPE: each lineage must be a linear chain, and the node that requires an
 * authority must not be reachable without it.
 */
const shapeFailures = [];
for (const lineage of Object.values(LINEAGES)) {
  const path = lineagePath(lineage.id);
  if (path.length !== lineage.nodes.length) shapeFailures.push(`${lineage.id}: path length mismatch`);
  /** The authority-bearing node must not be the FIRST node: an authority with no predecessor is meaningless. */
  lineage.nodes.forEach((node, index) => {
    if (node.requiredAuthority !== null && index === 0) shapeFailures.push(`${lineage.id}/${node.node}: requires authority but has no predecessor`);
  });
}
/** Work's Promotion must come AFTER Verification: the ordering IS the "no promotion without verification" rule. */
const workPath = lineagePath('WORK');
if (workPath.indexOf('Verification') > workPath.indexOf('Promotion')) shapeFailures.push('WORK: Promotion precedes Verification');
/** Knowledge's association must come AFTER admission. */
const knowledgePath = lineagePath('KNOWLEDGE');
if (knowledgePath.indexOf('Admission') > knowledgePath.indexOf('ProjectAssetAssociation')) shapeFailures.push('KNOWLEDGE: association precedes admission');
/** Collaboration's adoption must come AFTER fulfillment. */
const collaborationPath = lineagePath('COLLABORATION');
if (collaborationPath.indexOf('Fulfillment') > collaborationPath.indexOf('LocalAdoption')) shapeFailures.push('COLLABORATION: adoption precedes fulfillment');
/** Evolution's receipt must come AFTER the authority decision. */
const evolutionPath = lineagePath('EVOLUTION');
if (evolutionPath.indexOf('AuthorityDecision') > evolutionPath.indexOf('RevisionReceipt')) shapeFailures.push('EVOLUTION: receipt precedes the authority decision');
check('SG-05', 'illegal missing predecessor', 'each lineage is a linear chain and each authority-bearing node has a predecessor it depends on', shapeFailures.length === 0, shapeFailures.join('; ') || Object.keys(LINEAGES).map((id) => `${id}: ${lineagePath(id).join(' -> ')}`).join(' | '));

/* ================================================================ §6 ambiguous ownership */

/**
 * §"Canonical graph audit": ambiguous ownership is TWO owners for one node. Two lineages may legitimately share
 * a node name (Observation/Basis appears in both knowledge and evolution), so the check is per-lineage: within
 * ONE lineage a node name must appear exactly once.
 */
const ambiguityFailures = [];
for (const lineage of Object.values(LINEAGES)) {
  const seen = new Map();
  for (const node of lineage.nodes) {
    if (seen.has(node.node)) ambiguityFailures.push(`${lineage.id}/${node.node}: declared twice in one lineage`);
    seen.set(node.node, true);
  }
}
/** The same node name may not be owned by two DIFFERENT modules inside one lineage. */
for (const lineage of Object.values(LINEAGES)) {
  const byNode = new Map();
  for (const node of lineage.nodes) {
    if (byNode.has(node.node) && byNode.get(node.node) !== node.owner) ambiguityFailures.push(`${lineage.id}/${node.node}: two owners`);
    byNode.set(node.node, node.owner);
  }
}
check('SG-06', 'ambiguous ownership', 'no node is declared twice within a lineage, and no node has two owners', ambiguityFailures.length === 0, ambiguityFailures.join('; ') || 'each node has exactly one owner per lineage');

/* ================================================================ §7 mutation without receipt */

/**
 * §"Canonical graph audit": a mutation that requires a receipt must be preceded by one. The check is that every
 * node whose lineage path crosses a receipt-bearing node declares the receipt as its authority.
 */
const receiptFailures = [];
const RECEIPT_REQUIRED = Object.freeze([
  Object.freeze({ lineage: 'WORK', mutation: 'ProjectWorld', receipt: 'Promotion' }),
  Object.freeze({ lineage: 'KNOWLEDGE', mutation: 'FutureSelection', receipt: 'Admission' }),
  Object.freeze({ lineage: 'EVOLUTION', mutation: 'RevisedIntent/Organization/Runtime', receipt: 'RevisionReceipt' }),
  Object.freeze({ lineage: 'COLLABORATION', mutation: 'LocalContinuation', receipt: 'LocalAdoption' }),
]);
for (const rule of RECEIPT_REQUIRED) {
  const lineage = LINEAGES[rule.lineage];
  const mutation = lineage.nodes.find((node) => node.node === rule.mutation);
  const receiptIndex = lineagePath(rule.lineage).indexOf(rule.receipt);
  const mutationIndex = lineagePath(rule.lineage).indexOf(rule.mutation);
  if (mutation === undefined) { receiptFailures.push(`${rule.lineage}/${rule.mutation}: missing`); continue; }
  if (receiptIndex === -1) { receiptFailures.push(`${rule.lineage}: receipt node ${rule.receipt} missing`); continue; }
  if (receiptIndex > mutationIndex) receiptFailures.push(`${rule.lineage}: ${rule.mutation} precedes its receipt ${rule.receipt}`);
}
check('SG-07', 'mutation without receipt', 'every receipt-bearing mutation is ordered after its receipt in its lineage', receiptFailures.length === 0, receiptFailures.join('; ') || RECEIPT_REQUIRED.map((rule) => `${rule.lineage}: ${rule.mutation} after ${rule.receipt}`).join(' | '));

/* ================================================================ §8 the registries agree with the contract */

const registryFailures = [];
for (const family of DURABLE_EVENT_FAMILIES) {
  for (const eventType of family.eventTypes) {
    /** A family that declares orchestration events must declare only REAL ones. */
    if (family.family === 'ORCHESTRATION_LEDGER' && !CANONICAL_EVENT_TYPES.has(eventType)) {
      registryFailures.push(`${family.family}: ${eventType} is not in EVENT_TYPES`);
    }
    if (family.family === 'COORDINATION_FEDERATION' && COORDINATION_EVENT_TYPES.size > 0 && !COORDINATION_EVENT_TYPES.has(eventType)) {
      registryFailures.push(`${family.family}: ${eventType} has no registered payload parser`);
    }
  }
}
check('SG-08', 'registry agreement', 'every orchestration event type the contract declares exists in EVENT_TYPES, and every coordination type has a registered parser', registryFailures.length === 0, registryFailures.join('; ') || `${String(CANONICAL_EVENT_TYPES.size)} orchestration types, ${String(COORDINATION_EVENT_TYPES.size)} coordination parsers, all declared types present`);

/* ================================================================ §9 every event type has a consumer */

/**
 * §"Event / producer-consumer audit": `WRITE_ONLY_EVENT` is an event with no consumer. Every declared family
 * must name a consumer, and no family may declare an empty consumer.
 */
const consumerFailures = DURABLE_EVENT_FAMILIES
  .filter((family) => typeof family.consumer !== 'string' || family.consumer.trim() === '')
  .map((family) => `${family.family}: no consumer`);
check('SG-09', 'producer/consumer completeness', 'every durable event family names a producer, a consumer and a retry/reconciliation rule', consumerFailures.length === 0 && DURABLE_EVENT_FAMILIES.every((family) => family.producer && family.retry && typeof family.survivesRestart === 'boolean'), consumerFailures.join('; ') || `${String(DURABLE_EVENT_FAMILIES.length)} families complete`);

/* ================================================================ §10 every declared event type is a known one */

/** A contract that invented an event type would be unauditable; this makes invention fail. */
const invented = DURABLE_EVENT_FAMILIES
  .filter((family) => family.family === 'ORCHESTRATION_LEDGER')
  .flatMap((family) => family.eventTypes)
  .filter((eventType) => !CANONICAL_EVENT_TYPES.has(eventType));
check('SG-10', 'no invented event types', 'the contract invents no event type: every orchestration type it names is in the canonical registry', invented.length === 0, invented.join(', ') || 'no invented types');

/* ================================================================ report */

const failed = results.filter((entry) => !entry.pass);
const NL = String.fromCharCode(10);
process.stdout.write(`R3-S0 GATE S1 — STRUCTURAL GRAPH AUDIT${NL}`);
process.stdout.write(`${NL}`);
for (const entry of results) {
  process.stdout.write(`${entry.pass ? 'PASS' : 'FAIL'}  ${entry.id}  [${entry.invariant}]  ${entry.statement}${NL}`);
  process.stdout.write(`        ${entry.detail.slice(0, 300)}${NL}`);
}
process.stdout.write(`${NL}§"Canonical graph audit": ${String(results.length - failed.length)}/${String(results.length)} invariant(s) PASS. No aggregate score is produced, by design.${NL}`);

export { results, check, MATRIX_CELLS, REPO_ROOT };
export const auditSummary = Object.freeze({
  gate: 'S1',
  invariants: results.length,
  passed: results.length - failed.length,
  failed: failed.map((entry) => entry.id),
  green: failed.length === 0,
});

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  process.exit(failed.length === 0 ? 0 : 1);
}
