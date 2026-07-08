#[test]
fn execute_module_exports() {
    assert!(std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("src/execute.rs")
        .exists());
}
