use crate::bus::publish_command;
use crate::engine_client::{call_lmp_engine, EngineExecuteInput};
use crate::guard::{enforce_write_guard, GuardContext};
use crate::idempotency::find_prior_execution;
use crate::sse::{
    format_cancel_sse, format_execute_sse, format_idempotent_replay, format_permission_denied,
    format_stage_sse,
};
use crate::staging::{
    cancel_pending, claim_pending, finalize_pending, stage_pending_action, StageInput,
};
use crate::supabase::SupabaseClient;
use axum::{extract::State, routing::post, Json, Router};
use preplane_command_path::prepare::{prepare_command, PrepareInput};
use preplane_command_path::validate::parse_update_command;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Clone)]
pub struct ApiState {
    pub sb: SupabaseClient,
}

#[derive(Debug, Deserialize)]
pub struct StageRequest {
    pub utterance: Option<String>,
    pub kind: Option<String>,
    #[serde(default)]
    pub payload: Value,
    #[serde(rename = "requestedBy")]
    pub requested_by: String,
    pub role: Option<String>,
    #[serde(rename = "viewAsRole")]
    pub view_as_role: Option<String>,
    #[serde(rename = "actorName")]
    pub actor_name: Option<String>,
    #[serde(rename = "entityId")]
    pub entity_id: Option<String>,
    #[serde(rename = "currentSnapshot")]
    pub current_snapshot: Option<Value>,
    #[serde(rename = "proposedSnapshot")]
    pub proposed_snapshot: Option<Value>,
}

#[derive(Debug, serde::Serialize)]
pub struct StageResponse {
    pub sse_text: String,
    pub pending_action_id: String,
    pub phase: &'static str,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteRequest {
    #[serde(rename = "pendingActionId")]
    pub pending_action_id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub role: Option<String>,
    #[serde(rename = "viewAsRole")]
    pub view_as_role: Option<String>,
    #[serde(rename = "actorName")]
    pub actor_name: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct ExecuteResponse {
    pub sse_text: String,
    pub correlation_id: String,
    pub command_log_id: String,
}

#[derive(Debug, Deserialize)]
pub struct CancelRequest {
    #[serde(rename = "pendingActionId")]
    pub pending_action_id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
}

#[derive(Debug, serde::Serialize)]
pub struct CancelResponse {
    pub sse_text: String,
}

pub fn router(state: Arc<ApiState>) -> Router {
    Router::new()
        .route("/stage", post(handle_stage))
        .route("/execute", post(handle_execute))
        .route("/cancel", post(handle_cancel))
        .with_state(state)
}

async fn handle_stage(
    State(state): State<Arc<ApiState>>,
    Json(body): Json<StageRequest>,
) -> Result<Json<StageResponse>, (axum::http::StatusCode, Json<Value>)> {
    let role = body.role.as_deref().unwrap_or("poc");
    let (kind, payload) = resolve_kind_payload(&body)?;
    let prepared = prepare_command(PrepareInput {
        kind: kind.clone(),
        payload,
        requested_by: body.requested_by.clone(),
        entity_id: body.entity_id.clone(),
        current_snapshot: body.current_snapshot.clone(),
        proposed_snapshot: body.proposed_snapshot.clone(),
    })
    .map_err(validation_err)?;
    let guard_ctx = GuardContext {
        role: role.to_string(),
        user_id: body.requested_by.clone(),
        actor_name: body.actor_name.clone(),
        view_as_role: body.view_as_role.clone(),
    };
    if let Err(block) = enforce_write_guard(&state.sb, &guard_ctx, &kind, &prepared.envelope.payload).await
    {
        return Ok(Json(StageResponse {
            sse_text: format_permission_denied(&block.reason, block.safe_alternative.as_deref()),
            pending_action_id: String::new(),
            phase: "blocked",
        }));
    }
    if let Some(prior) =
        find_prior_execution(&state.sb, &prepared.envelope.idempotency_key).await
    {
        let target = prepared.target_summary.clone();
        let _ = prior;
        return Ok(Json(StageResponse {
            sse_text: format_idempotent_replay(&target),
            pending_action_id: String::new(),
            phase: "idempotent_replay",
        }));
    }
    let staged = stage_pending_action(
        &state.sb,
        StageInput {
            user_id: body.requested_by.clone(),
            actor_name: body.actor_name.clone(),
            role: role.to_string(),
            kind,
            payload: prepared.envelope.payload.clone(),
            current_snapshot: prepared.envelope.current_snapshot.clone(),
            proposed_snapshot: prepared.envelope.proposed_snapshot.clone(),
            idempotency_key: prepared.envelope.idempotency_key.clone(),
        },
    )
    .await
    .map_err(|e| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
    })?;
    let sse_text = format_stage_sse(
        &prepared.target_summary,
        &staged.pending_action_id,
        &staged.expires_at,
        &prepared.envelope,
    );
    Ok(Json(StageResponse {
        sse_text,
        pending_action_id: staged.pending_action_id,
        phase: "staged",
    }))
}

async fn handle_execute(
    State(state): State<Arc<ApiState>>,
    Json(body): Json<ExecuteRequest>,
) -> Result<Json<ExecuteResponse>, (axum::http::StatusCode, Json<Value>)> {
    let role = body.role.as_deref().unwrap_or("poc");
    let pending = claim_pending(&state.sb, &body.pending_action_id, &body.user_id)
        .await
        .map_err(|e| {
            (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({ "error": e })),
            )
        })?;
    let guard_ctx = GuardContext {
        role: role.to_string(),
        user_id: body.user_id.clone(),
        actor_name: body.actor_name.clone(),
        view_as_role: body.view_as_role.clone(),
    };
    if let Err(block) =
        enforce_write_guard(&state.sb, &guard_ctx, &pending.kind, &pending.payload).await
    {
        finalize_pending(&state.sb, &pending.id, &body.user_id, false).await;
        return Ok(Json(ExecuteResponse {
            sse_text: format_permission_denied(&block.reason, block.safe_alternative.as_deref()),
            correlation_id: String::new(),
            command_log_id: String::new(),
        }));
    }
    let prepared = prepare_command(PrepareInput {
        kind: pending.kind.clone(),
        payload: pending.payload.clone(),
        requested_by: body.user_id.clone(),
        entity_id: None,
        current_snapshot: Some(pending.current_snapshot.clone()),
        proposed_snapshot: Some(pending.proposed_snapshot.clone()),
    })
    .map_err(validation_err)?;
    if let Some(prior) =
        find_prior_execution(&state.sb, &prepared.envelope.idempotency_key).await
    {
        finalize_pending(&state.sb, &pending.id, &body.user_id, true).await;
        let target = prepared.target_summary.clone();
        return Ok(Json(ExecuteResponse {
            sse_text: format_idempotent_replay(&target),
            correlation_id: prior.command_log_id.clone(),
            command_log_id: prior.command_log_id,
        }));
    }
    let correlation_id = format!("corr_{}", &pending.id);
    let published = match publish_command(&state.sb, &prepared.envelope, &correlation_id).await {
        Ok(p) => p,
        Err(e) => {
            finalize_pending(&state.sb, &pending.id, &body.user_id, false).await;
            return Err((
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            ));
        }
    };
    finalize_pending(&state.sb, &pending.id, &body.user_id, true).await;
    let engine_message = if let Ok(engine_url) = std::env::var("LMP_ENGINE_URL") {
        call_lmp_engine(
            &engine_url,
            EngineExecuteInput {
                command_log_id: &published.command_log_id,
                envelope: &prepared.envelope,
                actor_name: body.actor_name.as_deref(),
                role: Some(role),
                current_snapshot: Some(&pending.current_snapshot),
                proposed_snapshot: Some(&pending.proposed_snapshot),
            },
        )
        .await
        .map(|r| (r.ok, r.message))
    } else {
        None
    };
    let (engine_ok, engine_msg) = engine_message.unwrap_or((false, String::new()));
    let sse_text = format_execute_sse(
        &pending.kind,
        &prepared.target_summary,
        &correlation_id,
        engine_ok,
        engine_msg.as_str(),
    );
    Ok(Json(ExecuteResponse {
        sse_text,
        correlation_id: published.correlation_id,
        command_log_id: published.command_log_id,
    }))
}

async fn handle_cancel(
    State(state): State<Arc<ApiState>>,
    Json(body): Json<CancelRequest>,
) -> Result<Json<CancelResponse>, (axum::http::StatusCode, Json<Value>)> {
    cancel_pending(&state.sb, &body.pending_action_id, &body.user_id)
        .await
        .map_err(|e| {
            (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({ "error": e })),
            )
        })?;
    Ok(Json(CancelResponse {
        sse_text: format_cancel_sse(),
    }))
}

fn resolve_kind_payload(body: &StageRequest) -> Result<(String, Value), (axum::http::StatusCode, Json<Value>)> {
    if let Some(kind) = body.kind.clone() {
        return Ok((kind, body.payload.clone()));
    }
    if let Some((kind, payload)) = body
        .utterance
        .as_deref()
        .and_then(parse_update_command)
    {
        return Ok((kind, payload));
    }
    Err((
        axum::http::StatusCode::BAD_REQUEST,
        Json(json!({ "error": "Could not infer command from utterance" })),
    ))
}

fn validation_err(e: preplane_command_path::validate::ValidationError) -> (axum::http::StatusCode, Json<Value>) {
    (
        axum::http::StatusCode::BAD_REQUEST,
        Json(json!({
            "error": e.error,
            "ask": e.ask,
            "missing": e.missing,
            "clarification_needed": true,
        })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_from_kind() {
        let body = StageRequest {
            utterance: None,
            kind: Some("update_lmp_status".into()),
            payload: json!({ "company": "A", "role": "PM", "status": "On Hold" }),
            requested_by: "u1".into(),
            role: Some("admin".into()),
            view_as_role: None,
            actor_name: None,
            entity_id: None,
            current_snapshot: None,
            proposed_snapshot: None,
        };
        let (kind, _) = resolve_kind_payload(&body).unwrap();
        assert_eq!(kind, "update_lmp_status");
    }
}
