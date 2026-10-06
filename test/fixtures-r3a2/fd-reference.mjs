/**
 * R3-A2 — A REFERENCE RESOLUTION FOR F-D, used ONLY by the solvability test.
 *
 * This is NOT a model outcome and NOT a fixture byte: it exists so the design tests can prove the
 * fixture's contract is SATISFIABLE, i.e. that its failure classes measure a reachable behaviour rather
 * than an impossible one. It is never copied into a world, and it is not part of the qualification
 * schedule.
 */
export class RuleError extends Error {
  constructor(code, message) { super(message); this.name = "RuleError"; this.code = code; }
}
const norm = (s) => String(s).trim().toLowerCase();
const segs = (p) => { const t = String(p).trim(); const parts = t.split("/"); if (parts.length > 0 && parts[0] === "") parts.shift(); return parts; };
export function resolveRule(rules, request) {
  const byId = new Map();
  for (const r of rules) {
    const key = JSON.stringify([r.match.host === null || r.match.host === undefined ? null : norm(r.match.host), norm(r.match.path)]);
    const prior = byId.get(r.id);
    if (prior !== undefined) { if (prior.key !== key) throw new RuleError("INCONSISTENT_RULE_ID", `id ${r.id} has two matches`); continue; }
    byId.set(r.id, { id: r.id, host: r.match.host === null || r.match.host === undefined ? null : norm(r.match.host), path: norm(r.match.path), params: r.params, key });
  }
  const candidates = [];
  for (const rule of byId.values()) {
    const rp = segs(rule.path); const qp = segs(request.path);
    if (rp.length !== qp.length) continue;
    let ok = true; let literals = 0;
    for (let i = 0; i < rp.length; i += 1) {
      if (rp[i] === "*") { if (qp[i] === "") { ok = false; break; } continue; }
      if (rp[i] !== norm(qp[i])) { ok = false; break; }
      literals += 1;
    }
    if (!ok) continue;
    if (rule.host !== null && rule.host !== norm(request.host)) continue;
    candidates.push({ rule, score: (rule.host !== null ? 1 : 0) + literals });
  }
  if (candidates.length === 0) return null;
  const best = Math.max(...candidates.map((c) => c.score));
  const top = candidates.filter((c) => c.score === best);
  const distinct = new Set(top.map((c) => c.rule.key));
  if (distinct.size > 1) throw new RuleError("AMBIGUOUS_REQUEST", "two rules tie at the highest specificity");
  const winner = top[0].rule;
  return { ruleId: winner.id, params: winner.params };
}
