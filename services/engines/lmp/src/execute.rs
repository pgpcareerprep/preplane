use crate::mirror::{mirror_lmp_fields, mirror_lmp_upsert, MirrorResult};
use crate::supabase::SupabaseClient;
use preplane_contracts::{CommandKind, CommandEnvelope};
use serde_json::{json, Value};

pub struct ExecuteOutput {
    pub ok: bool,
    pub message: String,
    pub details: Value,
}

pub async fn execute_envelope(
    sb: &SupabaseClient,
    envelope: &CommandEnvelope,
) -> ExecuteOutput {
    let payload = &envelope.payload;
    match envelope.command {
        CommandKind::UpdateLmpStatus => {
            let company = str_field(payload, "company");
            let role = str_field(payload, "role");
            let status = str_field(payload, "status");
            let result = mirror_lmp_upsert(
                sb,
                &json!({ "company": company, "role": role, "status": status }),
            )
            .await;
            outcome(
                result,
                format!("Status updated to {status} for {company} · {role}"),
                format!("Could not update status for {company} · {role}"),
            )
        }
        CommandKind::UpdateLmpField => {
            let company = str_field(payload, "company");
            let role = str_field(payload, "role");
            let fields = payload
                .get("fields")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            let result = mirror_lmp_fields(sb, &company, &role, &fields).await;
            outcome(
                result,
                format!("Fields updated for {company} · {role}"),
                format!("Could not update fields for {company} · {role}"),
            )
        }
        CommandKind::AssignPoc => {
            let company = str_field(payload, "company");
            let role = str_field(payload, "role");
            let poc_name = str_field(payload, "poc_name");
            let poc_type = str_field(payload, "poc_type");
            let sheet_col = match poc_type.as_str() {
                "secondary" => "Secondary POC",
                "outreach" => "Outreach POC",
                _ => "Prep POC",
            };
            let mut fields = serde_json::Map::new();
            fields.insert(sheet_col.to_string(), json!(poc_name));
            let result = mirror_lmp_fields(sb, &company, &role, &fields).await;
            outcome(
                result,
                format!("Assigned {poc_name} as {sheet_col} for {company} · {role}"),
                format!("Could not assign POC for {company} · {role}"),
            )
        }
        CommandKind::AddLmpRecord => {
            let result = mirror_lmp_upsert(
                sb,
                &json!({
                    "company": str_field(payload, "company"),
                    "role": str_field(payload, "role"),
                    "domain_raw": opt_str(payload, "domain"),
                    "type": opt_str(payload, "type").unwrap_or_else(|| "Full Time".into()),
                    "status": opt_str(payload, "status").unwrap_or_else(|| "Ongoing".into()),
                    "prep_poc": opt_str(payload, "prep_poc"),
                    "outreach_poc": opt_str(payload, "outreach_poc"),
                }),
            )
            .await;
            let company = str_field(payload, "company");
            let role = str_field(payload, "role");
            outcome(
                result,
                format!("Created LMP record {company} · {role}"),
                format!("Could not create LMP record {company} · {role}"),
            )
        }
        CommandKind::DeleteLmpRecord => {
            let company = str_field(payload, "company");
            let role = str_field(payload, "role");
            let result = mirror_lmp_upsert(
                sb,
                &json!({ "company": company, "role": role, "status": "Closed" }),
            )
            .await;
            outcome(
                result,
                format!("Closed LMP record {company} · {role}"),
                format!("Could not close LMP record {company} · {role}"),
            )
        }
        CommandKind::BulkUpdate => {
            let updates = payload
                .get("updates")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut results = Vec::new();
            let mut ok_count = 0usize;
            for upd in &updates {
                let company = str_field(upd, "company");
                let role = str_field(upd, "role");
                let fields = upd
                    .get("fields")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                let r = mirror_lmp_fields(sb, &company, &role, &fields).await;
                if r.ok {
                    ok_count += 1;
                }
                results.push(json!({
                    "company": company,
                    "role": role,
                    "ok": r.ok,
                    "error": r.error,
                }));
            }
            let ok = ok_count == updates.len() && !updates.is_empty();
            ExecuteOutput {
                ok,
                message: format!("Bulk update: {ok_count}/{} succeeded", updates.len()),
                details: json!({ "results": results }),
            }
        }
        CommandKind::LogSubmission => ExecuteOutput {
            ok: false,
            message: "LOG_SUBMISSION engine path not implemented yet".into(),
            details: json!({ "status": "unsupported" }),
        },
    }
}

fn outcome(result: MirrorResult, success_msg: String, fail_msg: String) -> ExecuteOutput {
    ExecuteOutput {
        ok: result.ok,
        message: if result.ok {
            success_msg
        } else {
            fail_msg
        },
        details: json!({
            "db_result": {
                "ok": result.ok,
                "skipped": result.skipped,
                "error": result.error,
            }
        }),
    }
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn opt_str(v: &Value, key: &str) -> Option<String> {
    let s = str_field(v, key);
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

pub fn write_kind_label(command: &CommandKind) -> &'static str {
    match command {
        CommandKind::UpdateLmpStatus => "update_lmp_status",
        CommandKind::UpdateLmpField => "update_lmp_field",
        CommandKind::AssignPoc => "assign_poc",
        CommandKind::AddLmpRecord => "add_lmp_record",
        CommandKind::DeleteLmpRecord => "delete_lmp_record",
        CommandKind::BulkUpdate => "bulk_update",
        CommandKind::LogSubmission => "log_submission",
    }
}
