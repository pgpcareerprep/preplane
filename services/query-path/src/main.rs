use preplane_query_path::api::{router, ApiState};
use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("preplane_query_path=info".parse().unwrap()),
        )
        .init();

    let state = Arc::new(ApiState {
        supabase_url: std::env::var("SUPABASE_URL")
            .or_else(|_| std::env::var("VITE_SUPABASE_URL"))
            .expect("SUPABASE_URL required"),
        supabase_service_role_key: std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .expect("SUPABASE_SERVICE_ROLE_KEY required"),
    });

    let app = axum::Router::new()
        .merge(router(state))
        .merge(preplane_health::health_router("query-path"));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8084);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "preplane-query-path listening");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}
