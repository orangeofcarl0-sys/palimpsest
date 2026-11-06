#!/bin/sh
# Runs INSIDE the principal container as uid 1001. Emits one RESULT line per check.
set -u
allow() {
  name="$1"; shift
  if "$@" >/tmp/out 2>/tmp/err; then
    printf 'RESULT %s ALLOW %s\n' "$name" "$(tr '\n' ' ' </tmp/out | cut -c1-120)"
  else
    printf 'RESULT %s DENY_UNEXPECTED %s\n' "$name" "$(tr '\n' ' ' </tmp/err | cut -c1-120)"
  fi
}
deny() {
  name="$1"; shift
  if "$@" >/tmp/out 2>/tmp/err; then
    printf 'RESULT %s ALLOW_UNEXPECTED %s\n' "$name" "$(tr '\n' ' ' </tmp/out | cut -c1-120)"
  else
    printf 'RESULT %s DENIED %s\n' "$name" "$(tr '\n' ' ' </tmp/err | cut -c1-120)"
  fi
}

allow  read_task_public       node -e 'process.stdout.write(require("fs").readFileSync("/workspace/public.txt","utf8"))'
allow  shell_task_public      sh -c 'cat /workspace/public.txt'
allow  write_task_workspace   sh -c 'echo ok > /workspace/write.txt && cat /workspace/write.txt'
allow  git_task_workspace     git -C /workspace status --porcelain
allow  build_task_workspace   node /workspace/check.cjs
allow  dsh_native_available   sh -c 'HOME=/home/principal dsh --version'

deny   native_read_private    node -e 'process.stdout.write(require("fs").readFileSync("/harness/private-canary","utf8"))'
deny   native_shell_private   sh -c 'cat /harness/private-canary'
deny   indirect_proc_private  sh -c 'cat /proc/1/root/harness/private-canary'
deny   indirect_parent_path   sh -c 'cat /workspace/../harness/private-canary'
deny   read_score             node -e 'process.stdout.write(require("fs").readFileSync("/harness/score.json","utf8"))'
deny   read_rubric            node -e 'process.stdout.write(require("fs").readFileSync("/harness/rubric.md","utf8"))'
deny   read_reference         node -e 'process.stdout.write(require("fs").readFileSync("/harness/reference/solution.txt","utf8"))'
deny   read_other_condition   node -e 'process.stdout.write(require("fs").readFileSync("/harness/other-condition/secret.txt","utf8"))'
deny   read_historical_score  node -e 'process.stdout.write(require("fs").readFileSync("/harness/historical/results.json","utf8"))'
deny   read_private_config    node -e 'process.stdout.write(require("fs").readFileSync("/harness/config/private.yml","utf8"))'
