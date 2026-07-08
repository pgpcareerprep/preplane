use preplane_command_plane::api::{router, ApiState};
use preplane_command_plane::supabase::SupabaseClient;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("preplane_command_plane=info".parse().unwrap()),
        )
        .init();

    let sb = SupabaseClient::from_env();
    let state = Arc::new(ApiState { sb });
    let app = router(state).merge(preplane_health::health_router("command-plane"));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8082);
    let addr = format!("0.0.0.0:{port}");
    tracing::info!(%addr, "preplane-command-plane listening");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("bind command-plane");
    axum::serve(listener, app).await.expect("serve command-plane");
}
