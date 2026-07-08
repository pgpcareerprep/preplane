use crate::validate::{validate_chat_write_kind, ValidationError};
use chrono::Utc;
use preplane_contracts::{CommandEnvelope, CommandKind};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub struct PrepareInput {
    pub kind: String,
    pub payload: Value,
    pub requested_by: String,
    pub entity_id: Option<String>,
    pub current_snapshot: Option<Value>,
    pub proposed_snapshot: Option<Value>,
}

pub struct PrepareOutput {
    pub envelope: CommandEnvelope,
    pub target_summary: String,
}

pub fn command_kind_for_write_kind(kind: &str) -> Option<CommandKind> {
    match kind {
        "add_lmp_record" => Some(CommandKind::AddLmpRecord),
        "update_lmp_status" => Some(CommandKind::UpdateLmpStatus),
        "update_lmp_field" => Some(CommandKind::UpdateLmpField),
        "assign_poc" => Some(CommandKind::AssignPoc),
        "delete_lmp_record" => Some(CommandKind::DeleteLmpRecord),
        "bulk_update" => Some(CommandKind::BulkUpdate),
        "log_submission" => Some(CommandKind::LogSubmission),
        _ => None,
    }
}

pub fn compute_idempotency_key(command: &str, entity_id: &str, payload: &Value, requested_by: &str) -> String {
    let canonical = json!({
        "command": command,
        "entityId": entity_id,
        "payload": payload,
        "requestedBy": requested_by,
    });
    let digest = Sha256::digest(canonical.to_string().as_bytes());
    format!("idem_{}", hex::encode(digest)[..32].to_string())
}

mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }
}

pub fn prepare_command(input: PrepareInput) -> Result<PrepareOutput, ValidationError> {
    let normalized = validate_chat_write_kind(&input.kind, &input.payload)?;
    let command = command_kind_for_write_kind(&input.kind)
        .ok_or_else(|| ValidationError {
            error: format!("Unknown write kind: {}", input.kind),
            ask: "That write action is not supported yet.".into(),
            missing: vec![],
        })?;
    let company = normalized
        .get("company")
        .and_then(Value::as_str)
        .unwrap_or("");
    let role = normalized.get("role").and_then(Value::as_str).unwrap_or("");
    let entity_id = input.entity_id.unwrap_or_else(|| format!("lmp_{company}_{role}"));
    let command_label = serde_json::to_value(&command)
        .ok()
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| input.kind.clone());
    let idempotency_key = compute_idempotency_key(
        &command_label,
        &entity_id,
        &normalized,
        &input.requested_by,
    );
    let current_snapshot = input.current_snapshot.or_else(|| {
        Some(json!({
            "status": normalized.get("status").cloned().unwrap_or(Value::String("In Progress".into())),
            "company": company,
            "role": role,
        }))
    });
    let proposed_snapshot = input.proposed_snapshot.or_else(|| {
        Some(json!({
            "status": normalized.get("status"),
            "company": company,
            "role": role,
        }))
    });
    let envelope = CommandEnvelope {
        command,
        entity_id: entity_id.clone(),
        payload: normalized.clone(),
        idempotency_key,
        requested_by: input.requested_by.clone(),
        issued_at: Utc::now(),
        current_snapshot,
        proposed_snapshot,
    };
    let target_summary = format!("{company} · {role}");
    Ok(PrepareOutput {
        envelope,
        target_summary,
    })
}

pub fn format_command_sse(output: &PrepareOutput) -> String {
    let env = &output.envelope;
    let command_label = serde_json::to_value(&env.command)
        .ok()
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    format!(
        "Validated command envelope for {}. Execution is staged for Phase 4 — no write was performed.\n\n:::blocks\n{}\n:::",
        output.target_summary,
        json!([{
            "type": "confirmation-card",
            "title": "Confirm LMP update",
            "target": output.target_summary,
            "current": env.current_snapshot,
            "proposed": env.proposed_snapshot,
            "idempotencyKey": env.idempotency_key,
            "command": command_label,
            "phase": "validated_only",
        }])
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn emits_envelope_with_idempotency_key() {
        let out = prepare_command(PrepareInput {
            kind: "update_lmp_status".into(),
            payload: json!({ "company": "Acme", "role": "PM", "status": "On Hold" }),
            requested_by: "user-1".into(),
            entity_id: Some("lmp-1".into()),
            current_snapshot: Some(json!({ "status": "In Progress" })),
            proposed_snapshot: Some(json!({ "status": "On Hold" })),
        })
        .unwrap();
        assert!(out.envelope.idempotency_key.starts_with("idem_"));
        assert_eq!(out.envelope.command, CommandKind::UpdateLmpStatus);
    }
}
