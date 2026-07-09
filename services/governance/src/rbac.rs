use crate::contract::action_matrix;

#[derive(Debug, Clone)]
pub struct PermissionResult {
    pub allowed: bool,
    pub role: String,
    pub action: String,
    pub reason: Option<String>,
    pub safe_alternative: Option<String>,
    pub human_action: String,
}

fn human_label(action: &str) -> String {
    match action {
        "create_lmp" => "create an LMP process".into(),
        "edit_lmp" => "edit this LMP".into(),
        "delete_lmp" => "delete an LMP".into(),
        "assign_poc" => "assign a POC".into(),
        "reassign_poc" => "reassign a POC".into(),
        "change_status" => "change status".into(),
        "change_domain" => "change domain".into(),
        "edit_remarks" => "edit remarks".into(),
        "edit_daily_progress" => "edit daily progress".into(),
        "bulk_update" => "perform a bulk update".into(),
        "copilot_summarize" => "summarize".into(),
        "copilot_search" => "search".into(),
        "copilot_analyze" => "analyze".into(),
        _ => action.to_string(),
    }
}

fn safe_alternative(action: &str) -> Option<&'static str> {
    match action {
        "delete_lmp" => {
            Some("Ask an admin to delete this LMP, or mark its status as 'Closed' instead.")
        }
        "create_lmp" => {
            Some("Send the new LMP details to your admin/allocator to create it for you.")
        }
        "bulk_update" => {
            Some("Update records one at a time, or request an admin to run the bulk operation.")
        }
        "assign_poc" => Some("Suggest the assignment to your allocator/admin — they can confirm it."),
        "reassign_poc" => Some("Ask your allocator/admin to reassign the POC."),
        "change_domain" => Some("Flag the domain change to a allocator/admin for approval."),
        _ => None,
    }
}

pub fn allowed_roles(action: &str) -> Option<&'static [&'static str]> {
    action_matrix(action)
}

pub fn check_permission(role: &str, action: &str) -> PermissionResult {
    let role = if role.is_empty() { "poc" } else { role };
    let human_action = human_label(action);
    let Some(roles) = action_matrix(action) else {
        return PermissionResult {
            allowed: false,
            role: role.to_string(),
            action: action.to_string(),
            reason: Some(format!("Unknown action: {action}")),
            safe_alternative: None,
            human_action,
        };
    };
    let allowed = roles.contains(&role);
    PermissionResult {
        allowed,
        role: role.to_string(),
        action: action.to_string(),
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

pub fn can_write(role: &str, action: &str) -> bool {
    check_permission(role, action).allowed
}

pub fn write_kind_perm(kind: &str) -> Option<&'static str> {
    match kind {
        "update_lmp_status" => Some("change_status"),
        "update_lmp_field" => Some("edit_lmp"),
        "assign_poc" => Some("assign_poc"),
        "add_lmp_record" => Some("create_lmp"),
        "delete_lmp_record" => Some("delete_lmp"),
        "bulk_update" => Some("bulk_update"),
        "log_submission" => Some("update_candidate_stage"),
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

    #[test]
    fn allocator_cannot_bulk_update() {
        assert!(!check_permission("allocator", "bulk_update").allowed);
    }

    #[test]
    fn admin_can_bulk_update() {
        assert!(check_permission("admin", "bulk_update").allowed);
    }
}
