#[test]
fn command_plane_uses_governance() {
    use preplane_governance::check_permission;
    assert!(!check_permission("allocator", "bulk_update").allowed);
}
