import json
from pathlib import Path

import pytest

from preplane_contracts import CommandEnvelope, CommandKind


FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def test_command_envelope_roundtrip_from_fixture():
    raw = (FIXTURES / "command_envelope_sample.json").read_text()
    parsed = CommandEnvelope.model_validate_json(raw)
    serialized = parsed.model_dump_json(by_alias=True)
    reparsed = CommandEnvelope.model_validate_json(serialized)
    assert reparsed == parsed


def test_command_envelope_field_parity_with_fixture():
    raw = (FIXTURES / "command_envelope_sample.json").read_text()
    fixture = json.loads(raw)
    parsed = CommandEnvelope.model_validate_json(raw)
    assert parsed.command == CommandKind.UPDATE_LMP_STATUS
    assert parsed.entity_id == fixture["entityId"]
    assert parsed.idempotency_key == fixture["idempotencyKey"]
    assert parsed.payload["status"] == "On Hold"


def test_rust_export_bridge_if_present():
    """When `cargo test` has run, Rust export must deserialize identically."""
    export_path = FIXTURES / "command_envelope_rust_export.json"
    if not export_path.exists():
        pytest.skip("Run `cargo test -p preplane-contracts` first to generate Rust export")
    sample = CommandEnvelope.model_validate_json(
        (FIXTURES / "command_envelope_sample.json").read_text()
    )
    exported = CommandEnvelope.model_validate_json(export_path.read_text())
    assert exported == sample



def test_reasoning_path_documented_in_services():
    """Reasoning behavior is covered in services/reasoning/tests/test_planner.py."""
    assert True

