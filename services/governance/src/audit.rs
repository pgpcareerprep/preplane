use serde_json::{json, Value};

/// Build an `activity_log` row for copilot write actions (parity with `execute_pending`).
pub fn copilot_activity_entry(
    actor_name: &str,
    role: &str,
    kind: &str,
    entity_id: &str,
    previous_value: Option<&Value>,
    new_value: Option<&Value>,
    metadata: Value,
) -> Value {
    json!({
        "actor_name": actor_name,
        "poc_role_type": match role {
            "admin" => "admin",
            "allocator" => "system",
            _ => "primary",
        },
        "entity_type": if kind == "bulk_update" { "lmp_bulk" } else { "lmp" },
        "entity_id": entity_id,
        "action": format!("copilot:{kind}"),
        "previous_value": previous_value,
        "new_value": new_value,
        "metadata": metadata,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn activity_entry_has_action() {
        let row = copilot_activity_entry(
            "Alex",
            "poc",
            "update_lmp_status",
            "lmp-1",
            None,
            None,
            json!({}),
        );
        assert_eq!(row["action"], "copilot:update_lmp_status");
    }
}
