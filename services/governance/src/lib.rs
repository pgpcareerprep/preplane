//! PrepLane governance — RBAC/ABAC ported from `permissionContract.ts` + `rbac.ts`.

pub mod abac;
pub mod audit;
pub mod contract;
pub mod rbac;

pub use abac::{
    field_editable, field_requires_ownership, poc_writable_field, view_as_blocks_writes,
};
pub use audit::copilot_activity_entry;
pub use contract::{PERMISSION_CONTRACT_VERSION, VIEW_AS_READ_ONLY};
pub use rbac::{
    allowed_roles, can_write, check_permission, write_kind_perm, PermissionResult,
};
