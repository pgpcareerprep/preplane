use crate::supabase::SupabaseClient;
use preplane_governance::{check_permission, poc_writable_field, view_as_blocks_writes, write_kind_perm};
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
                    if !poc_writable_field(key) {
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
