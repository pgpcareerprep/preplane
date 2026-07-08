use serde_json::Value;

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

    pub async fn patch_command_log_result(
        &self,
        command_log_id: &str,
        result: Value,
    ) -> Result<(), String> {
        let url = format!(
            "{}/rest/v1/command_log?id=eq.{}",
            self.base_url, command_log_id
        );
        let resp = self
            .auth_headers(self.http.patch(&url))
            .json(&serde_json::json!({ "result": result }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("command_log patch failed: {}", resp.status()))
        }
    }

    pub async fn insert_activity_log(&self, body: Value) {
        let url = format!("{}/rest/v1/activity_log", self.base_url);
        let _ = self
            .auth_headers(self.http.post(&url))
            .header("Prefer", "return=minimal")
            .json(&body)
            .send()
            .await;
    }
}
