use preplane_lmp::api::{router, ApiState};
use preplane_lmp::supabase::SupabaseClient;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("preplane_lmp=info".parse().unwrap()),
        )
        .init();

    let sb = SupabaseClient::from_env();
    let state = Arc::new(ApiState { sb });
    let app = router(state).merge(preplane_health::health_router("lmp"));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8090);
    let addr = format!("0.0.0.0:{port}");
    tracing::info!(%addr, "preplane-lmp listening");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("bind lmp engine");
    axum::serve(listener, app).await.expect("serve lmp engine");
}
