/// Greeting copy parity with `getGreetingResponse` in copilot-ai/intentRouter.ts.
pub fn get_greeting_response(first_name: &str) -> String {
    let name = {
        let trimmed = first_name.trim();
        if trimmed.is_empty() {
            "there"
        } else {
            trimmed
        }
    };
    let responses = [
        format!(
            "Hey {name}! 👋 I'm your LMP Co-Pilot. Ask me anything about students, processes, POCs, mentors, or analytics — what would you like to explore today?"
        ),
        format!(
            "Hi {name}! Ready to help with LMP operations. Try \"show me today's attention list\", \"progress of <student>\", or \"POC workload breakdown\"."
        ),
        format!(
            "Hello {name}! What would you like to work on? I can search students, summarize LMP processes, run POC allocation, or pull analytics."
        ),
    ];
    // Deterministic pick for Phase 1 echo (stable tests); Phase 2+ may vary by turn.
    responses[0].clone()
}

pub fn cancel_pending_response() -> String {
    [
        "Action cancelled — no changes were made.",
        "",
        ":::blocks",
        r#"[{"type":"activity-feed","entries":[{"action":"Cancelled staged change","status":"info","details":"The pending write was discarded."}]}]"#,
        ":::",
    ]
    .join("\n")
}

pub fn confirm_pending_stub_response() -> String {
    [
        "Gateway echo mode — write execution is not wired until Phase 4.",
        "",
        ":::blocks",
        r#"[{"type":"activity-feed","entries":[{"action":"Write execution","status":"info","details":"Confirm path reached the gateway; command plane pending Phase 4."}]}]"#,
        ":::",
    ]
    .join("\n")
}

pub fn voice_spoken_from_greeting(greeting: &str) -> String {
    greeting
        .replace("👋", "")
        .replace(['*', '`', '#'], "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(600)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greeting_mentions_copilot() {
        let text = get_greeting_response("Alex");
        assert!(text.contains("Alex"));
        assert!(text.contains("Co-Pilot"));
    }
}
