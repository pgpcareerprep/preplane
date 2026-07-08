use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalRequest {
    pub channel: Channel,
    pub user: UserContext,
    pub mode: CopilotMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lmp_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub mentions: Vec<Mention>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_context: Option<ActiveContext>,
    pub messages: Vec<ChatMessage>,
    pub turn_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_action: Option<PendingActionRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirm_action: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancel_action: Option<bool>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Web,
    Voice,
    Slack,
    Whatsapp,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CopilotMode {
    Admin,
    Poc,
    Student,
    Mentor,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct UserContext {
    pub id: String,
    pub role: String,
    #[serde(rename = "realRole")]
    pub real_role: String,
    pub name: String,
    pub email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_as: Option<ViewAs>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct ViewAs {
    #[serde(rename = "userName")]
    pub user_name: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct Mention {
    #[serde(rename = "type")]
    pub mention_type: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct ActiveContext {
    pub entity_type: String,
    pub entity_id: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub: Option<String>,
    #[serde(default)]
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct PendingActionRef {
    pub pending_action_id: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum IntentCategory {
    #[serde(rename = "COMMAND")]
    Command,
    #[serde(rename = "QUERY")]
    Query,
    #[serde(rename = "REASONING")]
    Reasoning,
    #[serde(rename = "WORKFLOW")]
    Workflow,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct IntentDecision {
    pub category: IntentCategory,
    pub sub_intent: String,
    pub confidence: f64,
    pub signals: IntentSignals,
    pub entities: Vec<ExtractedEntity>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct IntentSignals {
    pub rules: SignalVote,
    pub semantic: SignalVote,
    pub similarity: SignalVote,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct SignalVote {
    pub category: IntentCategory,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct ExtractedEntity {
    pub kind: String,
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum CommandKind {
    #[serde(rename = "ADD_LMP_RECORD")]
    AddLmpRecord,
    #[serde(rename = "UPDATE_LMP_STATUS")]
    UpdateLmpStatus,
    #[serde(rename = "UPDATE_LMP_FIELD")]
    UpdateLmpField,
    #[serde(rename = "ASSIGN_POC")]
    AssignPoc,
    #[serde(rename = "DELETE_LMP_RECORD")]
    DeleteLmpRecord,
    #[serde(rename = "BULK_UPDATE")]
    BulkUpdate,
    #[serde(rename = "LOG_SUBMISSION")]
    LogSubmission,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommandEnvelope {
    pub command: CommandKind,
    pub entity_id: String,
    pub payload: serde_json::Value,
    pub idempotency_key: String,
    pub requested_by: String,
    pub issued_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_snapshot: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proposed_snapshot: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum EventType {
    #[serde(rename = "LMP_Updated")]
    LmpUpdated,
    #[serde(rename = "Mentor_Assigned")]
    MentorAssigned,
    #[serde(rename = "Plan_Generated")]
    PlanGenerated,
    #[serde(rename = "Interview_Scheduled")]
    InterviewScheduled,
    #[serde(rename = "Task_Failed")]
    TaskFailed,
    #[serde(rename = "Retry_Requested")]
    RetryRequested,
    #[serde(rename = "Notification_Sent")]
    NotificationSent,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EventEnvelope {
    #[serde(rename = "type")]
    pub event_type: EventType,
    pub entity_id: String,
    pub occurred_at: DateTime<Utc>,
    pub actor: EventActor,
    pub payload: serde_json::Value,
    pub causation_id: String,
    pub correlation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct EventActor {
    pub id: String,
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct SseDelta {
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct SseChoice {
    pub delta: SseDelta,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct SseChunk {
    pub choices: Vec<SseChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct CopilotBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct VoiceRequest {
    pub messages: Vec<VoiceMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_as_user_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_as_role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirm: Option<VoiceConfirm>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct VoiceMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct VoiceConfirm {
    pub pending_action_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct VoiceResponse {
    pub spoken: String,
    #[serde(default)]
    pub blocks: Vec<CopilotBlock>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_action: Option<PendingActionRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct VoiceSpeakRequest {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice_id: Option<String>,
}
