/**
 * F-D — RULE RESOLUTION (starting point H0).
 *
 * A rule set routes a request to the ONE rule that applies to it, and the most specific matching rule is
 * the one that applies. Requests arrive in whatever case the caller used, and a pattern segment written
 * `*` stands for exactly one path segment.
 *
 * This implementation takes the obvious first move — turn each pattern into a regular expression and hand
 * back the first rule that matches — and therefore:
 *
 *   · compares raw strings, so a rule written in another case never matches;
 *   · ignores the host entirely;
 *   · returns the FIRST matching rule rather than the most specific one;
 *   · never notices that two different rules are equally specific;
 *   · lets a `*` segment match an empty segment.
 */

export class RuleError extends Error {
  /**
   * @param {string} code a stable, machine-readable failure code
   * @param {string} message a human-readable explanation
   */
  constructor(code, message) {
    super(message);
    this.name = "RuleError";
    this.code = code;
  }
}

/**
 * Select the ONE rule that applies to a request.
 *
 * @param {ReadonlyArray<{ id: string, match: { host: string | null, path: string }, params: Record<string, unknown> }>} rules
 * @param {{ host: string, path: string }} request
 * @returns {{ ruleId: string, params: Record<string, unknown> } | null}
 */
export function resolveRule(rules, request) {
  for (const rule of rules) {
    const pattern = rule.match.path.split("*").join("[^/]*");
    if (new RegExp(`^${pattern}$`).test(request.path)) {
      return { ruleId: rule.id, params: rule.params };
    }
  }
  return null;
}
