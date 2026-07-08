use crate::config::Config;
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct AuthedUser {
    pub id: String,
    pub email: Option<String>,
    pub role: String,
}

#[derive(Debug)]
pub enum AuthError {
    Missing,
    Invalid,
    NotApproved,
}

impl AuthError {
    pub fn status(&self) -> StatusCode {
        match self {
            AuthError::Missing | AuthError::Invalid => StatusCode::UNAUTHORIZED,
            AuthError::NotApproved => StatusCode::FORBIDDEN,
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            AuthError::Missing => "Missing Authorization header",
            AuthError::Invalid => "Invalid or expired session",
            AuthError::NotApproved => "Account not approved",
        }
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers
        .get(axum::http::header::AUTHORIZATION)
        .or_else(|| headers.get("authorization"))?
        .to_str()
        .ok()?;
    let lower = raw.to_ascii_lowercase();
    if !lower.starts_with("bearer ") {
        return None;
    }
    let token = raw[7..].trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

#[derive(Deserialize)]
struct SupabaseUserResponse {
    id: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct ProfileRow {
    role: Option<String>,
    access_status: Option<String>,
    is_active: Option<bool>,
}

/// Mirrors `requireAuth` in supabase/functions/_shared/requireAuth.ts.
pub async fn require_auth(headers: &HeaderMap, config: &Config) -> Result<AuthedUser, AuthError> {
    let token = bearer_token(headers).ok_or(AuthError::Missing)?;
    let client = reqwest::Client::new();

    let user_resp = client
        .get(format!("{}/auth/v1/user", config.supabase_url))
        .header("Authorization", format!("Bearer {token}"))
        .header("apikey", &config.supabase_anon_key)
        .send()
        .await
        .map_err(|_| AuthError::Invalid)?;

    if !user_resp.status().is_success() {
        return Err(AuthError::Invalid);
    }

    let user: SupabaseUserResponse = user_resp.json().await.map_err(|_| AuthError::Invalid)?;
    let user_id = user.id.ok_or(AuthError::Invalid)?;

    let profile_resp = client
        .get(format!(
            "{}/rest/v1/profiles?user_id=eq.{}&select=role,access_status,is_active",
            config.supabase_url, user_id
        ))
        .header("Authorization", format!("Bearer {}", config.supabase_service_role_key))
        .header("apikey", &config.supabase_service_role_key)
        .send()
        .await
        .map_err(|_| AuthError::Invalid)?;

    if !profile_resp.status().is_success() {
        return Err(AuthError::Invalid);
    }

    let profiles: Vec<ProfileRow> = profile_resp.json().await.map_err(|_| AuthError::Invalid)?;
    let profile = profiles.into_iter().next().ok_or(AuthError::NotApproved)?;

    if profile.access_status.as_deref() != Some("approved") || profile.is_active == Some(false) {
        return Err(AuthError::NotApproved);
    }

    Ok(AuthedUser {
        id: user_id,
        email: user.email,
        role: profile.role.unwrap_or_else(|| "poc".to_string()),
    })
}
