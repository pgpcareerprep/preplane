use crate::data::{fetch_lmp_alumni_mentor_assignments, fetch_lmp_records, fetch_poc_profiles};
use crate::templates::{
    format_query_sse, get_analytics, infer_company_from_utterance, lmp_with_alumni_mentors,
    search_lmp_records,
};
use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Clone)]
pub struct ApiState {
    pub supabase_url: String,
    pub supabase_service_role_key: String,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteRequest {
    pub template: String,
    #[serde(default)]
    pub args: Value,
    #[serde(default)]
    pub utterance: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(rename = "userName")]
    pub user_name: Option<String>,
    #[serde(default)]
    pub sub_intent: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct ExecuteResponse {
    pub template: String,
    pub result: Value,
    pub sse_text: String,
}

pub fn router(state: Arc<ApiState>) -> Router {
    Router::new()
        .route("/execute", post(handle_execute))
        .with_state(state)
}

async fn handle_execute(
    State(state): State<Arc<ApiState>>,
    Json(body): Json<ExecuteRequest>,
) -> Result<Json<ExecuteResponse>, (axum::http::StatusCode, Json<Value>)> {
    let records = fetch_lmp_records(&state.supabase_url, &state.supabase_service_role_key)
        .await
        .map_err(|e| {
            (
                axum::http::StatusCode::BAD_GATEWAY,
                Json(json!({ "error": e })),
            )
        })?;
    let mut args = body.args.clone();
    if args.get("company").is_none() {
        if let Some(company) = body
            .utterance
            .as_deref()
            .and_then(infer_company_from_utterance)
        {
            if let Some(obj) = args.as_object_mut() {
                obj.insert("company".into(), Value::String(company));
            }
        }
    }
    let result = match body.template.as_str() {
        "search_lmp_records" => search_lmp_records(
            records,
            body.role.as_deref(),
            body.user_name.as_deref(),
            &args,
        )
        .map_err(bad_request)?,
        "get_analytics" => {
            let poc_profiles =
                fetch_poc_profiles(&state.supabase_url, &state.supabase_service_role_key)
                    .await
                    .unwrap_or_default();
            get_analytics(
                records,
                body.role.as_deref(),
                body.user_name.as_deref(),
                &args,
                &poc_profiles,
            )
            .map_err(bad_request)?
        }
        "lmp_with_alumni_mentors" => {
            let rows = fetch_lmp_alumni_mentor_assignments(
                &state.supabase_url,
                &state.supabase_service_role_key,
            )
            .await
            .map_err(|e| {
                (
                    axum::http::StatusCode::BAD_GATEWAY,
                    Json(json!({ "error": e })),
                )
            })?;
            lmp_with_alumni_mentors(rows, &args).map_err(bad_request)?
        }
        other => {
            return Err((
                axum::http::StatusCode::NOT_IMPLEMENTED,
                Json(json!({ "error": format!("Unknown template: {other}") })),
            ))
        }
    };
    let sse_text = format_query_sse(&body.template, &result);
    Ok(Json(ExecuteResponse {
        template: body.template,
        result,
        sse_text,
    }))
}

fn bad_request(msg: String) -> (axum::http::StatusCode, Json<Value>) {
    (
        axum::http::StatusCode::BAD_REQUEST,
        Json(json!({ "error": msg })),
    )
}
