use crate::prepare::{format_command_sse, prepare_command, PrepareInput};
use crate::validate::{allowed_role_for_write, parse_update_command, view_as_blocks_writes};
use axum::{extract::State, routing::post, Json, Router};
use preplane_contracts::CommandEnvelope;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Clone)]
pub struct ApiState;

#[derive(Debug, Deserialize)]
pub struct PrepareRequest {
    pub utterance: Option<String>,
    pub kind: Option<String>,
    #[serde(default)]
    pub payload: Value,
    #[serde(rename = "requestedBy")]
    pub requested_by: String,
    pub role: Option<String>,
    #[serde(rename = "viewAsRole")]
    pub view_as_role: Option<String>,
    #[serde(rename = "entityId")]
    pub entity_id: Option<String>,
    #[serde(rename = "currentSnapshot")]
    pub current_snapshot: Option<Value>,
    #[serde(rename = "proposedSnapshot")]
    pub proposed_snapshot: Option<Value>,
}

#[derive(Debug, serde::Serialize)]
pub struct PrepareResponse {
    pub envelope: CommandEnvelope,
    pub target_summary: String,
    pub sse_text: String,
    pub phase: &'static str,
}

pub fn router(state: Arc<ApiState>) -> Router {
    Router::new()
        .route("/prepare", post(handle_prepare))
        .with_state(state)
}

async fn handle_prepare(
    State(_state): State<Arc<ApiState>>,
    Json(body): Json<PrepareRequest>,
) -> Result<Json<PrepareResponse>, (axum::http::StatusCode, Json<Value>)> {
    if view_as_blocks_writes(body.view_as_role.as_deref()) {
        return Err((
            axum::http::StatusCode::FORBIDDEN,
            Json(json!({
                "blocked": true,
                "reason": "View-as mode is read-only. Switch back to your own perspective to make changes."
            })),
        ));
    }
    let role = body.role.as_deref().unwrap_or("admin");
    if !allowed_role_for_write(role) {
        return Err((
            axum::http::StatusCode::FORBIDDEN,
            Json(json!({
                "blocked": true,
                "reason": format!("Role {role} cannot stage writes.")
            })),
        ));
    }
    let (kind, payload) = if let Some(kind) = body.kind.clone() {
        (kind, body.payload.clone())
    } else if let Some((kind, payload)) = body
        .utterance
        .as_deref()
        .and_then(parse_update_command)
    {
        (kind, payload)
    } else {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Could not infer command from utterance" })),
        ));
    };
    let output = prepare_command(PrepareInput {
        kind,
        payload,
        requested_by: body.requested_by,
        entity_id: body.entity_id,
        current_snapshot: body.current_snapshot,
        proposed_snapshot: body.proposed_snapshot,
    })
    .map_err(|e| {
        (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({
                "error": e.error,
                "ask": e.ask,
                "missing": e.missing,
                "clarification_needed": true,
            })),
        )
    })?;
    let sse_text = format_command_sse(&output);
    Ok(Json(PrepareResponse {
        envelope: output.envelope,
        target_summary: output.target_summary,
        sse_text,
        phase: "validated_only",
    }))
}
