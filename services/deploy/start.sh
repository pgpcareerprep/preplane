#!/bin/sh
set -eu

# Render sets PORT for the public HTTP listener. Preserve it for the gateway.
GATEWAY_PORT="${PORT:-8080}"
INTENT_ROUTER_PORT="${INTENT_ROUTER_PORT:-8081}"
COMMAND_PLANE_PORT="${COMMAND_PLANE_PORT:-8082}"
LMP_ENGINE_PORT="${LMP_ENGINE_PORT:-8090}"
EVENT_BUS_PORT="${EVENT_BUS_PORT:-8083}"
QUERY_PATH_PORT="${QUERY_PATH_PORT:-8084}"
ORCHESTRATOR_PORT="${ORCHESTRATOR_PORT:-9005}"
PATHS_PORT="${PATHS_PORT:-9001}"
SYNC_ENGINE_PORT="${SYNC_ENGINE_PORT:-8091}"
NOTIFICATION_ENGINE_PORT="${NOTIFICATION_ENGINE_PORT:-8092}"
CALENDAR_ENGINE_PORT="${CALENDAR_ENGINE_PORT:-8093}"
ANALYTICS_ENGINE_PORT="${ANALYTICS_ENGINE_PORT:-8094}"

# Internal service URLs. Exported BEFORE any child starts so every service —
# the orchestrator included — can reach its peers (previously only the gateway
# saw these, so the orchestrator could never call intent-router or query-path).
export INTENT_ROUTER_URL="http://127.0.0.1:${INTENT_ROUTER_PORT}"
export COMMAND_PLANE_URL="http://127.0.0.1:${COMMAND_PLANE_PORT}"
export LMP_ENGINE_URL="http://127.0.0.1:${LMP_ENGINE_PORT}"
export QUERY_PATH_URL="http://127.0.0.1:${QUERY_PATH_PORT}"
export ORCHESTRATOR_URL="http://127.0.0.1:${ORCHESTRATOR_PORT}"
export SEMANTIC_CLASSIFIER_URL="http://127.0.0.1:${PATHS_PORT}/semantic"
export REASONING_URL="http://127.0.0.1:${PATHS_PORT}/reasoning"
export WORKFLOW_URL="http://127.0.0.1:${PATHS_PORT}/workflow"

# Python path services (semantic classifier + reasoning + workflow) in one process.
PATHS_PORT="${PATHS_PORT}" python3 /app/services/deploy/paths_host.py &
PATHS_PID=$!

export PORT="${INTENT_ROUTER_PORT}"
preplane-intent-router &
INTENT_PID=$!

export PORT="${COMMAND_PLANE_PORT}"
preplane-command-plane &
COMMAND_PLANE_PID=$!

export PORT="${LMP_ENGINE_PORT}"
preplane-lmp &
LMP_PID=$!

export PORT="${EVENT_BUS_PORT}"
preplane-event-bus &
EVENT_BUS_PID=$!

export PORT="${QUERY_PATH_PORT}"
preplane-query-path &
QUERY_PATH_PID=$!

export PORT="${SYNC_ENGINE_PORT}"
preplane-sync &
SYNC_PID=$!

export PORT="${NOTIFICATION_ENGINE_PORT}"
preplane-notification &
NOTIFICATION_PID=$!

export PORT="${CALENDAR_ENGINE_PORT}"
preplane-calendar &
CALENDAR_PID=$!

export PORT="${ANALYTICS_ENGINE_PORT}"
preplane-analytics &
ANALYTICS_PID=$!

export PORT="${ORCHESTRATOR_PORT}"
cd /app/services/orchestrator
deno run --allow-all main.ts &
ORCHESTRATOR_PID=$!
cd - >/dev/null

# Wait for orchestrator before accepting gateway traffic (cold-start race).
i=0
while [ "$i" -lt 45 ]; do
  if curl -sf "http://127.0.0.1:${ORCHESTRATOR_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done
if ! curl -sf "http://127.0.0.1:${ORCHESTRATOR_PORT}/health" >/dev/null 2>&1; then
  echo "[start.sh] orchestrator failed to become ready on :${ORCHESTRATOR_PORT}" >&2
fi

# Non-blocking visibility for the path services host.
if curl -sf "http://127.0.0.1:${PATHS_PORT}/health" >/dev/null 2>&1; then
  echo "[start.sh] paths host ready on :${PATHS_PORT} (semantic/reasoning/workflow)"
else
  echo "[start.sh] paths host not ready on :${PATHS_PORT} — continuing (advisory services)" >&2
fi

export PORT="${GATEWAY_PORT}"

trap 'kill "$INTENT_PID" "$COMMAND_PLANE_PID" "$LMP_PID" "$EVENT_BUS_PID" "$QUERY_PATH_PID" "$SYNC_PID" "$NOTIFICATION_PID" "$CALENDAR_PID" "$ANALYTICS_PID" "$PATHS_PID" "$ORCHESTRATOR_PID" 2>/dev/null || true' EXIT INT TERM
exec preplane-gateway
