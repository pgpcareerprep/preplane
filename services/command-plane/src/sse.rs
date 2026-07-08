use preplane_contracts::CommandEnvelope;
use serde_json::json;

pub fn format_stage_sse(
    target_summary: &str,
    pending_action_id: &str,
    expires_at: &str,
    envelope: &CommandEnvelope,
) -> String {
    format!(
        "Staged change for {target_summary}. Review and confirm to apply.\n\n:::blocks\n{}\n:::",
        json!([{
            "type": "confirmation-card",
            "title": "Confirm LMP update",
            "target": target_summary,
            "pending_action_id": pending_action_id,
            "expires_at": expires_at,
            "current": envelope.current_snapshot,
            "proposed": envelope.proposed_snapshot,
            "idempotencyKey": envelope.idempotency_key,
            "sync_impact": "Updates LMP Tracker (sheet) and mirrors to the LMP database.",
        }])
    )
}

pub fn format_permission_denied(reason: &str, safe_alternative: Option<&str>) -> String {
    format!(
        "That change is not allowed.\n\n:::blocks\n{}\n:::",
        json!([{
            "type": "permission-denied-card",
            "reason": reason,
            "safe_alternative": safe_alternative,
        }])
    )
}

pub fn format_execute_sse(
    kind: &str,
    target: &str,
    correlation_id: &str,
    engine_ok: bool,
    engine_message: &str,
) -> String {
    let (status, details) = if engine_message.is_empty() {
        (
            "queued",
            format!("Command recorded (correlation {correlation_id}). LMP engine not configured."),
        )
    } else if engine_ok {
        ("success", engine_message.to_string())
    } else {
        ("error", engine_message.to_string())
    };
    format!(
        "Confirmed {kind} for {target}.\n\n:::blocks\n{}\n:::",
        json!([{
            "type": "activity-feed",
            "entries": [{
                "action": format!("copilot:{kind}"),
                "status": status,
                "details": details,
            }]
        }])
    )
}

pub fn format_cancel_sse() -> String {
    "Action cancelled — no changes were made.\n\n:::blocks\n[{\"type\":\"activity-feed\",\"entries\":[{\"action\":\"Cancelled staged change\",\"status\":\"info\",\"details\":\"The pending write was discarded.\"}]}]\n:::"
        .to_string()
}

pub fn format_idempotent_replay(target: &str) -> String {
    format!(
        "This change was already applied (idempotency match) for {target}.\n\n:::blocks\n{{\"type\":\"activity-feed\",\"entries\":[{{\"action\":\"Duplicate submit ignored\",\"status\":\"info\",\"details\":\"Same idempotency key — no second write was performed.\"}}]}}\n:::"
    )
}
