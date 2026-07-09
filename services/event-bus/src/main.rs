use axum::{routing::post, Json, Router};
use preplane_event_bus::config::Config;
use preplane_event_bus::relay::{relay_batch, RelayState};
use preplane_event_bus::supabase::SupabaseClient;
use redis::aio::ConnectionManager;
use serde_json::{json, Value};
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
struct AppState {
    relay: Option<Arc<RelayState>>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("preplane_event_bus=info".parse().unwrap()),
        )
        .init();

    let config = Config::from_env();
    let sb = SupabaseClient::from_env();
    let relay_state = if let Some(redis_url) = config.redis_url.clone() {
        match redis::Client::open(redis_url.as_str()) {
            Ok(client) => match ConnectionManager::new(client).await {
                Ok(redis) => {
                    let state = Arc::new(RelayState {
                        sb: sb.clone(),
                        redis,
                        config: config.clone(),
                        retry_counts: Default::default(),
                    });
                    let loop_state = state.clone();
                    tokio::spawn(preplane_event_bus::relay::run_relay_loop(loop_state));
                    tracing::info!(stream = %config.stream_name, "event-bus relay started");
                    Some(state)
                }
                Err(e) => {
                    tracing::error!(error = %e, "failed to connect to redis — relay disabled");
                    None
                }
            },
            Err(e) => {
                tracing::error!(error = %e, "invalid REDIS_URL — relay disabled");
                None
            }
        }
    } else {
        tracing::warn!("REDIS_URL not set — event-bus relay disabled (health only)");
        None
    };

    let app_state = AppState { relay: relay_state };
    let relay_router = Router::new()
        .route("/relay", post(handle_relay_once))
        .with_state(app_state);
    let app = relay_router.merge(preplane_health::health_router("event-bus"));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8083);
    let addr = format!("0.0.0.0:{port}");
    tracing::info!(%addr, "preplane-event-bus listening");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("bind event-bus");
    axum::serve(listener, app).await.expect("serve event-bus");
}

async fn handle_relay_once(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Json<Value> {
    let Some(relay) = state.relay else {
        return Json(json!({
            "ok": false,
            "error": "relay disabled — set REDIS_URL",
            "published": 0,
        }));
    };
    match relay_batch(&relay).await {
        Ok(n) => Json(json!({ "ok": true, "published": n })),
        Err(e) => Json(json!({ "ok": false, "error": e, "published": 0 })),
    }
}
