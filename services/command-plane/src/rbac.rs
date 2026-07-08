#[derive(Debug, Clone)]
pub struct PermissionResult {
    pub allowed: bool,
    pub reason: Option<String>,
    pub safe_alternative: Option<String>,
    pub human_action: String,
}

fn allowed_roles(action: &str) -> Option<&'static [&'static str]> {
    match action {
        "create_lmp" => Some(&["admin", "allocator"]),
        "edit_lmp" | "change_status" | "edit_daily_progress" | "edit_remarks" => {
            Some(&["admin", "allocator", "poc"])
        }
        "delete_lmp" | "assign_poc" | "bulk_update" => Some(&["admin", "allocator"]),
        _ => None,
    }
}

fn human_label(action: &str) -> String {
    match action {
        "create_lmp" => "create an LMP process".into(),
        "edit_lmp" => "edit this LMP".into(),
        "delete_lmp" => "delete an LMP".into(),
        "assign_poc" => "assign a POC".into(),
        "change_status" => "change status".into(),
        "bulk_update" => "perform a bulk update".into(),
        _ => action.to_string(),
    }
}

fn safe_alternative(action: &str) -> Option<&'static str> {
    match action {
        "delete_lmp" => Some("Ask an admin to delete this LMP, or mark its status as 'Closed' instead."),
        "create_lmp" => Some("Send the new LMP details to your admin/allocator to create it for you."),
        "bulk_update" => Some("Update records one at a time, or request an admin to run the bulk operation."),
        "assign_poc" => Some("Suggest the assignment to your allocator/admin — they can confirm it."),
        _ => None,
    }
}

pub fn check_permission(role: &str, action: &str) -> PermissionResult {
    let role = if role.is_empty() { "poc" } else { role };
    let human_action = human_label(action);
    let Some(roles) = allowed_roles(action) else {
        return PermissionResult {
            allowed: false,
            reason: Some(format!("Unknown action: {action}")),
            safe_alternative: None,
            human_action,
        };
    };
    let allowed = roles.contains(&role);
    PermissionResult {
        allowed,
        reason: if allowed {
            None
        } else {
            Some(format!(
                "Role \"{role}\" cannot {human_action}. Allowed roles: {}.",
                roles.join(", ")
            ))
        },
        safe_alternative: if allowed {
            None
        } else {
            safe_alternative(action).map(str::to_string)
        },
        human_action,
    }
}

pub fn write_kind_perm(kind: &str) -> Option<&'static str> {
    match kind {
        "update_lmp_status" => Some("change_status"),
        "update_lmp_field" => Some("edit_lmp"),
        "assign_poc" => Some("assign_poc"),
        "add_lmp_record" => Some("create_lmp"),
        "delete_lmp_record" => Some("delete_lmp"),
        "bulk_update" => Some("bulk_update"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poc_can_change_status() {
        assert!(check_permission("poc", "change_status").allowed);
    }

    #[test]
    fn poc_cannot_bulk_update() {
        assert!(!check_permission("poc", "bulk_update").allowed);
    }
}
