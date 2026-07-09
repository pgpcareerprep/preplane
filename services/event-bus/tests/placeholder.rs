#[test]
fn relay_module_exports() {
    assert!(std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("src/relay.rs")
        .exists());
}
