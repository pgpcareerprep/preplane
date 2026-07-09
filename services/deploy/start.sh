#!/bin/sh
set -eu

# Render sets PORT for the public HTTP listener. Preserve it for the gateway.
GATEWAY_PORT="${PORT:-8080}"
INTENT_ROUTER_PORT="${INTENT_ROUTER_PORT:-8081}"
COMMAND_PLANE_PORT="${COMMAND_PLANE_PORT:-8082}"
LMP_ENGINE_PORT="${LMP_ENGINE_PORT:-8090}"
EVENT_BUS_PORT="${EVENT_BUS_PORT:-8083}"

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

export INTENT_ROUTER_URL="http://127.0.0.1:${INTENT_ROUTER_PORT}"
export COMMAND_PLANE_URL="http://127.0.0.1:${COMMAND_PLANE_PORT}"
export LMP_ENGINE_URL="http://127.0.0.1:${LMP_ENGINE_PORT}"
export PORT="${GATEWAY_PORT}"

trap 'kill "$INTENT_PID" "$COMMAND_PLANE_PID" "$LMP_PID" "$EVENT_BUS_PID" 2>/dev/null || true' EXIT INT TERM
exec preplane-gateway
