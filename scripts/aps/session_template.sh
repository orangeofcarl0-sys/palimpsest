#!/usr/bin/env bash
# APS-C session template — intentionally NOT a live runner.
#
# A live F/L/G session must be frozen as an exact command with the scenario, world, prompt, tool
# profile and provider. This template refuses unless the runner explicitly marks the process as
# authorized, and still does not itself call a model: it exists so the cohort schema can be validated
# without shipping a half-wired paid path.
set -euo pipefail

condition="${1:-}"
if [ "${APS_LIVE_SESSION_AUTHORIZED:-}" != "true" ]; then
  echo "APS_LIVE_SESSION_AUTHORIZED is not true; refusing to start an APS live session" >&2
  exit 3
fi
echo "the APS live session template has no frozen scenario command; build one from a prepared world and profile" >&2
exit 4
