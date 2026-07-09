#[test]
fn governance_exports_rbac() {
    use preplane_governance::{check_permission, PERMISSION_CONTRACT_VERSION};
    assert_eq!(PERMISSION_CONTRACT_VERSION, "2026-06-18.1");
    assert!(check_permission("poc", "change_status").allowed);
}
