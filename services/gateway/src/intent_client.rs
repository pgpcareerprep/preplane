use crate::config::Config;
use preplane_contracts::IntentDecision;
use serde::Deserialize;

pub async fn classify_utterance(
    config: &Config,
    utterance: &str,
    ctx: &RouterContextInput,
) -> Option<IntentDecision> {
    let base = config.intent_router_url.as_ref()?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(120))
        .build()
        .ok()?;
    let resp = client
        .post(format!("{}/classify", base.trim_end_matches('/')))
        .json(&serde_json::json!({
            "utterance": utterance,
            "context": ctx,
        }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json().await.ok()
}

#[derive(Debug, serde::Serialize)]
pub struct RouterContextInput {
    pub role: Option<String>,
    pub real_role: Option<String>,
    pub view_as_role: Option<String>,
    pub view_as_user_name: Option<String>,
    pub lmp_id: Option<String>,
    pub mode: Option<String>,
    pub history_len: usize,
}

#[derive(Debug, Deserialize)]
pub struct PathSseResponse {
    pub sse_text: String,
}

#[derive(Debug, Deserialize)]
pub struct QueryExecuteResponse {
    pub sse_text: String,
}

#[derive(Debug, Deserialize)]
pub struct CommandPrepareResponse {
    pub sse_text: String,
}

pub async fn call_query_path(
    config: &Config,
    template: &str,
    utterance: &str,
    sub_intent: &str,
    role: Option<&str>,
    user_name: Option<&str>,
    args: serde_json::Value,
) -> Option<String> {
    let base = config.query_path_url.as_ref()?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;
    let resp = client
        .post(format!("{}/execute", base.trim_end_matches('/')))
        .json(&serde_json::json!({
            "template": template,
            "utterance": utterance,
            "sub_intent": sub_intent,
            "role": role,
            "userName": user_name,
            "args": args,
        }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<QueryExecuteResponse>().await.ok().map(|r| r.sse_text)
}

#[derive(Debug, Deserialize)]
pub struct CommandStageResponse {
    pub sse_text: String,
    #[serde(default)]
    pub pending_action_id: String,
}

#[derive(Debug, Deserialize)]
pub struct CommandExecuteResponse {
    pub sse_text: String,
}

#[derive(Debug, Deserialize)]
pub struct CommandCancelResponse {
    pub sse_text: String,
}

pub async fn call_command_plane_stage(
    config: &Config,
    utterance: &str,
    role: Option<&str>,
    view_as_role: Option<&str>,
    requested_by: &str,
    actor_name: Option<&str>,
) -> Option<String> {
    let base = config.command_plane_url.as_ref()?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;
    let resp = client
        .post(format!("{}/stage", base.trim_end_matches('/')))
        .json(&serde_json::json!({
            "utterance": utterance,
            "role": role,
            "viewAsRole": view_as_role,
            "requestedBy": requested_by,
            "actorName": actor_name,
            "payload": {},
        }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<CommandStageResponse>()
        .await
        .ok()
        .map(|r| r.sse_text)
}

pub async fn call_command_plane_execute(
    config: &Config,
    pending_action_id: &str,
    user_id: &str,
    role: Option<&str>,
    view_as_role: Option<&str>,
    actor_name: Option<&str>,
) -> Option<String> {
    let base = config.command_plane_url.as_ref()?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;
    let resp = client
        .post(format!("{}/execute", base.trim_end_matches('/')))
        .json(&serde_json::json!({
            "pendingActionId": pending_action_id,
            "userId": user_id,
            "role": role,
            "viewAsRole": view_as_role,
            "actorName": actor_name,
        }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<CommandExecuteResponse>()
        .await
        .ok()
        .map(|r| r.sse_text)
}

pub async fn call_command_plane_cancel(
    config: &Config,
    pending_action_id: &str,
    user_id: &str,
) -> Option<String> {
    let base = config.command_plane_url.as_ref()?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;
    let resp = client
        .post(format!("{}/cancel", base.trim_end_matches('/')))
        .json(&serde_json::json!({
            "pendingActionId": pending_action_id,
            "userId": user_id,
        }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<CommandCancelResponse>()
        .await
        .ok()
        .map(|r| r.sse_text)
}

pub async fn call_command_path(
    config: &Config,
    utterance: &str,
    role: Option<&str>,
    view_as_role: Option<&str>,
    requested_by: &str,
) -> Option<String> {
    let base = config.command_path_url.as_ref()?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;
    let resp = client
        .post(format!("{}/prepare", base.trim_end_matches('/')))
        .json(&serde_json::json!({
            "utterance": utterance,
            "role": role,
            "viewAsRole": view_as_role,
            "requestedBy": requested_by,
            "payload": {},
        }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<CommandPrepareResponse>().await.ok().map(|r| r.sse_text)
}

pub async fn call_reasoning_path(
    config: &Config,
    utterance: &str,
    sub_intent: &str,
    role: Option<&str>,
    lmp_id: Option<&str>,
    mode: Option<&str>,
) -> Option<String> {
    let base = config.reasoning_url.as_ref()?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .ok()?;
    let resp = client
        .post(format!("{}/plan", base.trim_end_matches('/')))
        .json(&serde_json::json!({
            "utterance": utterance,
            "sub_intent": sub_intent,
            "role": role,
            "lmp_id": lmp_id,
            "mode": mode,
        }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<PathSseResponse>().await.ok().map(|r| r.sse_text)
}

pub async fn call_workflow_path(config: &Config, utterance: &str) -> Option<String> {
    let base = config.workflow_url.as_ref()?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;
    let resp = client
        .post(format!("{}/decompose", base.trim_end_matches('/')))
        .json(&serde_json::json!({ "utterance": utterance }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<PathSseResponse>().await.ok().map(|r| r.sse_text)
}

pub fn query_template_for_sub_intent(sub_intent: &str) -> (&'static str, serde_json::Value) {
    match sub_intent {
        "analytics_query" | "dashboard_query" => ("get_analytics", serde_json::json!({ "metric": "pipeline_summary" })),
        "poc_allocation" => ("get_analytics", serde_json::json!({ "metric": "poc_workload" })),
        _ => ("search_lmp_records", serde_json::json!({ "limit": 50 })),
    }
}
