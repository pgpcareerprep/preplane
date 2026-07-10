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
    if let Some(parsed) = parse_status_update(utterance) {
        return Some(parsed);
    }
    if let Some(parsed) = parse_assign_poc(utterance) {
        return Some(parsed);
    }
    if let Some(parsed) = parse_delete_lmp(utterance) {
        return Some(parsed);
    }
    None
}

fn parse_status_update(utterance: &str) -> Option<(String, Value)> {
    let lower = utterance.to_lowercase();
    if !(lower.contains("update")
        || lower.contains("mark")
        || lower.contains("set")
        || lower.contains("change")
        || lower.contains("move"))
    {
        return None;
    }
    let status = if lower.contains("on hold") {
        "On Hold"
    } else if lower.contains("not converted") || lower.contains("not-converted") {
        "Not Converted"
    } else if lower.contains("converted") {
        "Converted"
    } else if lower.contains("ongoing") {
        "Ongoing"
    } else if lower.contains("closed") {
        "Closed"
    } else if lower.contains("dormant") {
        "Dormant"
    } else {
        return None;
    };
    // Prefer "Company · Role" form
    if let Some((company, role)) = split_company_role(utterance) {
        return Some((
            "update_lmp_status".into(),
            json!({ "company": company, "role": role, "status": status }),
        ));
    }
    let parts: Vec<&str> = utterance.split_whitespace().collect();
    let company = parts
        .iter()
        .position(|p| {
            p.eq_ignore_ascii_case("update")
                || p.eq_ignore_ascii_case("mark")
                || p.eq_ignore_ascii_case("set")
                || p.eq_ignore_ascii_case("change")
        })
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

fn parse_assign_poc(utterance: &str) -> Option<(String, Value)> {
    let lower = utterance.to_lowercase();
    if !(lower.contains("assign") || lower.contains("reassign") || lower.contains("allocate")) {
        return None;
    }
    if !lower.contains("poc") {
        return None;
    }
    let (company, role) = split_company_role(utterance)?;
    let parts: Vec<&str> = utterance.split_whitespace().collect();
    let verb_idx = parts.iter().position(|p| {
        let p = p.to_lowercase();
        p == "assign" || p == "reassign" || p == "allocate"
    })?;
    let mut name_parts = Vec::new();
    for p in parts.iter().skip(verb_idx + 1) {
        let pl = p.to_lowercase();
        if matches!(pl.as_str(), "as" | "prep" | "outreach" | "support" | "poc" | "to" | "for" | "on") {
            break;
        }
        if p.chars().next().is_some_and(|c| c.is_uppercase()) {
            name_parts.push(*p);
        } else if !name_parts.is_empty() {
            break;
        }
    }
    if name_parts.is_empty() {
        return None;
    }
    let poc_name = name_parts.join(" ");
    let poc_role = if lower.contains("outreach") {
        "outreach"
    } else if lower.contains("support") {
        "support"
    } else {
        "prep"
    };
    Some((
        "assign_poc".into(),
        json!({
            "company": company,
            "role": role,
            "poc_name": poc_name,
            "poc_role": poc_role,
        }),
    ))
}

fn parse_delete_lmp(utterance: &str) -> Option<(String, Value)> {
    let lower = utterance.to_lowercase();
    if !(lower.contains("delete")
        || lower.contains("remove")
        || lower.contains("soft-delete")
        || lower.contains("soft delete"))
    {
        return None;
    }
    let (company, role) = split_company_role(utterance)?;
    Some((
        "delete_lmp_record".into(),
        json!({ "company": company, "role": role }),
    ))
}

fn split_company_role(utterance: &str) -> Option<(String, String)> {
    let sep = if utterance.contains('·') {
        '·'
    } else if utterance.contains('•') {
        '•'
    } else {
        return None;
    };
    let mut parts = utterance.splitn(2, sep);
    let left = parts.next()?.trim();
    let right = parts.next()?.trim();
    if left.is_empty() || right.is_empty() {
        return None;
    }
    let lower_left = left.to_lowercase();
    // For assign/delete forms, company is usually after to/for/on.
    let company_src = if lower_left.contains(" to ") {
        left.rsplit_once(" to ").or_else(|| left.rsplit_once(" To "))?.1
    } else if lower_left.contains(" for ") {
        left.rsplit_once(" for ").or_else(|| left.rsplit_once(" For "))?.1
    } else if lower_left.contains(" on ")
        && (lower_left.contains("assign") || lower_left.contains("allocate"))
    {
        left.rsplit_once(" on ").or_else(|| left.rsplit_once(" On "))?.1
    } else {
        left
    };
    let verbs = [
        "update", "mark", "set", "change", "move", "assign", "reassign", "allocate",
        "delete", "remove", "the", "lmp", "for", "process", "soft-delete",
    ];
    let mut company_tokens: Vec<&str> = company_src.split_whitespace().collect();
    while let Some(first) = company_tokens.first() {
        let f = first.to_lowercase();
        if verbs.iter().any(|v| *v == f) {
            company_tokens.remove(0);
        } else {
            break;
        }
    }
    let company = company_tokens.join(" ").trim().to_string();
    let role = right
        .split_whitespace()
        .take_while(|w| {
            let wl = w.to_lowercase();
            !matches!(wl.as_str(), "to" | "as" | "=" | "poc" | "on")
                && !wl.starts_with("hold")
                && wl != "converted"
                && wl != "ongoing"
                && wl != "closed"
                && wl != "dormant"
        })
        .collect::<Vec<_>>()
        .join(" ");
    let role = if role.is_empty() {
        right.split_whitespace().next().unwrap_or("").to_string()
    } else {
        role
    };
    if company.len() >= 2 && !role.is_empty() {
        Some((company, role))
    } else {
        None
    }
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
        assert_eq!(parsed.1["company"], "Acme");
    }

    #[test]
    fn parses_assign_poc_utterance() {
        let parsed = parse_update_command("assign Radhika Goyal as Prep POC to Acme · PM").unwrap();
        assert_eq!(parsed.0, "assign_poc");
        assert_eq!(parsed.1["poc_name"], "Radhika Goyal");
        assert_eq!(parsed.1["company"], "Acme");
    }
}
