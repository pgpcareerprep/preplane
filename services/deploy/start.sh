#!/bin/sh
set -eu

# Render sets PORT for the public HTTP listener. Preserve it for the gateway.
GATEWAY_PORT="${PORT:-8080}"
INTENT_ROUTER_PORT="${INTENT_ROUTER_PORT:-8081}"

export PORT="${INTENT_ROUTER_PORT}"
preplane-intent-router &
INTENT_PID=$!

export INTENT_ROUTER_URL="http://127.0.0.1:${INTENT_ROUTER_PORT}"
export PORT="${GATEWAY_PORT}"

trap 'kill "$INTENT_PID" 2>/dev/null || true' EXIT INT TERM
exec preplane-gateway
