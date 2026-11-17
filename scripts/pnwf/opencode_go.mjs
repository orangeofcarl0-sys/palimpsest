import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BudgetRefusal, USAGE_FIELDS, usageBreakdown, usageTotal } from "./execution_budget.mjs";

export const OPENCODE_GO_MODEL = "deepseek-v4.1-flash";
export const OPENCODE_GO_MESSAGES = "https://opencode.ai/inference/go/anthropic/v1/messages";
const CONFIGURED_GO_BASE = "https://opencode.ai/zen/go/v1";

export function readOpenCodeGoKey(profileId, path = join(homedir(), ".zcode/v2/provider_config.json")) {
  try {
    const config = JSON.parse(readFileSync(path, "utf8")).config;
    const matches = config.providerConfigRules.providerRules.filter(rule => rule.providerId === profileId &&
      rule.config?.api?.baseUrl === CONFIGURED_GO_BASE && rule.config.personalModelIds?.includes(OPENCODE_GO_MODEL));
    const key = matches[0]?.config?.access?.apiKey;
    if (matches.length === 1 && config.providerOrder.includes(profileId) &&
        typeof key === "string" && /^oc_sk_[\w.-]{32,200}$/u.test(key)) return key;
  } catch { /* Configuration and credentials stay on the host. */ }
  throw new BudgetRefusal("OPENCODE_GO_CREDENTIAL_REQUIRED");
}

export function openCodeGoBody(body) {
  const request = JSON.parse(body.toString("utf8"));
  for (const field of Object.keys(request)) if (field.startsWith("dsh_")) delete request[field];
  // DSH uses DeepSeek's enabled-without-budget extension. Go's translated
  // Messages route already defaults to the model's reasoning configuration.
  if (request.thinking?.type === "enabled" && request.thinking.budget_tokens === undefined) {
    delete request.thinking;
    if (request.output_config && Object.hasOwn(request.output_config, "effort")) {
      delete request.output_config.effort;
      if (Object.keys(request.output_config).length === 0) delete request.output_config;
    }
  }
  return Buffer.from(JSON.stringify({ ...request, model: OPENCODE_GO_MODEL }));
}

export function openCodeGoUsage(usage) {
  const fields = usage?.opencode?.tokens;
  if (!USAGE_FIELDS.every(key => Object.hasOwn(usage ?? {}, key)) ||
      !["input", "output", "cache_read", "cache_write_5m", "cache_write_1h"].every(key =>
        Number.isSafeInteger(fields?.[key]) && fields[key] >= 0)) {
    throw new BudgetRefusal("OPENCODE_TERMINAL_USAGE_MISSING");
  }
  const parts = usageBreakdown(usage);
  if (parts.input_tokens !== fields.input || parts.output_tokens !== fields.output ||
      parts.cache_read_input_tokens !== fields.cache_read ||
      parts.cache_creation_input_tokens !== fields.cache_write_5m + fields.cache_write_1h) {
    throw new BudgetRefusal("OPENCODE_CONFLICTING_USAGE");
  }
  return parts;
}

export function openCodeGoBilling(usage) {
  const money = value => Number.isFinite(value) && value >= 0 ? value : null;
  const { billing_source, allowance, list_cost, tokens } = usage.opencode;
  return { billingSource: /^(?:go|go-plus|go-teams|balance|free|byok)$/u.test(billing_source) ? billing_source : null,
    cost: money(usage.cost), allowance: money(allowance), listCost: money(list_cost),
    reasoning: Number.isSafeInteger(tokens.reasoning) && tokens.reasoning >= 0 && tokens.reasoning <= tokens.output ? tokens.reasoning : null };
}

export function requireOpenCodeGoProbe(probe) {
  const ledger = probe?.accounting;
  const row = ledger?.requests?.[0];
  if (probe?.schema !== "pnwf-opencode-go-probe/v1" || !probe.passed || probe.httpStatus !== 200 ||
      probe.model !== OPENCODE_GO_MODEL || probe.route !== OPENCODE_GO_MESSAGES || probe.stream?.model !== OPENCODE_GO_MODEL ||
      probe.stream.types?.at(-1) !== "message_stop" || !/^[\w.-]+$/u.test(probe.providerResponseId ?? "") ||
      !/^[\da-f-]{36}$/u.test(probe.profileId ?? "") || ledger?.requests?.length !== 1 ||
      ledger.unresolvedRequests !== 0 || ledger.sessions?.[0]?.state !== "ENDED" ||
      row?.id !== probe.requestId || row.state !== "SETTLED") throw new BudgetRefusal("OPENCODE_GO_PROBE_NOT_SETTLED");
  const usage = openCodeGoUsage(probe.stream.finalUsage);
  if (row.actual !== usageTotal(usage) || ledger.confirmed !== row.actual ||
      USAGE_FIELDS.some(key => usage[key] !== probe.terminalUsage?.[key] || usage[key] !== row.usage?.[key])) {
    throw new BudgetRefusal("OPENCODE_GO_PROBE_USAGE_MISMATCH");
  }
  return probe.profileId;
}
