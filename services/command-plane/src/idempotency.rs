use crate::supabase::SupabaseClient;
use serde_json::Value;

pub struct PriorResult {
    pub command_log_id: String,
    pub result: Value,
}

pub async fn find_prior_execution(
    sb: &SupabaseClient,
    idempotency_key: &str,
) -> Option<PriorResult> {
    let url = format!(
        "{}/rest/v1/command_log?select=id,result&idempotency_key=eq.{}&limit=1",
        sb.base_url, idempotency_key
    );
    let resp = sb.auth_headers(sb.http.get(&url)).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let rows: Vec<Value> = resp.json().await.ok()?;
    let row = rows.first()?;
    Some(PriorResult {
        command_log_id: row["id"].as_str()?.to_string(),
        result: row.get("result").cloned().unwrap_or(Value::Null),
    })
}
