use serde_json::Value;
use std::collections::HashMap;

pub fn poc_read_scope_name(role: Option<&str>, user_name: Option<&str>) -> Option<String> {
    let role = role.unwrap_or("").trim();
    let name = user_name.unwrap_or("").trim();
    if role == "poc" && !name.is_empty() {
        Some(name.to_string())
    } else {
        None
    }
}

pub fn matches_filter(val: &str, filter: &str) -> bool {
    val.to_lowercase().contains(&filter.to_lowercase())
}

pub fn matches_poc_filter(cell_value: &str, filter: &str) -> bool {
    let v = cell_value.trim().to_lowercase();
    let f = filter.trim().to_lowercase();
    if v.is_empty() || f.is_empty() {
        return false;
    }
    if v.contains(&f) || f.contains(&v) {
        return true;
    }
    let v_first = v.split_whitespace().next().unwrap_or("");
    let f_first = f.split_whitespace().next().unwrap_or("");
    !v_first.is_empty()
        && !f_first.is_empty()
        && (v_first == f_first || v_first.starts_with(f_first) || f_first.starts_with(v_first))
}

pub fn record_matches_operational_poc_scope(record: &HashMap<String, String>, poc_name: &str) -> bool {
    matches_poc_filter(record.get("Prep POC").map(String::as_str).unwrap_or(""), poc_name)
        || matches_poc_filter(
            record.get("Support POC").map(String::as_str).unwrap_or(""),
            poc_name,
        )
        || matches_poc_filter(
            record.get("Secondary POC").map(String::as_str).unwrap_or(""),
            poc_name,
        )
}

pub fn apply_poc_read_scope(
    records: Vec<HashMap<String, String>>,
    role: Option<&str>,
    user_name: Option<&str>,
    args: &Value,
) -> Vec<HashMap<String, String>> {
    let scope_poc = poc_read_scope_name(role, user_name);
    let explicit_poc = args.get("poc").and_then(Value::as_str).is_some();
    let org_wide = args.get("scope_org_wide").and_then(Value::as_bool) == Some(true);
    if scope_poc.is_none() || explicit_poc || org_wide {
        return records;
    }
    let poc = scope_poc.unwrap();
    records
        .into_iter()
        .filter(|r| record_matches_operational_poc_scope(r, &poc))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn row(prep: &str, support: &str) -> HashMap<String, String> {
        HashMap::from([
            ("Prep POC".into(), prep.into()),
            ("Support POC".into(), support.into()),
            ("Secondary POC".into(), "".into()),
            ("Company".into(), "Acme".into()),
        ])
    }

    #[test]
    fn poc_scope_filters_to_assigned_rows() {
        let records = vec![row("Sam", ""), row("Alex", "")];
        let scoped = apply_poc_read_scope(records, Some("poc"), Some("Sam"), &Value::Null);
        assert_eq!(scoped.len(), 1);
        assert_eq!(scoped[0].get("Company").map(String::as_str), Some("Acme"));
    }

    #[test]
    fn admin_sees_all_rows() {
        let records = vec![row("Sam", ""), row("Alex", "")];
        let scoped = apply_poc_read_scope(records, Some("admin"), Some("Admin"), &Value::Null);
        assert_eq!(scoped.len(), 2);
    }
}
