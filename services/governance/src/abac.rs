use crate::contract::POC_WRITABLE_LMP_COLUMNS;

pub use crate::contract::VIEW_AS_READ_ONLY;

/// View-as mode is read-only for writes (parity with `VIEW_AS_READ_ONLY` in TS contract).
pub fn view_as_blocks_writes(view_as_role: Option<&str>) -> bool {
    VIEW_AS_READ_ONLY && view_as_role.is_some()
}

pub fn poc_writable_field(field: &str) -> bool {
    let norm = field.trim();
    let snake = norm.to_lowercase().replace(' ', "_");
    POC_WRITABLE_LMP_COLUMNS.contains(&norm) || POC_WRITABLE_LMP_COLUMNS.contains(&snake.as_str())
}

/// Field-level edit permission from `FIELD_PERMISSIONS` in `permissionContract.ts`.
pub fn field_editable(role: &str, field: &str) -> bool {
    let role = if role.is_empty() { "poc" } else { role };
    let key = field.trim().to_lowercase().replace(' ', "_");
    let roles = match key.as_str() {
        "company" | "role" | "status" | "daily_progress" | "prep_progress" | "placement_progress"
        | "r1_names" | "r2_names" | "r3_names" | "final_converted_numbers"
        | "final_converted_names" | "prep_doc" | "remarks" | "mentor_aligned"
        | "assignment_review" | "one_to_one_mock" | "behavioral_status" => {
            &["admin", "allocator", "poc"][..]
        }
        "domain" | "type" | "date" | "closing_date" | "prep_poc" | "support_poc"
        | "outreach_poc" => &["admin", "allocator"][..],
        "admin_owner" | "allocator" => &["admin"][..],
        _ => return false,
    };
    roles.contains(&role)
}

pub fn field_requires_ownership(field: &str) -> bool {
    let key = field.trim().to_lowercase().replace(' ', "_");
    matches!(
        key.as_str(),
        "company"
            | "role"
            | "status"
            | "daily_progress"
            | "prep_progress"
            | "placement_progress"
            | "r1_names"
            | "r2_names"
            | "r3_names"
            | "final_converted_numbers"
            | "final_converted_names"
            | "prep_doc"
            | "remarks"
            | "mentor_aligned"
            | "assignment_review"
            | "one_to_one_mock"
            | "behavioral_status"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn view_as_blocks_when_enabled() {
        assert!(view_as_blocks_writes(Some("poc")));
        assert!(!view_as_blocks_writes(None));
    }

    #[test]
    fn poc_can_edit_daily_progress_field() {
        assert!(field_editable("poc", "daily_progress"));
        assert!(!field_editable("poc", "domain"));
    }

    #[test]
    fn poc_writable_aliases_sheet_columns() {
        assert!(poc_writable_field("Daily Progress"));
        assert!(poc_writable_field("r1_names"));
    }
}
