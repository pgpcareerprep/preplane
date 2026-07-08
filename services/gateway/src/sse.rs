/// OpenAI-compatible SSE stream consumed by `assembleFromSse` in the frontend.
pub fn build_plain_sse_response(text: &str) -> String {
    let payload = serde_json::json!({
        "choices": [{ "delta": { "content": text } }]
    });
    format!("data: {}\n\ndata: [DONE]\n\n", payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_contains_done_and_delta_shape() {
        let body = build_plain_sse_response("Hello");
        assert!(body.contains("data: "));
        assert!(body.contains("[DONE]"));
        assert!(body.contains(r#""content":"Hello""#));
    }
}
