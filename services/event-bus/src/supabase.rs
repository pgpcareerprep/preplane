use chrono::Utc;
use serde_json::{json, Value};

#[derive(Clone, Debug)]
pub struct OutboxEvent {
    pub id: String,
    pub event_type: String,
    pub entity_id: Option<String>,
    pub payload: Value,
    pub occurred_at: String,
    pub actor: Option<Value>,
    pub causation_id: Option<String>,
    pub correlation_id: Option<String>,
}

#[derive(Clone)]
pub struct SupabaseClient {
    pub base_url: String,
    pub service_key: String,
    pub(crate) http: reqwest::Client,
}

impl SupabaseClient {
    pub fn from_env() -> Self {
        let base_url = std::env::var("SUPABASE_URL")
            .or_else(|_| std::env::var("VITE_SUPABASE_URL"))
            .expect("SUPABASE_URL required")
            .trim_end_matches('/')
            .to_string();
        let service_key =
            std::env::var("SUPABASE_SERVICE_ROLE_KEY").expect("SUPABASE_SERVICE_ROLE_KEY required");
        Self {
            base_url,
            service_key,
            http: reqwest::Client::new(),
        }
    }

    pub(crate) fn auth_headers(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        req.header("apikey", &self.service_key)
            .header("Authorization", format!("Bearer {}", self.service_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
    }

    pub async fn fetch_pending(&self, limit: usize) -> Result<Vec<OutboxEvent>, String> {
        let url = format!(
            "{}/rest/v1/event_outbox?select=id,event_type,entity_id,payload,occurred_at,actor,causation_id,correlation_id&status=eq.pending&order=occurred_at.asc&limit={limit}",
            self.base_url
        );
        let resp = self
            .auth_headers(self.http.get(&url))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("fetch pending failed: {}", resp.status()));
        }
        let rows: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                Some(OutboxEvent {
                    id: row.get("id")?.as_str()?.to_string(),
                    event_type: row.get("event_type")?.as_str()?.to_string(),
                    entity_id: row
                        .get("entity_id")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    payload: row.get("payload").cloned().unwrap_or(json!({})),
                    occurred_at: row
                        .get("occurred_at")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    actor: row.get("actor").cloned(),
                    causation_id: row
                        .get("causation_id")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    correlation_id: row
                        .get("correlation_id")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                })
            })
            .collect())
    }

    pub async fn mark_published(&self, id: &str, message_id: &str) -> Result<(), String> {
        let url = format!("{}/rest/v1/event_outbox?id=eq.{}", self.base_url, id);
        let body = json!({
            "status": "published",
            "published_at": Utc::now().to_rfc3339(),
        });
        let resp = self
            .auth_headers(self.http.patch(&url))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status().is_success() {
            tracing::debug!(event_id = %id, redis_message_id = %message_id, "outbox marked published");
            Ok(())
        } else {
            Err(format!("mark published failed: {}", resp.status()))
        }
    }

    pub async fn mark_failed(&self, id: &str, _error: &str) -> Result<(), String> {
        let url = format!("{}/rest/v1/event_outbox?id=eq.{}", self.base_url, id);
        let resp = self
            .auth_headers(self.http.patch(&url))
            .json(&json!({ "status": "failed" }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("mark failed failed: {}", resp.status()))
        }
    }

    pub async fn insert_dead_letter(
        &self,
        stream_name: &str,
        message_id: Option<&str>,
        payload: &Value,
        error: &str,
        retry_count: i32,
    ) {
        let url = format!("{}/rest/v1/dead_letter_queue", self.base_url);
        let _ = self
            .auth_headers(self.http.post(&url))
            .header("Prefer", "return=minimal")
            .json(&json!({
                "stream_name": stream_name,
                "message_id": message_id,
                "payload": payload,
                "error": error,
                "retry_count": retry_count,
            }))
            .send()
            .await;
    }
}
