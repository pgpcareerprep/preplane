use crate::echo::voice_spoken_from_greeting;
use serde_json::Value;

pub struct VoiceParsed {
    pub spoken: String,
    pub blocks: Vec<Value>,
}

/// Split copilot SSE/plain text into spoken summary + optional blocks array.
pub fn parse_voice_response(text: &str) -> VoiceParsed {
    let marker = "\n\n:::blocks\n";
    let (prose, blocks_raw) = if let Some(idx) = text.find(marker) {
        let after = &text[idx + marker.len()..];
        let end = after.find("\n:::").unwrap_or(after.len());
        (text[..idx].trim(), after[..end].trim())
    } else {
        (text.trim(), "")
    };
    let blocks = if blocks_raw.is_empty() {
        Vec::new()
    } else {
        serde_json::from_str::<Vec<Value>>(blocks_raw).unwrap_or_default()
    };
    let spoken = voice_spoken_from_greeting(prose);
    VoiceParsed { spoken, blocks }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_blocks_from_sse_text() {
        let parsed = parse_voice_response(
            "Hello there.\n\n:::blocks\n[{\"type\":\"alert-cards\"}]\n:::",
        );
        assert!(parsed.spoken.contains("Hello"));
        assert_eq!(parsed.blocks.len(), 1);
    }
}
