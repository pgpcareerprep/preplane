use serde_json::Value;

#[derive(Clone)]
pub struct SupabaseClient {
    pub base_url: String,
    pub service_key: String,
    pub(crate) http: reqwest::Client,
}

pub struct OwnershipResult {
    pub ok: bool,
    pub reason: Option<String>,
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

    pub async fn assert_poc_owns_lmp(&self, user_id: &str, payload: &Value) -> OwnershipResult {
        if !matches!(
            payload.get("company").and_then(Value::as_str),
            Some(c) if !c.trim().is_empty()
        ) || !matches!(
            payload.get("role").and_then(Value::as_str),
            Some(r) if !r.trim().is_empty()
        ) {
            return OwnershipResult {
                ok: false,
                reason: Some("Missing company/role to verify LMP ownership.".into()),
            };
        }
        let company = payload["company"].as_str().unwrap().trim();
        let role = payload["role"].as_str().unwrap().trim();
        let lmp_url = format!(
            "{}/rest/v1/lmp_processes?select=id,prep_poc,support_poc,outreach_poc&company=ilike.{}&role=ilike.{}&limit=1",
            self.base_url,
            urlencoding_encode(company),
            urlencoding_encode(role),
        );
        let lmp_resp = self
            .auth_headers(self.http.get(&lmp_url))
            .send()
            .await;
        let Ok(resp) = lmp_resp else {
            return OwnershipResult {
                ok: false,
                reason: Some("Ownership check failed".into()),
            };
        };
        let Ok(rows) = resp.json::<Vec<Value>>().await else {
            return OwnershipResult {
                ok: false,
                reason: Some("Ownership check failed".into()),
            };
        };
        let Some(lmp) = rows.into_iter().next() else {
            return OwnershipResult {
                ok: false,
                reason: Some(format!("LMP not found: {company} · {role}")),
            };
        };
        let poc_url = format!(
            "{}/rest/v1/poc_profiles?select=id,name&approved_user_id=eq.{}&limit=1",
            self.base_url, user_id
        );
        let poc_resp = self.auth_headers(self.http.get(&poc_url)).send().await;
        let Ok(poc_resp) = poc_resp else {
            return OwnershipResult {
                ok: false,
                reason: Some("Could not resolve POC profile".into()),
            };
        };
        let Ok(poc_rows) = poc_resp.json::<Vec<Value>>().await else {
            return OwnershipResult {
                ok: false,
                reason: Some("Could not resolve POC profile".into()),
            };
        };
        let Some(poc) = poc_rows.into_iter().next() else {
            return OwnershipResult {
                ok: false,
                reason: Some("POC profile not found for user".into()),
            };
        };
        let poc_id = poc.get("id").and_then(Value::as_str).unwrap_or("");
        let lmp_id = lmp.get("id").and_then(Value::as_str).unwrap_or("");
        if !poc_id.is_empty() && !lmp_id.is_empty() {
            let link_url = format!(
                "{}/rest/v1/lmp_poc_links?select=id&lmp_id=eq.{}&poc_id=eq.{}&is_active=eq.true&role=in.(prep,support)&limit=1",
                self.base_url, lmp_id, poc_id
            );
            if let Ok(link_resp) = self.auth_headers(self.http.get(&link_url)).send().await {
                if let Ok(links) = link_resp.json::<Vec<Value>>().await {
                    if !links.is_empty() {
                        return OwnershipResult { ok: true, reason: None };
                    }
                }
            }
        }
        let poc_name = poc.get("name").and_then(Value::as_str).unwrap_or("");
        let matches_name = |col: &str| {
            lmp.get(col)
                .and_then(Value::as_str)
                .map(|v| names_match(v, poc_name))
                .unwrap_or(false)
        };
        if matches_name("prep_poc") || matches_name("support_poc") || matches_name("outreach_poc") {
            return OwnershipResult { ok: true, reason: None };
        }
        OwnershipResult {
            ok: false,
            reason: Some(format!("You are not assigned to {company} · {role}")),
        }
    }
}

fn names_match(cell: &str, poc_name: &str) -> bool {
    let v = cell.trim().to_lowercase();
    let f = poc_name.trim().to_lowercase();
    if v.is_empty() || f.is_empty() {
        return false;
    }
    if v.contains(&f) || f.contains(&v) {
        return true;
    }
    let v_first = v.split_whitespace().next().unwrap_or("");
    let f_first = f.split_whitespace().next().unwrap_or("");
    v_first == f_first || v_first.starts_with(f_first) || f_first.starts_with(v_first)
}

fn urlencoding_encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "%20".into(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}
