use crate::rbac::{check_permission, write_kind_perm};
use crate::supabase::SupabaseClient;
use serde_json::Value;

pub struct GuardContext {
    pub role: String,
    pub user_id: String,
    pub actor_name: Option<String>,
    pub view_as_role: Option<String>,
}

pub struct GuardBlock {
    pub reason: String,
    pub safe_alternative: Option<String>,
}

const POC_WRITABLE_FIELDS: &[&str] = &[
    "daily_progress",
    "prep_progress",
    "placement_progress",
    "remarks",
    "mentor_aligned",
    "status",
    "r1_names",
    "r2_names",
    "r3_names",
    "final_converted_names",
    "Daily Progress",
    "Prep Progress",
    "Placement Progress",
    "Remarks",
    "Status",
];

pub fn view_as_blocks_writes(view_as_role: Option<&str>) -> bool {
    view_as_role.is_some()
}

pub async fn enforce_write_guard(
    sb: &SupabaseClient,
    ctx: &GuardContext,
    kind: &str,
    payload: &Value,
) -> Result<(), GuardBlock> {
    if view_as_blocks_writes(ctx.view_as_role.as_deref()) {
        return Err(GuardBlock {
            reason: "View-as mode is read-only. Switch back to your own perspective to make changes.".into(),
            safe_alternative: None,
        });
    }
    let perm = write_kind_perm(kind).ok_or_else(|| GuardBlock {
        reason: format!("Unknown write kind: {kind}"),
        safe_alternative: None,
    })?;
    let perm_result = check_permission(&ctx.role, perm);
    if !perm_result.allowed {
        return Err(GuardBlock {
            reason: perm_result.reason.unwrap_or_default(),
            safe_alternative: perm_result.safe_alternative,
        });
    }
    if ctx.role == "poc" {
        if matches!(
            kind,
            "update_lmp_status" | "update_lmp_field" | "assign_poc" | "delete_lmp_record"
        ) {
            let own = sb.assert_poc_owns_lmp(&ctx.user_id, payload).await;
            if !own.ok {
                return Err(GuardBlock {
                    reason: own.reason.unwrap_or_else(|| "POC ownership check failed".into()),
                    safe_alternative: None,
                });
            }
        }
        if kind == "bulk_update" {
            if let Some(updates) = payload.get("updates").and_then(Value::as_array) {
                for u in updates {
                    let own = sb.assert_poc_owns_lmp(&ctx.user_id, u).await;
                    if !own.ok {
                        return Err(GuardBlock {
                            reason: format!(
                                "Bulk update blocked: {}",
                                own.reason.unwrap_or_default()
                            ),
                            safe_alternative: None,
                        });
                    }
                }
            }
        }
        if kind == "update_lmp_field" {
            if let Some(fields) = payload.get("fields").and_then(Value::as_object) {
                for key in fields.keys() {
                    let norm = key.trim();
                    let snake = norm.to_lowercase().replace(' ', "_");
                    if !POC_WRITABLE_FIELDS.contains(&norm) && !POC_WRITABLE_FIELDS.contains(&snake.as_str()) {
                        return Err(GuardBlock {
                            reason: format!(
                                "POC role cannot edit: {key}. Ask an admin or allocator."
                            ),
                            safe_alternative: None,
                        });
                    }
                }
            }
        }
    }
    Ok(())
}
