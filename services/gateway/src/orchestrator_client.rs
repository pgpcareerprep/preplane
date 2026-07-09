use crate::config::Config;
use axum::body::Body;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::Response;
use serde_json::Value;

pub async fn proxy_orchestrator_chat(
    config: &Config,
    headers: &HeaderMap,
    body: &Value,
) -> Result<Response, StatusCode> {
    let base = config
        .orchestrator_url
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut req = client
        .post(format!("{}/chat", base.trim_end_matches('/')))
        .json(body);

    if let Some(auth) = headers.get("authorization") {
        req = req.header("Authorization", auth.as_bytes());
    }

    let resp = req
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut out = Response::builder().status(status);

    for (key, value) in resp.headers() {
        let name = key.as_str();
        if matches!(
            name,
            "content-type"
                | "cache-control"
                | "x-copilot-intent"
                | "x-copilot-model"
                | "x-copilot-tier"
                | "x-copilot-cache"
                | "x-copilot-fallback"
                | "x-copilot-repaired"
                | "x-copilot-cap"
        ) {
            if let Ok(v) = HeaderValue::from_bytes(value.as_bytes()) {
                out = out.header(key, v);
            }
        }
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    out.body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn proxy_orchestrator_voice(
    config: &Config,
    headers: &HeaderMap,
    body: &Value,
) -> Result<Response, StatusCode> {
    let base = config
        .orchestrator_url
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut req = client
        .post(format!("{}/voice", base.trim_end_matches('/')))
        .json(body);

    if let Some(auth) = headers.get("authorization") {
        req = req.header("Authorization", auth.as_bytes());
    }

    let resp = req
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut out = Response::builder().status(status);

    if let Some(ct) = resp.headers().get("content-type") {
        if let Ok(v) = HeaderValue::from_bytes(ct.as_bytes()) {
            out = out.header("content-type", v);
        }
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    out.body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
