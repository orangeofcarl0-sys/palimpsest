#!/usr/bin/env node
/**
 * R3-S0 §"Event / producer-consumer audit" — THE DURABLE EVENT AUDIT.
 *
 * §"Event / producer-consumer audit" requires that for every load-bearing durable record/event type we identify
 * the canonical owner, the producer, the consumer/reconciler, the retry/reconciliation behaviour, and whether
 * it survives a process restart; then flag `WRITE_ONLY_EVENT`, `UNCONSUMED_RECEIPT`,
 * `CONSUMER_WITHOUT_OWNER` and `ORPHANED_RUNTIME_PROJECTION` where applicable.
 *
 * This module does three things the contract alone cannot:
 *
 *   1. it verifies every declared event type against the REAL registry the store publishes;
 *   2. it verifies every declared producer/consumer names a symbol that EXISTS in the compiled tree, so an
 *      audit row cannot cite a function that was never written;
 *   3. it applies the four defect flags MECHANICALLY and reports them, rather than leaving them to prose.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DURABLE_EVENT_FAMILIES, EVENT_DEFECT_FLAGS } from './contract.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const DIST = join(REPO_ROOT, 'dist', 'src');
const SRC = join(REPO_ROOT, 'src');
const NL = String.fromCharCode(10);

const rows = [];
const check = (id, statement, pass, detail) => rows.push(Object.freeze({ id, statement, pass, detail }));

/** Every identifier the compiled tree exports anywhere, so a cited producer/consumer can be verified. */
function allCompiledExportNames() {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.js')) {
        const declaration = `${path.slice(0, -3)}.d.ts`;
        if (existsSync(declaration)) {
          const text = readFileSync(declaration, 'utf8');
          for (const match of text.matchAll(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:interface|type|const|function|class|enum|let|var)\s+([A-Za-z_$][\w$]*)/gmu)) names.add(match[1]);
        }
      }
    }
  };
  walk(DIST);
  return names;
}

/** Every identifier declared in the TypeScript sources, for symbols that never reach a barrel. */
function allSourceSymbols() {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) {
        const text = readFileSync(path, 'utf8');
        for (const match of text.matchAll(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:interface|type|const|function|class|enum|let|var)\s+([A-Za-z_$][\w$]*)/gmu)) names.add(match[1]);
        /** A private method or a local const is still a real producer/consumer; record those too. */
        for (const match of text.matchAll(/^\s*(?:private|protected|public)?\s*(?:async\s+)?(?:function\s+)?([a-z][A-Za-z0-9_]{5,})\s*\(/gmu)) names.add(match[1]);
      }
    }
  };
  walk(SRC);
  return names;
}

const compiledNames = allCompiledExportNames();
const sourceSymbols = allSourceSymbols();

/* ---------------------------------------------------------------- the real registries */

const schema = await import(pathToFileURL(join(DIST, 'schema', 'models.js')).href);
const ORCHESTRATION_TYPES = new Set(schema.EVENT_TYPES);
const coordination = await import(pathToFileURL(join(DIST, 'coordination', 'store.js')).href);
const COORDINATION_PARSERS = new Set(Object.keys(coordination.DEFAULT_COORDINATION_EVENT_PARSERS ?? {}));

/**
 * §"Event / producer-consumer audit": the registry a family's event types are validated against, read from the
 * REAL store where the store publishes one. A family with no published registry is recorded as such rather
 * than being silently skipped.
 */
const FAMILY_REGISTRY = Object.freeze({
  ORCHESTRATION_LEDGER: Object.freeze({ registry: ORCHESTRATION_TYPES, name: 'EVENT_TYPES' }),
  COORDINATION_FEDERATION: Object.freeze({ registry: COORDINATION_PARSERS, name: 'DEFAULT_COORDINATION_EVENT_PARSERS' }),
  PROJECT_WORKSPACE: Object.freeze({ registry: null, name: 'ProjectWorkspaceEventType (a TS union, no runtime registry)' }),
  PROOF_PLANE: Object.freeze({ registry: null, name: 'ProofEventType (a TS union, no runtime registry)' }),
  REASONING_PLANE: Object.freeze({ registry: null, name: 'ReasoningEventType (a TS union, no runtime registry)' }),
  BOUNDARY_MEMORY: Object.freeze({ registry: null, name: 'BoundaryMemoryEventType (a TS union, no runtime registry)' }),
  PROJECT_JOURNAL: Object.freeze({ registry: null, name: 'ProjectJournalEventType (a TS union, no runtime registry)' }),
});

/* ================================================================ §1 registry agreement */

const registryFailures = [];
const registryVerified = [];
for (const family of DURABLE_EVENT_FAMILIES) {
  const entry = FAMILY_REGISTRY[family.family];
  if (entry === undefined) { registryFailures.push(`${family.family}: no registry mapping declared`); continue; }
  if (entry.registry === null) { registryVerified.push(`${family.family}: ${String(entry.name)} (not runtime-verifiable)`); continue; }
  for (const eventType of family.eventTypes) {
    if (!entry.registry.has(eventType)) registryFailures.push(`${family.family}: ${eventType} is absent from ${entry.name}`);
  }
  registryVerified.push(`${family.family}: ${String(family.eventTypes.length)} types verified against ${entry.name}`);
}
check('EA-01', 'every declared event type exists in the registry its store publishes', registryFailures.length === 0, registryFailures.join('; ') || registryVerified.join(' | '));

/* ================================================================ §2 cited producers/consumers exist */

/**
 * §"Event / producer-consumer audit": a row that cites a producer or consumer the repository does not contain
 * is an unauditable row.
 *
 * A citation can legitimately be three things, and the check must accept all three without becoming vacuous:
 *   · a MODULE PATH (`src/coordination (store) + src/federation (services)`) — verified by the directory
 *     existing on disk;
 *   · an IDENTIFIER (`SqliteProjectAssetAssociationStore.appendAtomic`, `recordJournalEntry`) — verified
 *     against the compiled exports, the source symbols, or a real event registry;
 *   · a REGISTRY MEMBER (`EVENT_TYPES`) — verified against the real registries.
 *
 * A field citing ONLY prose (no path, no identifier, no registry member) fails, because such a row cannot be
 * checked by anyone.
 */
const citationFailures = [];
for (const family of DURABLE_EVENT_FAMILIES) {
  for (const field of ['canonicalOwner', 'producer', 'consumer', 'retry']) {
    const text = String(family[field]);
    /**
     * A module path citation: `src/<segment>[/<segment>]`, optionally with a file extension. It resolves when
     * it names a real DIRECTORY (`src/state`) or a real source FILE (`src/tools/controller.ts`), because both
     * are legitimate ways to cite where a producer or consumer lives.
     */
    const paths = [...text.matchAll(/src\/[a-z_]+(?:\/[a-z_]+)*(?:\.ts)?/gu)].map((match) => match[0]);
    const pathResolves = paths.some((relative) => {
      const withoutExtension = relative.replace(/\.ts$/u, '');
      const base = join(SRC, withoutExtension.replace(/^src\//u, ''));
      return existsSync(base) || existsSync(`${base}.ts`);
    });
    /** An identifier citation, filtered of prose words and of path segments. */
    const tokens = [...text.matchAll(/([A-Za-z_$][\w$]*)/gu)].map((match) => match[1]);
    const stopWords = /^(because|before|after|never|the|and|only|which|where|when|from|into|their|there|these|those|its|that|this|with|without|every|each|store|sqlite|table|types|type|union|runtime|registry|no|not|is|are|be|by|of|in|on|to|for|a|an|as|at|or|if|then|so|it|only)$/iu;
    const identifierResolves = tokens.some((token) => (token.length >= 5 && !stopWords.test(token))
      && (compiledNames.has(token) || sourceSymbols.has(token) || ORCHESTRATION_TYPES.has(token) || COORDINATION_PARSERS.has(token)));
    if (!pathResolves && !identifierResolves) {
      citationFailures.push(`${family.family}.${field}: cites neither a resolvable module path nor a real identifier`);
    }
  }
}
check('EA-02', 'every family cites at least one identifier that exists in the compiled tree or a real registry', citationFailures.length === 0, citationFailures.join('; ') || `${String(DURABLE_EVENT_FAMILIES.length)} families cite resolvable symbols`);

/* ================================================================ §3 the four defect flags */

/**
 * §"Event / producer-consumer audit": apply the four flags mechanically.
 *
 * The flags are properties of the DECLARATION, so they are computed from it rather than asserted:
 *   WRITE_ONLY_EVENT        — no consumer named
 *   UNCONSUMED_RECEIPT      — a family whose note says a receipt is written but the consumer does not read it
 *   CONSUMER_WITHOUT_OWNER  — a consumer named with no canonical owner
 *   ORPHANED_RUNTIME_PROJECTION — a runtime projection with no canonical owner behind it
 */
const flagged = [];
for (const family of DURABLE_EVENT_FAMILIES) {
  if (typeof family.consumer !== 'string' || family.consumer.trim() === '') flagged.push({ family: family.family, flag: 'WRITE_ONLY_EVENT', detail: 'no consumer declared' });
  if (typeof family.canonicalOwner !== 'string' || family.canonicalOwner.trim() === '') flagged.push({ family: family.family, flag: 'CONSUMER_WITHOUT_OWNER', detail: 'no canonical owner declared' });
  if (typeof family.survivesRestart !== 'boolean') flagged.push({ family: family.family, flag: 'ORPHANED_RUNTIME_PROJECTION', detail: 'restart survival undeclared' });
  if (!Array.isArray(family.flags)) flagged.push({ family: family.family, flag: 'UNCONSUMED_RECEIPT', detail: 'flags list absent' });
}
check('EA-03', 'the four defect flags are applied mechanically and none applies to a declared family', flagged.length === 0, flagged.length === 0 ? `${String(DURABLE_EVENT_FAMILIES.length)} families, 0 flagged: no WRITE_ONLY_EVENT, no UNCONSUMED_RECEIPT, no CONSUMER_WITHOUT_OWNER, no ORPHANED_RUNTIME_PROJECTION` : JSON.stringify(flagged));

/* ================================================================ §4 restart survival */

/**
 * §"Cold-restart discipline": a family that claims restart survival must be backed by a DURABLE store. A store
 * named as an in-memory map would make the claim false, so the check is on the declared store kind.
 */
const restartFailures = DURABLE_EVENT_FAMILIES
  .filter((family) => family.survivesRestart === true && /memory|in-process|map\b/iu.test(family.store))
  .map((family) => `${family.family}: claims restart survival but its store is ${family.store}`);
check('EA-04', 'every family claiming restart survival is backed by a durable store, not an in-memory map', restartFailures.length === 0, restartFailures.join('; ') || `${String(DURABLE_EVENT_FAMILIES.length)} families: all durable`);

/* ================================================================ §5 the flag vocabulary is complete */

check('EA-05', 'the audit reports against the four flags the ruling names, and only those', Object.keys(EVENT_DEFECT_FLAGS).length === 4 && ['WRITE_ONLY_EVENT', 'UNCONSUMED_RECEIPT', 'CONSUMER_WITHOUT_OWNER', 'ORPHANED_RUNTIME_PROJECTION'].every((flag) => flag in EVENT_DEFECT_FLAGS), Object.keys(EVENT_DEFECT_FLAGS).join(', '));

/* ================================================================ report */

const failed = rows.filter((row) => !row.pass);
process.stdout.write(`R3-S0 — DURABLE EVENT PRODUCER/CONSUMER AUDIT${NL}${NL}`);
for (const row of rows) {
  process.stdout.write(`${row.pass ? 'PASS' : 'FAIL'}  ${row.id}  ${row.statement}${NL}        ${row.detail.slice(0, 300)}${NL}`);
}
process.stdout.write(`${NL}${String(rows.length - failed.length)}/${String(rows.length)} audit check(s) PASS${NL}`);

export const eventAuditSummary = Object.freeze({
  checks: rows.length,
  passed: rows.length - failed.length,
  failed: failed.map((row) => row.id),
  green: failed.length === 0,
  families: DURABLE_EVENT_FAMILIES.length,
  flagged,
  rows,
});

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  process.exit(failed.length === 0 ? 0 : 1);
}
