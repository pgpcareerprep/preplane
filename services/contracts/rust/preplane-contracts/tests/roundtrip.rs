use preplane_contracts::CommandEnvelope;
use std::fs;
use std::path::PathBuf;

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/command_envelope_sample.json")
}

#[test]
fn command_envelope_roundtrip_from_fixture() {
    let raw = fs::read_to_string(fixture_path()).expect("fixture readable");
    let parsed: CommandEnvelope = serde_json::from_str(&raw).expect("fixture parses");
    let serialized = serde_json::to_string(&parsed).expect("serializes");
    let reparsed: CommandEnvelope = serde_json::from_str(&serialized).expect("reparses");
    assert_eq!(parsed, reparsed);
}

#[test]
fn command_envelope_exports_for_python_bridge() {
    let raw = fs::read_to_string(fixture_path()).expect("fixture readable");
    let parsed: CommandEnvelope = serde_json::from_str(&raw).expect("fixture parses");
    let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures");
    let out_path = out_dir.join("command_envelope_rust_export.json");
    let json = serde_json::to_string_pretty(&parsed).expect("serialize");
    fs::write(&out_path, json).expect("write export");
}

#[test]
#[ignore = "Phase 1+: gateway behavior not implemented"]
fn gateway_behavior_not_implemented() {
    panic!("gateway behavior pending Phase 1");
}
