use crate::config::Config;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ClassifyResponse {
    pub sub_intent: String,
    #[serde(default)]
    pub category: String,
}

pub async fn classify_utterance(
    config: &Config,
    utterance: &str,
    ctx: &RouterContextInput,
) -> Option<ClassifyResponse> {
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
