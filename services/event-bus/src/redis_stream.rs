use crate::supabase::OutboxEvent;
use redis::aio::ConnectionManager;
use serde_json::json;

pub async fn publish_event(
    conn: &mut ConnectionManager,
    stream_name: &str,
    event: &OutboxEvent,
) -> Result<String, String> {
    let payload_json = serde_json::to_string(&event.payload).unwrap_or_else(|_| "{}".into());
    let actor_json = event
        .actor
        .as_ref()
        .map(|a| serde_json::to_string(a).unwrap_or_else(|_| "null".into()))
        .unwrap_or_else(|| "null".into());
    let message_id: String = redis::cmd("XADD")
        .arg(stream_name)
        .arg("*")
        .arg("event_id")
        .arg(&event.id)
        .arg("event_type")
        .arg(&event.event_type)
        .arg("entity_id")
        .arg(event.entity_id.as_deref().unwrap_or(""))
        .arg("payload")
        .arg(payload_json)
        .arg("occurred_at")
        .arg(&event.occurred_at)
        .arg("correlation_id")
        .arg(event.correlation_id.as_deref().unwrap_or(""))
        .arg("causation_id")
        .arg(event.causation_id.as_deref().unwrap_or(""))
        .arg("actor")
        .arg(actor_json)
        .query_async(conn)
        .await
        .map_err(|e| format!("redis XADD failed: {e}"))?;
    Ok(message_id)
}

pub fn stream_entry_json(event: &OutboxEvent) -> serde_json::Value {
    json!({
        "event_id": event.id,
        "event_type": event.event_type,
        "entity_id": event.entity_id,
        "payload": event.payload,
        "occurred_at": event.occurred_at,
        "correlation_id": event.correlation_id,
        "causation_id": event.causation_id,
        "actor": event.actor,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn stream_entry_has_event_type() {
        let event = OutboxEvent {
            id: "e1".into(),
            event_type: "LMP_Updated".into(),
            entity_id: Some("lmp-1".into()),
            payload: json!({ "command": "UPDATE_LMP_STATUS" }),
            occurred_at: "2026-01-01T00:00:00Z".into(),
            actor: None,
            causation_id: None,
            correlation_id: Some("corr-1".into()),
        };
        let entry = stream_entry_json(&event);
        assert_eq!(entry["event_type"], "LMP_Updated");
    }
}
