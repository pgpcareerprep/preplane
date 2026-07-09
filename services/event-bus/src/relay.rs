use crate::config::Config;
use crate::redis_stream::{publish_event, stream_entry_json};
use crate::supabase::SupabaseClient;
use redis::aio::ConnectionManager;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};

const MAX_RETRIES: i32 = 5;

pub struct RelayState {
    pub sb: SupabaseClient,
    pub redis: ConnectionManager,
    pub config: Config,
    pub retry_counts: Mutex<HashMap<String, i32>>,
}

pub async fn run_relay_loop(state: Arc<RelayState>) {
    let poll = std::time::Duration::from_millis(state.config.poll_ms);
    loop {
        match relay_batch(&state).await {
            Ok(n) if n > 0 => info!(count = n, "relayed outbox events"),
            Ok(_) => {}
            Err(e) => warn!(error = %e, "relay batch failed"),
        }
        tokio::time::sleep(poll).await;
    }
}

pub async fn relay_batch(state: &RelayState) -> Result<usize, String> {
    let events = state
        .sb
        .fetch_pending(state.config.batch_size)
        .await?;
    if events.is_empty() {
        return Ok(0);
    }
    let mut published = 0usize;
    for event in events {
        let mut conn = state.redis.clone();
        match publish_event(&mut conn, &state.config.stream_name, &event).await {
            Ok(message_id) => {
                if let Err(e) = state.sb.mark_published(&event.id, &message_id).await {
                    warn!(event_id = %event.id, error = %e, "published to redis but outbox patch failed");
                } else {
                    let mut retries = state.retry_counts.lock().await;
                    retries.remove(&event.id);
                    published += 1;
                }
            }
            Err(err) => {
                let attempt = {
                    let mut retries = state.retry_counts.lock().await;
                    let count = retries.entry(event.id.clone()).or_insert(0);
                    *count += 1;
                    *count
                };
                warn!(
                    event_id = %event.id,
                    attempt,
                    error = %err,
                    "redis publish failed"
                );
                if attempt >= MAX_RETRIES {
                    let payload = stream_entry_json(&event);
                    state
                        .sb
                        .insert_dead_letter(
                            &state.config.stream_name,
                            None,
                            &payload,
                            &err,
                            attempt,
                        )
                        .await;
                    let _ = state.sb.mark_failed(&event.id, &err).await;
                    let mut retries = state.retry_counts.lock().await;
                    retries.remove(&event.id);
                }
            }
        }
    }
    Ok(published)
}
