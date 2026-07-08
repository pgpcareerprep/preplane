use crate::context::RouterContext;
use crate::router::{self, ClassifyOptions};
use axum::{extract::State, Json};
use preplane_contracts::IntentDecision;
use serde::Deserialize;
use std::sync::Arc;

#[derive(Clone)]
pub struct ApiState {
    pub semantic_classifier_url: Option<String>,
    pub use_remote_semantic: bool,
}

#[derive(Debug, Deserialize)]
pub struct ClassifyRequest {
    pub utterance: String,
    #[serde(default)]
    pub context: ClassifyContext,
}

#[derive(Debug, Deserialize, Default)]
pub struct ClassifyContext {
    pub role: Option<String>,
    pub real_role: Option<String>,
    pub view_as_role: Option<String>,
    pub view_as_user_name: Option<String>,
    pub lmp_id: Option<String>,
    pub mode: Option<String>,
    pub history_len: Option<usize>,
}

pub fn router(state: Arc<ApiState>) -> axum::Router {
    axum::Router::new()
        .route("/classify", axum::routing::post(classify_handler))
        .with_state(state)
}

async fn classify_handler(
    State(state): State<Arc<ApiState>>,
    Json(body): Json<ClassifyRequest>,
) -> Json<IntentDecision> {
    let ctx = RouterContext {
        role: body.context.role.unwrap_or_else(|| "poc".into()),
        real_role: body
            .context
            .real_role
            .unwrap_or_else(|| "poc".into()),
        view_as_role: body.context.view_as_role,
        view_as_user_name: body.context.view_as_user_name,
        lmp_id: body.context.lmp_id,
        mode: body.context.mode.unwrap_or_else(|| "auto".into()),
        history_len: body.context.history_len.unwrap_or(0),
    };
    let decision = router::classify(ClassifyOptions {
        utterance: &body.utterance,
        ctx: &ctx,
        semantic_classifier_url: state.semantic_classifier_url.as_deref(),
        use_remote_semantic: state.use_remote_semantic,
    })
    .await;
    Json(decision)
}
