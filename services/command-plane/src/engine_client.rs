use preplane_contracts::CommandEnvelope;
use serde::Deserialize;
use serde_json::Value;

pub struct EngineExecuteInput<'a> {
    pub command_log_id: &'a str,
    pub envelope: &'a CommandEnvelope,
    pub actor_name: Option<&'a str>,
    pub role: Option<&'a str>,
    pub current_snapshot: Option<&'a Value>,
    pub proposed_snapshot: Option<&'a Value>,
}

#[derive(Debug, Deserialize)]
struct EngineExecuteResponse {
    ok: bool,
    message: String,
    details: Value,
}

pub struct EngineExecuteResult {
    pub ok: bool,
    pub message: String,
    pub details: Value,
}

pub async fn call_lmp_engine(
    base_url: &str,
    input: EngineExecuteInput<'_>,
) -> Option<EngineExecuteResult> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .ok()?;
    let resp = client
        .post(format!("{}/execute", base_url.trim_end_matches('/')))
        .json(&serde_json::json!({
            "commandLogId": input.command_log_id,
            "envelope": input.envelope,
            "actorName": input.actor_name,
            "role": input.role,
            "currentSnapshot": input.current_snapshot,
            "proposedSnapshot": input.proposed_snapshot,
        }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let body: EngineExecuteResponse = resp.json().await.ok()?;
    Some(EngineExecuteResult {
        ok: body.ok,
        message: body.message,
        details: body.details,
    })
}
