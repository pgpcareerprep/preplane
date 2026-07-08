use crate::supabase::SupabaseClient;
use serde_json::{json, Value};

pub struct StageInput {
    pub user_id: String,
    pub actor_name: Option<String>,
    pub role: String,
    pub kind: String,
    pub payload: Value,
    pub current_snapshot: Option<Value>,
    pub proposed_snapshot: Option<Value>,
    pub idempotency_key: String,
}

pub struct StageResult {
    pub pending_action_id: String,
    pub expires_at: String,
}

pub async fn mark_expired_pending(sb: &SupabaseClient) {
    let url = format!(
        "{}/rest/v1/copilot_pending_actions?status=eq.staged&expires_at=lt.{}",
        sb.base_url,
        chrono::Utc::now().to_rfc3339()
    );
    let _ = sb
        .auth_headers(sb.http.patch(&url))
        .json(&json!({ "status": "expired" }))
        .send()
        .await;
}

pub async fn stage_pending_action(
    sb: &SupabaseClient,
    input: StageInput,
) -> Result<StageResult, String> {
    mark_expired_pending(sb).await;
    let expires_at = (chrono::Utc::now() + chrono::Duration::minutes(10)).to_rfc3339();
    let body = json!({
        "user_id": input.user_id,
        "actor_name": input.actor_name,
        "role": input.role,
        "action_kind": input.kind,
        "payload": input.payload,
        "current_snapshot": input.current_snapshot,
        "proposed_snapshot": input.proposed_snapshot,
        "status": "staged",
        "source": "chat",
        "expires_at": expires_at,
        "idempotency_key": input.idempotency_key,
    });
    let url = format!("{}/rest/v1/copilot_pending_actions", sb.base_url);
    let resp = sb
        .auth_headers(sb.http.post(&url))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if status.as_u16() == 409 || text.contains("copilot_pending_actions_idempotency_key_unique") {
            return lookup_by_idempotency(sb, &input.idempotency_key).await;
        }
        return Err(format!("stage failed: {status} {text}"));
    }
    let rows: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
    let id = rows
        .first()
        .and_then(|r| r.get("id"))
        .and_then(Value::as_str)
        .ok_or_else(|| "stage returned no id".to_string())?;
    Ok(StageResult {
        pending_action_id: id.to_string(),
        expires_at,
    })
}

async fn lookup_by_idempotency(sb: &SupabaseClient, key: &str) -> Result<StageResult, String> {
    let url = format!(
        "{}/rest/v1/copilot_pending_actions?select=id,expires_at&status=eq.staged&idempotency_key=eq.{}&limit=1",
        sb.base_url, key
    );
    let resp = sb
        .auth_headers(sb.http.get(&url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
    let row = rows.first().ok_or_else(|| "idempotency hit but row missing".to_string())?;
    Ok(StageResult {
        pending_action_id: row["id"].as_str().unwrap_or_default().to_string(),
        expires_at: row["expires_at"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
    })
}

pub struct LoadedPending {
    pub id: String,
    pub user_id: String,
    pub kind: String,
    pub payload: Value,
    pub current_snapshot: Value,
    pub proposed_snapshot: Value,
    pub role: String,
    pub idempotency_key: Option<String>,
}

pub async fn load_pending(
    sb: &SupabaseClient,
    id: &str,
    user_id: &str,
) -> Result<LoadedPending, String> {
    mark_expired_pending(sb).await;
    let url = format!(
        "{}/rest/v1/copilot_pending_actions?id=eq.{}&limit=1",
        sb.base_url, id
    );
    let resp = sb
        .auth_headers(sb.http.get(&url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
    let row = rows.first().ok_or_else(|| "Pending action not found".to_string())?;
    if row.get("user_id").and_then(Value::as_str) != Some(user_id) {
        return Err("Pending action not found".into());
    }
    let status = row.get("status").and_then(Value::as_str).unwrap_or("");
    if status == "executed" {
        return Err("Action already executed".into());
    }
    if status == "cancelled" {
        return Err("Action was cancelled".into());
    }
    if status == "expired" {
        return Err("Pending action expired".into());
    }
    Ok(LoadedPending {
        id: row["id"].as_str().unwrap_or_default().into(),
        user_id: user_id.to_string(),
        kind: row["action_kind"].as_str().unwrap_or_default().into(),
        payload: row.get("payload").cloned().unwrap_or(json!({})),
        current_snapshot: row.get("current_snapshot").cloned().unwrap_or(json!({})),
        proposed_snapshot: row.get("proposed_snapshot").cloned().unwrap_or(json!({})),
        role: row["role"].as_str().unwrap_or("poc").into(),
        idempotency_key: row
            .get("idempotency_key")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

pub async fn claim_pending(sb: &SupabaseClient, id: &str, user_id: &str) -> Result<LoadedPending, String> {
    mark_expired_pending(sb).await;
    let url = format!(
        "{}/rest/v1/copilot_pending_actions?id=eq.{}&user_id=eq.{}&status=eq.staged&expires_at=gt.{}",
        sb.base_url,
        id,
        user_id,
        chrono::Utc::now().to_rfc3339()
    );
    let resp = sb
        .auth_headers(sb.http.patch(&url))
        .json(&json!({ "status": "pending" }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
    if rows.is_empty() {
        return load_pending(sb, id, user_id).await;
    }
    let row = &rows[0];
    Ok(LoadedPending {
        id: row["id"].as_str().unwrap_or_default().into(),
        user_id: user_id.to_string(),
        kind: row["action_kind"].as_str().unwrap_or_default().into(),
        payload: row.get("payload").cloned().unwrap_or(json!({})),
        current_snapshot: row.get("current_snapshot").cloned().unwrap_or(json!({})),
        proposed_snapshot: row.get("proposed_snapshot").cloned().unwrap_or(json!({})),
        role: row["role"].as_str().unwrap_or("poc").into(),
        idempotency_key: row
            .get("idempotency_key")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

pub async fn finalize_pending(sb: &SupabaseClient, id: &str, user_id: &str, success: bool) {
    let status = if success { "executed" } else { "staged" };
    let url = format!(
        "{}/rest/v1/copilot_pending_actions?id=eq.{}&user_id=eq.{}&status=eq.pending",
        sb.base_url, id, user_id
    );
    let mut body = json!({ "status": status });
    if success {
        body["executed_at"] = json!(chrono::Utc::now().to_rfc3339());
    }
    let _ = sb
        .auth_headers(sb.http.patch(&url))
        .json(&body)
        .send()
        .await;
}

pub async fn cancel_pending(sb: &SupabaseClient, id: &str, user_id: &str) -> Result<(), String> {
    let url = format!(
        "{}/rest/v1/copilot_pending_actions?id=eq.{}&user_id=eq.{}&status=in.(staged,pending)",
        sb.base_url, id, user_id
    );
    let resp = sb
        .auth_headers(sb.http.patch(&url))
        .json(&json!({
            "status": "cancelled",
            "cancelled_at": chrono::Utc::now().to_rfc3339(),
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err("Could not cancel pending action".into());
    }
    Ok(())
}
