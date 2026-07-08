use axum::Router;
use preplane_intent_router::api::{router as classify_router, ApiState};
use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("preplane_intent_router=info".parse().unwrap()),
        )
        .init();

    let state = Arc::new(ApiState {
        semantic_classifier_url: std::env::var("SEMANTIC_CLASSIFIER_URL").ok(),
        use_remote_semantic: std::env::var("SEMANTIC_CLASSIFIER_URL").is_ok(),
    });

    let app = Router::new()
        .merge(classify_router(state))
        .merge(preplane_health::health_router("intent-router"));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8081);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "preplane-intent-router listening");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}
