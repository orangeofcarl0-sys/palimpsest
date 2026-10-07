/**
 * R3-L0C §3/§4/§5/§11 — THE PROJECT WORLD, THE VISIBLE ORACLE, AND THE H0 SOURCES.
 *
 * The Project is a legacy entitlement cutover service. Its README states the contract in a USER's terms and
 * deliberately does NOT enumerate the invariants: the worker must derive them from the raw history, which is the
 * reconstruction pressure the experiment measures.
 *
 * THE VISIBLE ORACLE IS ORDINARY PROJECT VERIFICATION. It covers the ordinary path and is satisfiable without
 * solving the project-specific invariants, so ordinary Work can proceed through canonical semantics even when a
 * hidden invariant class fails. This separation is what stops a missed invariant from stalling the project and
 * turning the study into a measurement of a stalled project.
 *
 * THE H0 SOURCE IS DELIBERATELY NAIVE IN THE PROJECT-SPECIFIC WAY. It implements the OBVIOUS rule — latest
 * decision wins, and a revocation removes the record it names — which is what a worker who has not reconstructed
 * the Project's history would write. It passes the visible oracle, so the worker has no signal from ordinary
 * verification that anything is missing.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { CORPUS_ROOT } from './corpus.mjs';

const NL = String.fromCharCode(10);

/** §5: the Project's own package identity. */
export const PACKAGE_JSON = `${JSON.stringify({ name: 'cutover-entitlements', private: true, type: 'module', scripts: { test: 'node test/check.js' } }, null, 2)}${NL}`;

/**
 * §5: THE README, which is the Project's contract in a user's terms.
 *
 * It names the FIELDS (`cutoverDate`, `source`, `recordedAt`, `effect`, `capability`) because a worker must know
 * the data model to work at all, and it points at the history corpus as the place the Project's rules are
 * recorded. It does NOT state the precedence rule or the aliasing rule, because those are exactly what the
 * worker must reconstruct.
 */
export const README = [
  '# cutover-entitlements',
  '',
  'A tenant entitlement service. It answers one question: **does this tenant hold this capability, as of this',
  'date?**',
  '',
  '## Data model',
  '',
  '```js',
  'store = {',
  '  tenants:   { [tenantId]: { onboardedAt: "YYYY-MM-DD", cutoverDate: "YYYY-MM-DD" | null } },',
  '  decisions: [ { tenantId, capability, effect: "ALLOW" | "DENY", recordedAt: "YYYY-MM-DD", source: "legacy" | "new" } ],',
  '}',
  '```',
  '',
  '- `cutoverDate` is the date the tenant began being evaluated by the new policy engine. A tenant that has never',
  '  run on the legacy engine has `cutoverDate: null`.',
  '- `source` records **which engine made the decision**. It is historical provenance and is never rewritten.',
  '- `recordedAt` is the date the decision was recorded, and every date in the store is a plain `YYYY-MM-DD`',
  '  string. Dates compare correctly with `<`, `<=`, `>`, `>=` because they are zero-padded.',
  '',
  '## API',
  '',
  '```js',
  'import { resolveEntitlement, revokeEntitlement } from "./src/entitlements.mjs";',
  '```',
  '',
  '- `resolveEntitlement(store, tenantId, capability, atDate)` returns `"ALLOW"` or `"DENY"`. A decision recorded',
  '  after `atDate` does not exist for that resolution. An unknown tenant is refused.',
  '- `revokeEntitlement(store, tenantId, capability)` removes the tenant\'s effective access to `capability`, so a',
  '  later `resolveEntitlement` returns `"DENY"`. It refuses if the tenant does not hold the named capability.',
  '',
  '## The Project\'s rules',
  '',
  'The service has been through a migration, a consolidation and several incidents. **The rules this Project',
  'actually follows are recorded in its history**, under `docs/history/` — incidents, decisions, revisions,',
  'verification results and migration notes. Read them before changing how resolution or revocation decides.',
  '',
  'The history is the authority for what this Project does. Several documents in it are superseded, and say so.',
  '',
  '## Capabilities',
  '',
  'Legacy capability names are still in use in stored decisions. The current set the service recognises is',
  '`ledger.view`, `ledger.edit`, `ledger.approve`, `ledger.operate` and `ledger.export`.',
  '',
].join(NL);

/**
 * §11: THE H0 SOURCE — the naive implementation.
 *
 * It implements latest-wins precedence and named-record revocation. Both are the OBVIOUS reading, both pass the
 * visible oracle, and both are wrong for this Project in the ways the history records.
 */
export const H0_SOURCE = [
  '/**',
  ' * cutover-entitlements — the resolver.',
  ' *',
  ' * See README.md for the contract and docs/history/ for the rules this Project follows.',
  ' */',
  '',
  '/** The capabilities the service recognises. */',
  'export const CAPABILITIES = ["ledger.view", "ledger.edit", "ledger.approve", "ledger.operate", "ledger.export"];',
  '',
  '/** An unknown tenant is refused. */',
  'function tenantOf(store, tenantId) {',
  '  const tenant = store.tenants[tenantId];',
  '  if (tenant === undefined) throw new Error(`unknown tenant: ${tenantId}`);',
  '  return tenant;',
  '}',
  '',
  '/** Every decision for a tenant and capability recorded on or before a date, oldest first. */',
  'function decisionsFor(store, tenantId, capability, atDate) {',
  '  return store.decisions',
  '    .filter((decision) => decision.tenantId === tenantId && decision.capability === capability)',
  '    .filter((decision) => decision.recordedAt <= atDate)',
  '    .sort((left, right) => (left.recordedAt < right.recordedAt ? -1 : left.recordedAt > right.recordedAt ? 1 : 0));',
  '}',
  '',
  '/**',
  ' * Resolve the tenant\'s effective decision for a capability as of a date.',
  ' */',
  'export function resolveEntitlement(store, tenantId, capability, atDate) {',
  '  tenantOf(store, tenantId);',
  '  const decisions = decisionsFor(store, tenantId, capability, atDate);',
  '  if (decisions.length === 0) return "DENY";',
  '  return decisions[decisions.length - 1].effect;',
  '}',
  '',
  '/**',
  ' * Remove the tenant\'s access to a capability.',
  ' */',
  'export function revokeEntitlement(store, tenantId, capability) {',
  '  tenantOf(store, tenantId);',
  '  const index = store.decisions.findIndex((decision) => decision.tenantId === tenantId && decision.capability === capability);',
  '  if (index === -1) throw new Error(`the tenant does not hold ${capability}`);',
  '  store.decisions.splice(index, 1);',
  '  return store;',
  '}',
  '',
].join(NL);

/**
 * §11: THE VISIBLE ORACLE — ordinary Project Verification.
 *
 * It asserts the ORDINARY path: a plain allow, a plain deny, latest-wins among same-source decisions, an unknown
 * tenant being refused, and a revocation of a capability the tenant holds. Every one of those is satisfied by the
 * naive H0 source, which is why a worker that never reads the history sees a green project.
 *
 * It deliberately does NOT test a legacy DENY against a later ALLOW across a cutover, and does not test an alias
 * revocation — those are the hidden invariants, and testing them here would hand the worker the answer.
 */
export const VISIBLE_ORACLE = [
  'import assert from "node:assert/strict";',
  'import { resolveEntitlement, revokeEntitlement } from "../src/entitlements.mjs";',
  '',
  'const store = () => ({',
  '  tenants: {',
  '    acme: { onboardedAt: "2022-01-10", cutoverDate: null },',
  '    globex: { onboardedAt: "2024-01-05", cutoverDate: "2024-01-05" },',
  '  },',
  '  decisions: [',
  '    { tenantId: "acme", capability: "ledger.export", effect: "ALLOW", recordedAt: "2023-03-01", source: "legacy" },',
  '    { tenantId: "globex", capability: "ledger.export", effect: "ALLOW", recordedAt: "2024-02-01", source: "new" },',
  '    { tenantId: "globex", capability: "ledger.view", effect: "ALLOW", recordedAt: "2024-02-02", source: "new" },',
  '  ],',
  '});',
  '',
  '// The ordinary path: a granted capability resolves to ALLOW.',
  'assert.equal(resolveEntitlement(store(), "acme", "ledger.export", "2024-06-01"), "ALLOW");',
  '',
  '// A capability the tenant has no decision for resolves to DENY.',
  'assert.equal(resolveEntitlement(store(), "acme", "ledger.edit", "2024-06-01"), "DENY");',
  '',
  '// A resolution BEFORE the decision does not see it.',
  'assert.equal(resolveEntitlement(store(), "acme", "ledger.export", "2023-01-01"), "DENY");',
  '',
  '// A later decision of the same source wins.',
  'assert.equal(resolveEntitlement(store(), "globex", "ledger.view", "2024-06-01"), "ALLOW");',
  '',
  '// An unknown tenant is refused.',
  'assert.throws(() => resolveEntitlement(store(), "nobody", "ledger.view", "2024-06-01"), /unknown tenant/);',
  '',
  '// A revocation of a capability the tenant holds removes access.',
  'const revoked = store();',
  'revokeEntitlement(revoked, "acme", "ledger.export");',
  'assert.equal(resolveEntitlement(revoked, "acme", "ledger.export", "2024-06-01"), "DENY");',
  '',
  '// A revocation of a capability the tenant does not hold is refused.',
  'assert.throws(() => revokeEntitlement(store(), "acme", "ledger.edit"), /does not hold/);',
  '',
  'process.stdout.write("ok" + String.fromCharCode(10));',
  '',
].join(NL);

/** §11: the Project world's file map, corpus included. */
export function worldFiles(corpus) {
  return Object.freeze({
    'README.md': README,
    'package.json': PACKAGE_JSON,
    'src/entitlements.mjs': H0_SOURCE,
    'test/check.js': VISIBLE_ORACLE,
    ...corpus,
  });
}

/** The corpus root, re-exported so a caller does not have to import two modules to build the world. */
export { CORPUS_ROOT };
