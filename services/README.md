# PrepLane Hybrid AI Services (Phase 0)

Strangler-fig migration replacing `copilot-ai` / `voice-copilot` with a layered Rust + Python backend.

## Layout

```
services/
  contracts/          JSON Schemas + Rust/Python bindings
  gateway/            HTTP ingress (Phase 1)
  intent-router/      Rules + similarity (Phase 2)
  command-plane/      Guardrails + idempotency (Phase 4)
  reasoning/          LLM planner (Phase 3)
  workflow/           Plan decomposition (Phase 3)
  engines/            Domain execution services (Phase 5)
  event-bus/          Redis Streams relay (Phase 6)
  governance/         RBAC/ABAC lib (Phase 7)
  infra/              docker-compose, OTel, rollback SQL
```

## Phase 0 verification

### Contracts

```bash
# Rust (requires rustup)
cd services && cargo test -p preplane-contracts

# Python
cd services/contracts/python
pip install -e ".[dev]"
pytest -q
```

Round-trip: fixture `contracts/fixtures/command_envelope_sample.json` parses in both languages.
After `cargo test`, Python `test_rust_export_bridge_if_present` asserts Rust export equality.

### Infra

```bash
cd services/infra
docker compose up -d postgres redis otel-collector
# Build all services (slow first time):
docker compose up -d --build
# Health checks:
curl -s localhost:8080/health | jq .
curl -s localhost:9001/health | jq .
```

### Migration

```bash
# Forward (Supabase CLI or psql against scratch DB)
psql "$DATABASE_URL" -f ../../supabase/migrations/20260709120000_hybrid_ai_core.sql
# Rollback
psql "$DATABASE_URL" -f migrations/rollback_hybrid_ai_core.sql
```

### Frontend (unchanged in Phase 0)

```bash
npm run build
```

## Codegen

```bash
./contracts/scripts/generate.sh
```

Install tools: `cargo install typify-cli`, `pip install datamodel-code-generator`.

Hand-maintained `types.rs` / `models.py` are authoritative until codegen is wired in CI.

## Phase 1 verification

```bash
# Run gateway locally (requires SUPABASE_URL, keys)
export SUPABASE_URL=...
export SUPABASE_PUBLISHABLE_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
cd services && cargo run -p preplane-gateway

# Enable in frontend .env
# VITE_COPILOT_GATEWAY_URL=http://localhost:8080
npm run dev
```

With the flag on, sending "hi" in `/copilot` should render a greeting bubble via SSE echo.

## Next phase

**Phase 2** — Intent Router (Rust rules + pgvector + Python semantic classifier).
