use axum::{routing::get, Json, Router};
use serde::Serialize;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

pub fn health_router(service: &'static str) -> Router {
    Router::new().route(
        "/health",
        get(move || async move {
            Json(HealthResponse {
                status: "ok",
                service,
            })
        }),
    )
}

pub async fn serve(service: &'static str, port: u16) {
    let app = health_router(service);
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("bind {addr}: {e}"));
    axum::serve(listener, app)
        .await
        .unwrap_or_else(|e| panic!("serve {service}: {e}"));
}
