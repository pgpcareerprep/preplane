use preplane_gateway::echo::get_greeting_response;
use preplane_gateway::sse::build_plain_sse_response;

/// Parse SSE body the same way the frontend `assembleFromSse` does.
fn assemble_from_sse(raw: &str) -> String {
    let mut out = String::new();
    for block in raw.split("\n\n") {
        let line = block.lines().find(|l| l.starts_with("data:"));
        let Some(line) = line else { continue };
        let data = line[5..].trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
            if let Some(delta) = json
                .pointer("/choices/0/delta/content")
                .and_then(|v| v.as_str())
            {
                out.push_str(delta);
            }
        }
    }
    out
}

#[test]
fn gateway_sse_parses_like_frontend() {
    let text = get_greeting_response("Pat");
    let raw = build_plain_sse_response(&text);
    let assembled = assemble_from_sse(&raw);
    assert_eq!(assembled, text);
}

#[test]
fn blocks_fence_streams_verbatim() {
    let with_blocks = [
        "Here is a card:",
        "",
        ":::blocks",
        r#"[{"type":"text","content":"Hello"}]"#,
        ":::",
    ]
    .join("\n");
    let raw = build_plain_sse_response(&with_blocks);
    let assembled = assemble_from_sse(&raw);
    assert!(assembled.contains(":::blocks"));
    assert!(assembled.contains(r#""type":"text""#));
}
