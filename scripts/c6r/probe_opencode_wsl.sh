#!/usr/bin/env bash
# C6-R A2 — one bounded availability probe for opencode/deepseek-v4.1-flash.
#
# Runs the REAL DSH pi-ai route inside the isolated runtime, through the provider-only egress proxy.
# The proxy reads the active ZCode provider key OUTSIDE the sandbox and forwards exactly
# POST /v1/chat/completions to https://opencode.ai/zen/go/v1. The sandbox gets a placeholder.
#
# One request. If it fails, the failure is preserved and no scored session starts.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="$HOME/c6r"

mkdir -p "$BASE"
cp "$REPO/scripts/c6r/provider_proxy.mjs" "$BASE/provider_proxy.mjs"
cp "$REPO/scripts/c6r/egress_policy.mjs" "$BASE/egress_policy.mjs"
cp "$REPO/scripts/c6r/upstream_retry.mjs" "$BASE/upstream_retry.mjs"
DSH="$BASE/dsh/node_modules/.bin/dsh"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$BASE/opencode-probe/$STAMP"
OUT="$WORK/out"
EVIDENCE="${C6R_OPENCODE_PROBE_EVIDENCE:-$REPO/research-evidence/c6r/opencode-probe/$STAMP}"
PROVIDER_CONFIG="/mnt/c/Users/66494/.zcode/v2/provider_config.json"
PROVIDER_ID="5c7f8d75-e85e-4de5-9b27-e2b59eab1c7a"
UPSTREAM="https://opencode.ai/zen/go/v1"
SESSION_HEADER='{"x-opencode-session":"zcode-5c7f8d75-20260913"}'

mkdir -p "$EVIDENCE" "$WORK/home" "$WORK/workspace" "$OUT"

# The key is checked for PRESENCE only; its value is never printed or copied.
node - "$PROVIDER_CONFIG" "$PROVIDER_ID" <<'NODE' > "$EVIDENCE/credential-presence.json"
const { readFileSync } = require("node:fs");
const [file, id] = process.argv.slice(2);
const config = JSON.parse(readFileSync(file, "utf8"));
const rules = config.config?.providerConfigRules?.providerRules ?? [];
const rule = rules.find((entry) => entry.providerId === id);
const key = rule?.config?.access?.apiKey;
console.log(JSON.stringify({
  providerId: id,
  providerName: rule?.providerName ?? null,
  keyPresent: typeof key === "string" && key.length > 0,
  keyLength: typeof key === "string" ? key.length : null,
  keyPrefix: typeof key === "string" && key.startsWith("sk-") ? "sk-" : null,
  apiType: rule?.config?.api?.type ?? null,
  baseUrl: rule?.config?.api?.baseUrl ?? null,
  headerNames: Object.keys(rule?.config?.api?.headers ?? {}),
}, null, 2));
NODE

cat > "$WORK/patch.yml" <<'YAML'
- id: llm-deepseek
  disabled: true
- id: llm-pi-ai
  config:
    providers:
      opencode:
        displayName: OpenCode Go
        api: openai-completions
        baseURL: http://127.0.0.1:18080/v1
        apiKeyEnv: C6R_PLACEHOLDER
        headers:
          x-opencode-session: zcode-5c7f8d75-20260913
        compat:
          thinkingFormat: deepseek
        defaultContextWindow: 1000000
        defaultMaxTokens: 262144
        reasoning: high
        models:
          - id: deepseek-v4.1-flash
            name: DeepSeek V4.1 Flash
            reasoningEfforts:
              off:
              high: high
- id: agent-default-model
  config:
    provider: opencode
    model: deepseek-v4.1-flash
- id: approval
  config:
    policy: never
- id: permission
  config:
    presets:
      read-only:
        sandbox: read-only
        approval: never
      workspace-write:
        sandbox: workspace-write
        approval: never
      danger-full-access:
        sandbox: danger-full-access
        approval: never
    defaultPreset: workspace-write
- id: sandbox-policy
  config:
    mode: workspace-write
    workspaceRoot: /workspace
- id: session-title-llm
  disabled: true
- id: tool-subagent
  disabled: true
- id: tool-subagent-control
  disabled: true
- id: tool-workflow
  disabled: true
- id: subagent
  disabled: true
- id: subagent-spawn-in-process
  disabled: true
- id: subagent-fork-in-process
  disabled: true
- id: workflow-ptc
  disabled: true
- id: tool-web
  disabled: true
YAML

C6R_PROVIDER_KIND=openai C6R_PROXY_SOCKET="$WORK/provider.sock" C6R_UPSTREAM="$UPSTREAM" \
  C6R_PROVIDER_CONFIG_FILE="$PROVIDER_CONFIG" C6R_PROVIDER_ID="$PROVIDER_ID" \
  C6R_UPSTREAM_HEADERS="$SESSION_HEADER" C6R_PROXY_LOG="$OUT/proxy.jsonl" \
  node "$BASE/provider_proxy.mjs" > "$OUT/proxy.log" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  if [ -S "$WORK/provider.sock" ]; then break; fi
  sleep 0.1
done
if [ ! -S "$WORK/provider.sock" ]; then
  kill "$PROXY_PID" 2>/dev/null || true
  printf '{"state":"BLOCKED","reason":"proxy_unavailable"}\n' > "$EVIDENCE/probe-result.json"
  echo "BLOCKED: proxy unavailable"
  exit 5
fi

STARTED=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
START_MS=$(date +%s%3N)
set +e
bwrap \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin --ro-bind /sbin /sbin --ro-bind /etc /etc \
  --ro-bind "$BASE/dsh" /dsh \
  --ro-bind "$WORK/patch.yml" /qual/patch.yml \
  --ro-bind "$BASE/net_bridge.mjs" /net_bridge.mjs \
  --bind "$WORK/provider.sock" /run/c6r-provider.sock \
  --bind "$WORK/workspace" /workspace \
  --bind "$WORK/home" /dsh-home \
  --proc /proc --dev /dev --tmpfs /tmp \
  --tmpfs /mnt --tmpfs /home --tmpfs /root --tmpfs /media --tmpfs /srv \
  --unshare-pid --unshare-net --die-with-parent --chdir /workspace \
  env -i HOME=/dsh-home DSH_HOME=/dsh-home TMPDIR=/tmp PATH=/usr/local/bin:/usr/bin:/bin \
    C6R_PLACEHOLDER=c6r-placeholder-not-a-credential \
    C6R_PROXY_SOCKET=/run/c6r-provider.sock C6R_BRIDGE_PORT=18080 \
    bash -c 'node /net_bridge.mjs > /dsh-home/bridge.log 2>&1 & BRIDGE=$!; sleep 0.4; /dsh/node_modules/.bin/dsh --profile headless --patch /qual/patch.yml "Reply with the single token PROBE_OK and nothing else."; STATUS=$?; kill "$BRIDGE" 2>/dev/null || true; exit "$STATUS"' \
  > "$OUT/run.log" 2> "$OUT/run.err"
EXIT_CODE=$?
set -e
END_MS=$(date +%s%3N)
kill "$PROXY_PID" 2>/dev/null || true
wait "$PROXY_PID" 2>/dev/null || true
trap - EXIT

cp "$WORK/patch.yml" "$EVIDENCE/"
for name in run.log run.err proxy.log proxy.jsonl; do
  if [ -f "$OUT/$name" ]; then cp "$OUT/$name" "$EVIDENCE/"; fi
done
if [ -f "$WORK/home/bridge.log" ]; then cp "$WORK/home/bridge.log" "$EVIDENCE/"; fi
mkdir -p "$EVIDENCE/session"
for stream in "$WORK"/home/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$EVIDENCE/session/"; fi
done
find "$WORK/home/sessions" -type f -printf "%p %s\n" > "$EVIDENCE/session-files.txt" 2>/dev/null || true

node - "$EVIDENCE" "$EXIT_CODE" "$STARTED" "$((END_MS - START_MS))" \
  "${C6R_CODE_FREEZE_COMMIT:-unknown}" "${C6R_CODE_FREEZE_TREE:-unknown}" "${C6R_HEAD_AT_PROBE:-unknown}" <<'NODE'
const { existsSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { zstdDecompressSync } = require("node:zlib");
const [evidence, exitCode, startedAt, elapsedMs, codeCommit, codeTree, headAtProbe] = process.argv.slice(2);
const read = (name) => (existsSync(join(evidence, name)) ? readFileSync(join(evidence, name), "utf8") : "");
const proxy = read("proxy.jsonl").split(/\r?\n/u).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return { raw: line }; } });
const sessionDir = join(evidence, "session");
const streams = existsSync(sessionDir) ? readdirSync(sessionDir).filter((name) => name.endsWith(".jsonl.zstd")) : [];
let sessionId = null;
let requestHeaders = 0;
let assistantMessages = 0;
let assistantText = "";
let usage = null;
let toolCatalogue = [];
let provider = null;
let model = null;
let turnError = null;
for (const name of streams) {
  const buffer = readFileSync(join(sessionDir, name));
  const starts = [];
  for (let i = 0; i < buffer.length - 3; i += 1) {
    if (buffer[i] === 0x28 && buffer[i + 1] === 0xb5 && buffer[i + 2] === 0x2f && buffer[i + 3] === 0xfd) starts.push(i);
  }
  let text = "";
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try { text += zstdDecompressSync(buffer.subarray(starts[index], end)).toString("utf8"); } catch { /* truncated tail */ }
  }
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === "") continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === "session") sessionId = event.id ?? null;
    if (event.type === "request/header") {
      requestHeaders += 1;
      provider = event.data?.header?.config?.provider ?? provider;
      model = event.data?.header?.config?.model ?? model;
      toolCatalogue = (event.data?.header?.tools ?? []).map((tool) => tool.name);
    }
    if (event.type === "assistant/message") {
      assistantMessages += 1;
      for (const block of event.data?.message?.content ?? []) if (typeof block.text === "string") assistantText += block.text;
      if (event.data?.usage) {
        usage = usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        usage.inputTokens += event.data.usage.inputTokens ?? 0;
        usage.outputTokens += event.data.usage.outputTokens ?? 0;
        usage.totalTokens += event.data.usage.totalTokens ?? 0;
      }
    }
    if (event.type === "turn/end" && event.data?.reason?.kind === "error") turnError = event.data.reason.error ?? null;
  }
}
const stderr = read("run.err");
const quotaError = /QUOTA/i.test(stderr) || /insufficient balance/i.test(stderr);
const providerError = proxy.find((entry) => typeof entry.status === "number" && entry.status >= 400) ?? null;
const state = Number(exitCode) === 0 && assistantMessages > 0 ? "AVAILABLE" : "BLOCKED";
const result = {
  schema: "c6r-provider-probe/v3",
  at: new Date().toISOString(),
  providerKind: "openai",
  provider,
  model,
  upstream: "https://opencode.ai/zen/go/v1",
  startedAt,
  elapsedMs: Number(elapsedMs),
  codeFreeze: { commit: codeCommit, tree: codeTree },
  headAtProbe,
  exit: Number(exitCode),
  state,
  reason: state === "AVAILABLE" ? null : quotaError ? "provider_quota" : turnError ? "provider_error" : "no_assistant_turn",
  quotaError,
  providerError,
  assistantMessages,
  assistantText,
  requestHeaders,
  toolCatalogue,
  usage,
  sessionId,
  sessionFiles: streams,
  proxyRequests: proxy,
  credential: existsSync(join(evidence, "credential-presence.json")) ? JSON.parse(readFileSync(join(evidence, "credential-presence.json"), "utf8")) : null,
  stderrTail: stderr.slice(-3000),
  note: "One bounded availability probe through the isolated runtime and provider-only egress. The real credential stayed outside the sandbox.",
};
writeFileSync(join(evidence, "probe-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ state: result.state, provider, model, exit: result.exit, assistantMessages, usage, proxyRequests: proxy.length, reason: result.reason }, null, 2));
NODE
exit 0
