/// Matches `PERMISSION_CONTRACT_VERSION` in `permissionContract.ts`.
pub const PERMISSION_CONTRACT_VERSION: &str = "2026-06-18.1";

pub const VIEW_AS_READ_ONLY: bool = true;

/// Full action matrix lookup (parity with `ACTION_MATRIX` in `permissionContract.ts`).
pub fn action_matrix(action: &str) -> Option<&'static [&'static str]> {
    match action {
        "view_all_lmps" => Some(&["admin", "allocator"]),
        "view_own_lmps" | "view_other_poc_lmps_summary" => Some(&["admin", "allocator", "poc"]),
        "create_lmp" | "delete_lmp" | "assign_poc" | "reassign_poc" | "assign_outreach_poc"
        | "delete_comment" | "view_full_activity" | "change_domain" | "edit_domains"
        | "rollback_managed" | "allocate_poc" => Some(&["admin", "allocator"]),
        "edit_lmp" | "configure_rounds" | "assign_mentor" | "run_mentor" | "change_status"
        | "edit_daily_progress" | "edit_prep_status" | "edit_mentor_status" | "edit_mock_status"
        | "edit_assignment_review" | "edit_outreach_progress" | "edit_remarks" | "edit_checklist"
        | "edit_next_progress" | "add_candidate" | "remove_candidate" | "update_candidate_stage"
        | "update_session" | "add_feedback" | "add_activity_comment" | "upload_jd"
        | "rollback_own" | "copilot_summarize" | "copilot_search" | "copilot_analyze"
        | "copilot_draft_update" | "copilot_execute_update" | "view_domains" | "view_unmapped"
        | "view_all_students" | "view_own_students" => Some(&["admin", "allocator", "poc"]),
        "bulk_update" => Some(&["admin"]),
        "view_all_pocs" | "view_poc_load" => Some(&["admin", "allocator"]),
        "manage_users" | "manage_rbac" | "view_settings" | "view_audit_logs" | "view_sync_logs"
        | "view_field_mapping" | "edit_field_mapping" | "rollback_any" | "resolve_unmapped" => {
            Some(&["admin"])
        }
        _ => None,
    }
}

pub const POC_WRITABLE_LMP_COLUMNS: &[&str] = &[
    "company",
    "role",
    "daily_progress",
    "prep_progress",
    "placement_progress",
    "next_progress_date",
    "next_progress_status",
    "next_progress_type",
    "next_progress_reminder_type",
    "last_progress_updated_at",
    "remarks",
    "mentor_aligned",
    "prep_doc_shared",
    "assignment_review",
    "one_to_one_mock",
    "behavioral_status",
    "status",
    "r1_names",
    "r2_names",
    "r3_names",
    "final_converted_names",
    "final_converted_numbers",
    "prep_doc",
    "Daily Progress",
    "Prep Progress",
    "Placement Progress",
    "Remarks",
    "Mentor Aligned",
    "Prep Doc Shared",
    "Assignment Review",
    "One-to-one Mock",
    "Status",
    "R1 - Names",
    "R2 - Names",
    "R3 - Names",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contract_version_matches_ts() {
        assert_eq!(PERMISSION_CONTRACT_VERSION, "2026-06-18.1");
    }

    #[test]
    fn bulk_update_admin_only() {
        assert_eq!(action_matrix("bulk_update"), Some(&["admin"][..]));
    }
}
