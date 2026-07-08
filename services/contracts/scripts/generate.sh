#!/usr/bin/env bash
# Regenerate language bindings from JSON Schema (requires typify + datamodel-codegen).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMAS="$ROOT/schemas"
PY_OUT="$ROOT/python/preplane_contracts"
RUST_OUT="$ROOT/rust/preplane-contracts/src"

echo "==> Python (datamodel-code-generator)"
if command -v datamodel-codegen >/dev/null 2>&1; then
  for schema in "$SCHEMAS"/*.json; do
  base="$(basename "$schema" .json)"
  datamodel-codegen \
    --input "$schema" \
    --input-file-type jsonschema \
    --output-model-type pydantic_v2.BaseModel \
    --output "$PY_OUT/generated_${base}.py" \
    --use-standard-collections \
    --use-union-operator
  done
  echo "Generated Python stubs in $PY_OUT/generated_*.py (review + merge into models.py)"
else
  echo "datamodel-codegen not installed; skipping (hand-maintained models.py is source for Phase 0)"
fi

echo "==> Rust (typify)"
if command -v typify >/dev/null 2>&1; then
  typify "$SCHEMAS/command-envelope.json" -o "$RUST_OUT/generated_command_envelope.rs"
  echo "Generated Rust stub (review + merge into types.rs)"
else
  echo "typify not installed; skipping (hand-maintained types.rs is source for Phase 0)"
fi

echo "Done."
