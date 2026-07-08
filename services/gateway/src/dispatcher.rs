use crate::auth::AuthedUser;
use crate::config::Config;
use crate::echo::{get_greeting_response, get_help_response};
use crate::intent_client::{
    call_command_plane_stage, call_query_path, call_reasoning_path, call_workflow_path,
    classify_utterance, query_template_for_sub_intent, RouterContextInput,
};
use preplane_contracts::IntentCategory;

pub struct DispatchBody<'a> {
    pub utterance: &'a str,
    pub user_name: Option<&'a str>,
    pub role: Option<&'a str>,
    pub real_role: Option<&'a str>,
    pub view_as_role: Option<&'a str>,
    pub view_as_user_name: Option<&'a str>,
    pub lmp_id: Option<&'a str>,
    pub mode: Option<&'a str>,
    pub history_len: usize,
}

pub struct DispatchResult {
    pub text: String,
    pub intent: String,
}

pub async fn dispatch_copilot(
    config: &Config,
    auth: &AuthedUser,
    body: DispatchBody<'_>,
) -> DispatchResult {
    let ctx = RouterContextInput {
        role: body.role.map(str::to_string),
        real_role: body.real_role.map(str::to_string),
        view_as_role: body.view_as_role.map(str::to_string),
        view_as_user_name: body.view_as_user_name.map(str::to_string),
        lmp_id: body.lmp_id.map(str::to_string),
        mode: body.mode.map(str::to_string),
        history_len: body.history_len,
    };

    let decision = classify_utterance(config, body.utterance, &ctx).await;
    let sub_intent = decision
        .as_ref()
        .map(|d| d.sub_intent.as_str())
        .unwrap_or("unknown");
    let category = decision
        .as_ref()
        .map(|d| d.category)
        .unwrap_or(IntentCategory::Unknown);

    if matches!(sub_intent, "help") {
        return DispatchResult {
            text: get_help_response(),
            intent: "help".into(),
        };
    }
    if matches!(sub_intent, "greeting") {
        return DispatchResult {
            text: get_greeting_response(first_name(body.user_name)),
            intent: "greeting".into(),
        };
    }

    match category {
        IntentCategory::Query => {
            let (template, args) = query_template_for_sub_intent(sub_intent);
            if let Some(text) = call_query_path(
                config,
                template,
                body.utterance,
                sub_intent,
                body.role,
                body.user_name,
                args,
            )
            .await
            {
                return DispatchResult {
                    text,
                    intent: format!("query_{template}"),
                };
            }
            DispatchResult {
                text: format!(
                    "Query path unavailable — echoing intent `{sub_intent}`. Start query-path on :8084."
                ),
                intent: sub_intent.to_string(),
            }
        }
        IntentCategory::Command => {
            if let Some(text) = call_command_plane_stage(
                config,
                body.utterance,
                body.role,
                body.view_as_role,
                &auth.id,
                body.user_name,
            )
            .await
            {
                return DispatchResult {
                    text,
                    intent: "command_staged".into(),
                };
            }
            DispatchResult {
                text: "Command plane unavailable — start command-plane on :8082.".into(),
                intent: "command_stub".into(),
            }
        }
        IntentCategory::Reasoning => {
            if let Some(text) = call_reasoning_path(
                config,
                body.utterance,
                sub_intent,
                body.role,
                body.lmp_id,
                body.mode,
            )
            .await
            {
                return DispatchResult {
                    text,
                    intent: "reasoning".into(),
                };
            }
            DispatchResult {
                text: "Reasoning path unavailable — start reasoning on :9002.".into(),
                intent: "reasoning_stub".into(),
            }
        }
        IntentCategory::Workflow => {
            if let Some(text) = call_workflow_path(config, body.utterance).await {
                return DispatchResult {
                    text,
                    intent: "workflow_plan".into(),
                };
            }
            DispatchResult {
                text: "Workflow path unavailable — start workflow on :9003.".into(),
                intent: "workflow_stub".into(),
            }
        }
        IntentCategory::Unknown => DispatchResult {
            text: get_greeting_response(first_name(body.user_name)),
            intent: sub_intent.to_string(),
        },
    }
}

fn first_name(user_name: Option<&str>) -> &str {
    user_name
        .and_then(|n| n.split_whitespace().next())
        .filter(|s| !s.is_empty())
        .unwrap_or("there")
}
