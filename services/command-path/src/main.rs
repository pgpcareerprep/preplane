use preplane_command_path::api::{router, ApiState};
use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("preplane_command_path=info".parse().unwrap()),
        )
        .init();

    let state = Arc::new(ApiState);

    let app = axum::Router::new()
        .merge(router(state))
        .merge(preplane_health::health_router("command-path"));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8085);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "preplane-command-path listening");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}
