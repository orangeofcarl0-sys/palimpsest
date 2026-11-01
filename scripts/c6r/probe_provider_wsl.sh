#!/usr/bin/env bash
# C6-R4 — one bounded provider availability probe, INSIDE the isolated runtime.
#
# This is the only real provider request C6-R makes. It runs after the Code Freeze, through the same
# outer bwrap view, private network namespace and provider-only Unix-socket proxy as a scored
# session. The proxy holds the real credential; the sandbox gets a placeholder. If the provider
# returns insufficient balance, the result is BLOCKED and no scored session is started.
#
# No credential is printed, copied into the sandbox or written to the evidence directory.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="$HOME/c6r"
DSH="$BASE/dsh/node_modules/.bin/dsh"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="${C6R_PROBE_EVIDENCE:-$REPO/research-evidence/c6r/probe/$STAMP}"
WORK="$BASE/probe/$STAMP"
CREDENTIAL="${C6R_CREDENTIAL_FILE:-/mnt/c/Users/66494/.dsh/.credentials.yaml}"

mkdir -p "$EVIDENCE" "$WORK/home" "$WORK/workspace" "$WORK/out"
if [ ! -f "$CREDENTIAL" ]; then
  printf '{"state":"BLOCKED","reason":"credential_missing","detail":"the provider credential file was not found"}\n' > "$EVIDENCE/probe-result.json"
  echo "BLOCKED: credential missing"
  exit 4
fi

cat > "$WORK/patch.yml" <<'YAML'
- id: llm-deepseek
  config:
    baseURL: http://127.0.0.1:18080
    apiKeyEnv: C6R_PLACEHOLDER
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

C6R_PROXY_SOCKET="$WORK/provider.sock" C6R_UPSTREAM="https://api.deepseek.com/anthropic" \
  C6R_CREDENTIAL_FILE="$CREDENTIAL" C6R_PROXY_LOG="$WORK/out/proxy.jsonl" \
  node "$BASE/provider_proxy.mjs" > "$WORK/out/proxy.log" 2>&1 &
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
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --ro-bind /sbin /sbin \
  --ro-bind /etc /etc \
  --ro-bind "$BASE/dsh" /dsh \
  --ro-bind "$WORK/patch.yml" /qual/patch.yml \
  --ro-bind "$BASE/net_bridge.mjs" /net_bridge.mjs \
  --bind "$WORK/provider.sock" /run/c6r-provider.sock \
  --bind "$WORK/workspace" /workspace \
  --bind "$WORK/home" /dsh-home \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --tmpfs /mnt \
  --tmpfs /home \
  --tmpfs /root \
  --tmpfs /media \
  --tmpfs /srv \
  --unshare-pid \
  --unshare-net \
  --die-with-parent \
  --chdir /workspace \
  env -i \
    HOME=/dsh-home \
    DSH_HOME=/dsh-home \
    TMPDIR=/tmp \
    PATH=/usr/local/bin:/usr/bin:/bin \
    C6R_PLACEHOLDER=c6r-placeholder-not-a-credential \
    C6R_PROXY_SOCKET=/run/c6r-provider.sock \
    C6R_BRIDGE_PORT=18080 \
    bash -c 'node /net_bridge.mjs > /dsh-home/bridge.log 2>&1 & BRIDGE=$!; sleep 0.4; /dsh/node_modules/.bin/dsh --profile headless --patch /qual/patch.yml "Reply with the single token PROBE_OK and nothing else."; STATUS=$?; kill "$BRIDGE" 2>/dev/null || true; exit "$STATUS"' \
  > "$WORK/out/run.log" 2> "$WORK/out/run.err"
EXIT_CODE=$?
set -e
END_MS=$(date +%s%3N)
kill "$PROXY_PID" 2>/dev/null || true
wait "$PROXY_PID" 2>/dev/null || true
trap - EXIT

cp "$WORK/out/run.log" "$EVIDENCE/"
cp "$WORK/out/run.err" "$EVIDENCE/"
cp "$WORK/out/proxy.log" "$EVIDENCE/"
if [ -f "$WORK/out/proxy.jsonl" ]; then cp "$WORK/out/proxy.jsonl" "$EVIDENCE/"; fi
if [ -f "$WORK/home/bridge.log" ]; then cp "$WORK/home/bridge.log" "$EVIDENCE/"; fi
cp "$WORK/patch.yml" "$EVIDENCE/"
mkdir -p "$EVIDENCE/session"
for stream in "$WORK"/home/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$EVIDENCE/session/"; fi
done
find "$WORK/home/sessions" -type f -printf "%p %s\n" > "$EVIDENCE/session-files.txt" 2>/dev/null || true

CODE_COMMIT="${C6R_CODE_FREEZE_COMMIT:-$(git -C "$REPO" rev-parse HEAD)}"
CODE_TREE="${C6R_CODE_FREEZE_TREE:-$(git -C "$REPO" rev-parse "HEAD^{tree}")}"
HEAD_AT_PROBE=$(git -C "$REPO" rev-parse HEAD)
node - "$EVIDENCE" "$EXIT_CODE" "$STARTED" "$((END_MS - START_MS))" "$CODE_COMMIT" "$CODE_TREE" "$HEAD_AT_PROBE" <<'NODE'
const { existsSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { zstdDecompressSync } = require("node:zlib");
const [evidence, exitCode, startedAt, elapsedMs, codeCommit, codeTree, headAtProbe] = process.argv.slice(2);
const read = (name) => (existsSync(join(evidence, name)) ? readFileSync(join(evidence, name), "utf8") : "");
const stderr = read("run.err");
const proxy = read("proxy.jsonl")
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => { try { return JSON.parse(line); } catch { return { raw: line }; } });
const sessionDir = join(evidence, "session");
const streams = existsSync(sessionDir) ? readdirSync(sessionDir).filter((name) => name.endsWith(".jsonl.zstd")) : [];
let sessionEvents = 0;
let assistantMessages = 0;
let requestHeaders = 0;
let toolCatalogue = [];
let usage = null;
let sessionId = null;
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
    sessionEvents += 1;
    if (event.type === "session") sessionId = event.id ?? null;
    if (event.type === "assistant/message") {
      assistantMessages += 1;
      if (event.data?.usage) {
        usage = usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        usage.inputTokens += event.data.usage.inputTokens ?? 0;
        usage.outputTokens += event.data.usage.outputTokens ?? 0;
        usage.totalTokens += event.data.usage.totalTokens ?? 0;
      }
    }
    if (event.type === "request/header") {
      requestHeaders += 1;
      toolCatalogue = (event.data?.header?.tools ?? []).map((tool) => tool.name);
    }
  }
}
const quotaError = /QUOTA:\s*Insufficient Balance/i.test(stderr);
const providerError = proxy.find((entry) => typeof entry.status === "number" && entry.status >= 400) ?? null;
const result = {
  schema: "c6r-provider-probe/v2",
  at: new Date().toISOString(),
  startedAt,
  elapsedMs: Number(elapsedMs),
  codeFreeze: { commit: codeCommit, tree: codeTree },
  headAtProbe,
  exit: Number(exitCode),
  quotaError,
  providerError,
  stdoutTail: read("run.log").slice(-2000),
  stderrTail: stderr.slice(-3000),
  proxyRequests: proxy,
  sessionId,
  sessionFiles: streams,
  sessionEvents,
  requestHeaders,
  assistantMessages,
  toolCatalogue,
  usage,
  state: quotaError || Number(exitCode) !== 0 || assistantMessages === 0 ? "BLOCKED" : "AVAILABLE",
  note: "One provider request through the isolated runtime and provider-only egress. No credential is present in this directory.",
};
writeFileSync(join(evidence, "probe-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ state: result.state, exit: result.exit, quotaError, providerError, assistantMessages, requestHeaders, tools: toolCatalogue.length, usage }, null, 2));
NODE
exit 0
