use crate::execute::{execute_envelope, write_kind_label};
use crate::supabase::SupabaseClient;
use axum::{extract::State, routing::post, Json, Router};
use preplane_contracts::CommandEnvelope;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Clone)]
pub struct ApiState {
    pub sb: SupabaseClient,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteRequest {
    #[serde(rename = "commandLogId")]
    pub command_log_id: String,
    pub envelope: CommandEnvelope,
    #[serde(rename = "actorName")]
    pub actor_name: Option<String>,
    pub role: Option<String>,
    #[serde(rename = "currentSnapshot")]
    pub current_snapshot: Option<Value>,
    #[serde(rename = "proposedSnapshot")]
    pub proposed_snapshot: Option<Value>,
}

#[derive(Debug, serde::Serialize)]
pub struct ExecuteResponse {
    pub ok: bool,
    pub message: String,
    pub details: Value,
}

pub fn router(state: Arc<ApiState>) -> Router {
    Router::new()
        .route("/execute", post(handle_execute))
        .with_state(state)
}

async fn handle_execute(
    State(state): State<Arc<ApiState>>,
    Json(body): Json<ExecuteRequest>,
) -> Json<ExecuteResponse> {
    let output = execute_envelope(&state.sb, &body.envelope).await;
    let status = if output.ok { "succeeded" } else { "failed" };
    let result = json!({
        "status": status,
        "phase": 5,
        "message": output.message,
        "details": output.details,
    });
    let _ = state
        .sb
        .patch_command_log_result(&body.command_log_id, result.clone())
        .await;

    let kind = write_kind_label(&body.envelope.command);
    let entity_id = body.envelope.entity_id.clone();
    let activity = preplane_governance::copilot_activity_entry(
        body.actor_name.as_deref().unwrap_or("Copilot user"),
        body.role.as_deref().unwrap_or("poc"),
        kind,
        &entity_id,
        body.current_snapshot.as_ref(),
        body.proposed_snapshot.as_ref(),
        json!({
            "command_log_id": body.command_log_id,
            "idempotency_key": body.envelope.idempotency_key,
            "result": result,
        }),
    );
    state.sb.insert_activity_log(activity).await;

    Json(ExecuteResponse {
        ok: output.ok,
        message: output.message,
        details: output.details,
    })
}
