use crate::supabase::SupabaseClient;
use preplane_contracts::CommandEnvelope;
use serde_json::{json, Value};

pub struct PublishResult {
    pub command_log_id: String,
    pub correlation_id: String,
}

pub async fn publish_command(
    sb: &SupabaseClient,
    envelope: &CommandEnvelope,
    correlation_id: &str,
) -> Result<PublishResult, String> {
    let command_name = serde_json::to_value(&envelope.command)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_else(|| "UNKNOWN".into());
    let body = json!({
        "idempotency_key": envelope.idempotency_key,
        "command": command_name,
        "entity_id": envelope.entity_id,
        "payload": envelope.payload,
        "requested_by": envelope.requested_by,
        "issued_at": envelope.issued_at,
        "result": json!({
            "status": "queued",
            "phase": 4,
            "note": "Awaiting LMP engine execution."
        }),
        "correlation_id": correlation_id,
    });
    let url = format!("{}/rest/v1/command_log", sb.base_url);
    let resp = sb
        .auth_headers(sb.http.post(&url))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().as_u16() == 409 {
        if let Some(prior) =
            crate::idempotency::find_prior_execution(sb, &envelope.idempotency_key).await
        {
            return Ok(PublishResult {
                command_log_id: prior.command_log_id,
                correlation_id: correlation_id.to_string(),
            });
        }
    }
    if !resp.status().is_success() {
        return Err(format!("command_log insert failed: {}", resp.status()));
    }
    let rows: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
    let id = rows
        .first()
        .and_then(|r| r.get("id"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let outbox = json!({
        "event_type": "LMP_Updated",
        "entity_id": envelope.entity_id,
        "payload": json!({
            "command": command_name,
            "idempotencyKey": envelope.idempotency_key,
        }),
        "correlation_id": correlation_id,
        "status": "pending",
    });
    let outbox_url = format!("{}/rest/v1/event_outbox", sb.base_url);
    let _ = sb
        .auth_headers(sb.http.post(&outbox_url))
        .json(&outbox)
        .send()
        .await;
    Ok(PublishResult {
        command_log_id: id,
        correlation_id: correlation_id.to_string(),
    })
}
