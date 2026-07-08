use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct ValidationError {
    pub error: String,
    pub ask: String,
    pub missing: Vec<String>,
}

pub fn trim_str(v: &Value) -> String {
    v.as_str().unwrap_or("").trim().to_string()
}

pub fn require_lmp_key(company: &Value, role: &Value) -> Result<(String, String), ValidationError> {
    let c = trim_str(company);
    let r = trim_str(role);
    let mut missing = Vec::new();
    if c.is_empty() {
        missing.push("company".into());
    }
    if r.is_empty() {
        missing.push("role".into());
    }
    if !missing.is_empty() {
        return Err(ValidationError {
            error: format!("Missing required fields: {}", missing.join(", ")),
            ask: "Which LMP did you mean? I need both the company name and the role title.".into(),
            missing,
        });
    }
    Ok((c, r))
}

const CHAT_LMP_KINDS: &[&str] = &[
    "update_lmp_status",
    "update_lmp_field",
    "assign_poc",
    "delete_lmp_record",
    "add_lmp_record",
];

pub fn validate_chat_write_kind(kind: &str, payload: &Value) -> Result<Value, ValidationError> {
    let k = kind.trim();
    if k == "bulk_update" {
        let updates = payload.get("updates").and_then(Value::as_array).cloned().unwrap_or_default();
        if updates.is_empty() {
            return Err(ValidationError {
                error: "Missing required fields: updates".into(),
                ask: "Bulk update needs at least one row.".into(),
                missing: vec!["updates".into()],
            });
        }
        let mut normalized_updates = Vec::new();
        for u in updates {
            let (company, role) = require_lmp_key(&u["company"], &u["role"])?;
            let mut row = u.as_object().cloned().unwrap_or_default();
            row.insert("company".into(), Value::String(company));
            row.insert("role".into(), Value::String(role));
            normalized_updates.push(Value::Object(row));
        }
        let mut out = payload.as_object().cloned().unwrap_or_default();
        out.insert("updates".into(), Value::Array(normalized_updates));
        return Ok(Value::Object(out));
    }
    if !CHAT_LMP_KINDS.contains(&k) {
        return Ok(payload.clone());
    }
    let (company, role) = require_lmp_key(&payload["company"], &payload["role"])?;
    let mut normalized = payload.as_object().cloned().unwrap_or_default();
    normalized.insert("company".into(), Value::String(company));
    normalized.insert("role".into(), Value::String(role));
    match k {
        "update_lmp_status" if trim_str(&payload["status"]).is_empty() => {
            return Err(ValidationError {
                error: "Missing required fields: status".into(),
                ask: "What status should I set?".into(),
                missing: vec!["status".into()],
            });
        }
        "update_lmp_field" => {
            let fields = payload.get("fields").and_then(Value::as_object);
            if fields.map(|f| f.is_empty()).unwrap_or(true) {
                return Err(ValidationError {
                    error: "Missing required fields: fields".into(),
                    ask: "Which field should I update?".into(),
                    missing: vec!["fields".into()],
                });
            }
        }
        "assign_poc" if trim_str(&payload["poc_name"]).is_empty() => {
            return Err(ValidationError {
                error: "Missing required fields: poc_name".into(),
                ask: "Which POC should I assign?".into(),
                missing: vec!["poc_name".into()],
            });
        }
        _ => {}
    }
    Ok(Value::Object(normalized))
}

pub fn parse_update_command(utterance: &str) -> Option<(String, Value)> {
    let lower = utterance.to_lowercase();
    if !(lower.contains("update") || lower.contains("mark") || lower.contains("set")) {
        return None;
    }
    let status = if lower.contains("on hold") {
        "On Hold"
    } else if lower.contains("converted") {
        "Converted"
    } else if lower.contains("ongoing") {
        "Ongoing"
    } else if lower.contains("closed") {
        "Closed"
    } else {
        return None;
    };
    let parts: Vec<&str> = utterance.split_whitespace().collect();
    let company = parts
        .iter()
        .position(|p| p.eq_ignore_ascii_case("update") || p.eq_ignore_ascii_case("mark"))
        .and_then(|idx| parts.get(idx + 1).map(|s| s.trim_matches(|c| c == ',' || c == '·')))
        .map(|s| s.to_string())?;
    let role = parts
        .iter()
        .position(|p| *p == "·" || p.contains('·'))
        .and_then(|idx| parts.get(idx + 1).or_else(|| parts.get(idx)))
        .map(|s| s.trim_matches('·').to_string())
        .unwrap_or_else(|| "PM".into());
    Some((
        "update_lmp_status".into(),
        json!({
            "company": company,
            "role": role,
            "status": status,
        }),
    ))
}

pub fn allowed_role_for_write(role: &str) -> bool {
    !matches!(role, "student" | "mentor")
}

pub fn view_as_blocks_writes(view_as_role: Option<&str>) -> bool {
    view_as_role.is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_update_status_payload() {
        let payload = json!({ "company": "Acme", "role": "PM", "status": "On Hold" });
        let out = validate_chat_write_kind("update_lmp_status", &payload).unwrap();
        assert_eq!(out["status"], "On Hold");
    }

    #[test]
    fn rejects_missing_company() {
        let payload = json!({ "role": "PM", "status": "On Hold" });
        let err = validate_chat_write_kind("update_lmp_status", &payload).unwrap_err();
        assert!(err.missing.contains(&"company".to_string()));
    }

    #[test]
    fn parses_update_utterance() {
        let parsed = parse_update_command("update Acme · PM to On Hold").unwrap();
        assert_eq!(parsed.0, "update_lmp_status");
        assert_eq!(parsed.1["status"], "On Hold");
    }
}
