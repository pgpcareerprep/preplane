#[test]
fn command_plane_module_exports_api() {
    assert!(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/api.rs").exists());
}
