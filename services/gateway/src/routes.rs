use crate::auth::{require_auth, AuthError};
use crate::config::Config;
use crate::dispatcher::{dispatch_copilot, DispatchBody};
use crate::echo::{
    cancel_pending_response, confirm_pending_stub_response, get_greeting_response,
    voice_spoken_from_greeting,
};
use crate::intent_client::{call_command_plane_cancel, call_command_plane_execute};
use crate::tts::{synthesize, TtsOutcome};
use crate::voice::parse_voice_response;
use crate::sse::build_plain_sse_response;
use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
}

pub fn api_router(config: Config) -> Router {
    let state = AppState { config };
    Router::new()
        .route("/copilot", post(handle_copilot))
        .route("/copilot/pending", post(handle_copilot_pending))
        .route("/voice", post(handle_voice))
        .route("/voice/speak", post(handle_voice_speak))
        .route("/slack", post(handle_channel_stub))
        .route("/whatsapp", post(handle_channel_stub))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
struct CopilotBody {
    messages: Option<Vec<ChatMessage>>,
    #[serde(rename = "userName")]
    user_name: Option<String>,
    role: Option<String>,
    #[serde(rename = "realRole")]
    real_role: Option<String>,
    #[serde(rename = "viewAsRole")]
    view_as_role: Option<String>,
    #[serde(rename = "viewAsUserName")]
    view_as_user_name: Option<String>,
    mode: Option<String>,
    #[serde(rename = "lmpId")]
    lmp_id: Option<String>,
    confirm_action: Option<bool>,
    cancel_action: Option<bool>,
    pending_action_id: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct VoiceBody {
    messages: Option<Vec<ChatMessage>>,
    #[serde(rename = "userName")]
    user_name: Option<String>,
    role: Option<String>,
    #[serde(rename = "viewAsRole")]
    view_as_role: Option<String>,
    #[serde(rename = "viewAsUserName")]
    view_as_user_name: Option<String>,
    confirm: Option<VoiceConfirm>,
}

#[derive(Debug, Deserialize)]
struct VoiceConfirm {
    pending_action_id: String,
}

#[derive(Debug, Deserialize)]
struct VoiceSpeakBody {
    text: Option<String>,
    #[serde(rename = "voiceId")]
    voice_id: Option<String>,
}

fn json_error(status: StatusCode, message: &str) -> Response {
    (
        status,
        Json(json!({ "error": message })),
    )
        .into_response()
}

fn auth_error(err: AuthError) -> Response {
    json_error(err.status(), err.message())
}

fn sse_response(text: String, intent: &str) -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("X-Copilot-Intent", intent)
        .body(Body::from(build_plain_sse_response(&text)))
        .unwrap()
}

fn last_user_message(messages: &[ChatMessage]) -> String {
    messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone())
        .unwrap_or_default()
}

fn first_name(user_name: Option<&str>) -> &str {
    user_name
        .and_then(|n| n.split_whitespace().next())
        .filter(|s| !s.is_empty())
        .unwrap_or("there")
}

async fn handle_copilot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CopilotBody>,
) -> Response {
    let auth = match require_auth(&headers, &state.config).await {
        Ok(user) => user,
        Err(err) => return auth_error(err),
    };

    if body.pending_action_id.is_some() && (body.confirm_action == Some(true) || body.cancel_action == Some(true)) {
        let pending_id = body.pending_action_id.as_deref().unwrap_or_default();
        let (text, intent) = if body.cancel_action == Some(true) {
            let text = call_command_plane_cancel(&state.config, pending_id, &auth.id)
                .await
                .unwrap_or_else(|| cancel_pending_response());
            (text, "deterministic_cancel".to_string())
        } else {
            let text = call_command_plane_execute(
                &state.config,
                pending_id,
                &auth.id,
                body.role.as_deref().or(Some(auth.role.as_str())),
                body.view_as_role.as_deref(),
                body.user_name.as_deref(),
            )
            .await
            .unwrap_or_else(|| confirm_pending_stub_response());
            (text, "deterministic_confirm".to_string())
        };
        return sse_response(text, &intent);
    }

    let messages = body.messages.clone().unwrap_or_default();
    if messages.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "Missing 'messages' array");
    }

    let utterance = last_user_message(&messages);
    let result = dispatch_copilot(
        &state.config,
        &auth,
        DispatchBody {
            utterance: &utterance,
            user_name: body.user_name.as_deref(),
            role: body.role.as_deref().or(Some(auth.role.as_str())),
            real_role: body.real_role.as_deref(),
            view_as_role: body.view_as_role.as_deref(),
            view_as_user_name: body.view_as_user_name.as_deref(),
            lmp_id: body.lmp_id.as_deref(),
            mode: body.mode.as_deref(),
            history_len: messages.len(),
        },
    )
    .await;
    sse_response(result.text, &result.intent)
}

async fn handle_copilot_pending(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CopilotBody>,
) -> Response {
    let auth = match require_auth(&headers, &state.config).await {
        Ok(user) => user,
        Err(err) => return auth_error(err),
    };

    let pending_id = body.pending_action_id.as_deref().unwrap_or_default();
    if pending_id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "pending_action_id is required");
    }

    let (text, intent) = if body.cancel_action == Some(true) {
        let text = call_command_plane_cancel(&state.config, pending_id, &auth.id)
            .await
            .unwrap_or_else(|| cancel_pending_response());
        (text, "deterministic_cancel".to_string())
    } else {
        let text = call_command_plane_execute(
            &state.config,
            pending_id,
            &auth.id,
            body.role.as_deref().or(Some(auth.role.as_str())),
            body.view_as_role.as_deref(),
            body.user_name.as_deref(),
        )
        .await
        .unwrap_or_else(|| confirm_pending_stub_response());
        (text, "deterministic_confirm".to_string())
    };
    sse_response(text, &intent)
}

async fn handle_voice(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<VoiceBody>,
) -> Response {
    let auth = match require_auth(&headers, &state.config).await {
        Ok(user) => user,
        Err(err) => return auth_error(err),
    };

    if let Some(confirm) = body.confirm {
        let spoken = voice_spoken_from_greeting(
            &call_command_plane_execute(
                &state.config,
                &confirm.pending_action_id,
                &auth.id,
                body.role.as_deref().or(Some(auth.role.as_str())),
                body.view_as_role.as_deref(),
                body.user_name.as_deref(),
            )
            .await
            .unwrap_or_else(|| confirm_pending_stub_response()),
        );
        return Json(json!({ "spoken": spoken })).into_response();
    }

    let messages = body.messages.clone().unwrap_or_default();
    if messages.is_empty() {
        let greeting = get_greeting_response(first_name(body.user_name.as_deref()));
        let spoken = voice_spoken_from_greeting(&greeting);
        return Json(json!({ "spoken": spoken, "blocks": [] })).into_response();
    }

    let utterance = last_user_message(&messages);
    if utterance.trim().is_empty() {
        let spoken = voice_spoken_from_greeting(&get_greeting_response(first_name(body.user_name.as_deref())));
        return Json(json!({ "spoken": spoken, "blocks": [] })).into_response();
    }

    let result = dispatch_copilot(
        &state.config,
        &auth,
        DispatchBody {
            utterance: &utterance,
            user_name: body.user_name.as_deref(),
            role: body.role.as_deref().or(Some(auth.role.as_str())),
            real_role: None,
            view_as_role: body.view_as_role.as_deref(),
            view_as_user_name: body.view_as_user_name.as_deref(),
            lmp_id: None,
            mode: Some("voice"),
            history_len: messages.len(),
        },
    )
    .await;
    let parsed = parse_voice_response(&result.text);
    Json(json!({
        "spoken": parsed.spoken,
        "blocks": parsed.blocks,
        "intent": result.intent,
    }))
    .into_response()
}

async fn handle_voice_speak(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<VoiceSpeakBody>,
) -> Response {
    if let Err(err) = require_auth(&headers, &state.config).await {
        return auth_error(err);
    }

    let text = body.text.unwrap_or_default().trim().to_string();
    if text.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "text is required");
    }

    match synthesize(&state.config, &text, body.voice_id.as_deref()).await {
        TtsOutcome::Audio { bytes, content_type } => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", content_type)
            .header("Cache-Control", "no-store")
            .body(Body::from(bytes))
            .unwrap()
            .into_response(),
        TtsOutcome::Fallback => Json(json!({ "fallback": true })).into_response(),
    }
}

async fn handle_channel_stub(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    if let Err(err) = require_auth(&headers, &state.config).await {
        return auth_error(err);
    }
    json_error(StatusCode::NOT_IMPLEMENTED, "Channel adapter not implemented")
}
