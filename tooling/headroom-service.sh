#!/usr/bin/env bash
# Optional local experiment. Never wraps agents or changes provider settings.
set -euo pipefail
headroom_repo="$(cd "$(dirname "$0")/.." && pwd)"
headroom_state="${EIN_HEADROOM_SERVICE_DIR:-$headroom_repo/.pi/ein/headroom-service}"
headroom_port="${EIN_HEADROOM_PORT:-8787}"
case "${1:-help}" in
  setup)
    uv venv --python 3.13 "$headroom_state/venv"
    uv pip sync --python "$headroom_state/venv/bin/python" "$headroom_repo/evals/headroom/requirements.lock"
    ;;
  serve)
    export HEADROOM_WORKSPACE_DIR="$headroom_state/state"
    export HEADROOM_BEACON=off DO_NOT_TRACK=1 HEADROOM_TELEMETRY=off
    export HEADROOM_CODE_AWARE_ENABLED=0 HEADROOM_NO_SUBSCRIPTION_TRACKING=1
    export HEADROOM_OUTPUT_SHAPER=0 HEADROOM_EFFORT_ROUTER=0
    exec "$headroom_state/venv/bin/headroom" proxy --host 127.0.0.1 --port "$headroom_port" \
      --disable-kompress --compressor smart_crusher \
      --compressor tabular --no-ccr --no-cache --no-rate-limit
    ;;
  *)
    echo "Usage: bash tooling/headroom-service.sh setup|serve"
    echo "Optional: EIN_HEADROOM_SERVICE_DIR, EIN_HEADROOM_PORT (default 8787)."
    ;;
esac
