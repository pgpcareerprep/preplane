"""Pydantic models mirroring services/contracts/schemas/*.json."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class Channel(str, Enum):
    web = "web"
    voice = "voice"
    slack = "slack"
    whatsapp = "whatsapp"


class CopilotMode(str, Enum):
    admin = "admin"
    poc = "poc"
    student = "student"
    mentor = "mentor"


class ViewAs(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_name: Optional[str] = Field(default=None, alias="userName")
    role: Optional[str] = None


class UserContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    role: str
    real_role: str = Field(alias="realRole")
    name: str
    email: str
    view_as: Optional[ViewAs] = Field(default=None, alias="viewAs")


class Mention(BaseModel):
    type: str
    name: str
    entity_id: Optional[str] = None
    email: Optional[str] = None


class ActiveContext(BaseModel):
    entity_type: str
    entity_id: str
    display_name: str
    sub: Optional[str] = None
    pinned: bool = False


class ChatMessage(BaseModel):
    role: str
    content: str


class PendingActionRef(BaseModel):
    pending_action_id: str


class CanonicalRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    channel: Channel
    user: UserContext
    mode: CopilotMode
    lmp_id: Optional[str] = Field(default=None, alias="lmpId")
    snapshot: Optional[str] = None
    scope: Optional[str] = None
    thread_id: Optional[str] = Field(default=None, alias="threadId")
    mentions: list[Mention] = Field(default_factory=list)
    active_context: Optional[ActiveContext] = Field(default=None, alias="activeContext")
    messages: list[ChatMessage]
    turn_id: str = Field(alias="turnId")
    pending_action: Optional[PendingActionRef] = Field(default=None, alias="pendingAction")
    confirm_action: Optional[bool] = Field(default=None, alias="confirmAction")
    cancel_action: Optional[bool] = Field(default=None, alias="cancelAction")


class IntentCategory(str, Enum):
    COMMAND = "COMMAND"
    QUERY = "QUERY"
    REASONING = "REASONING"
    WORKFLOW = "WORKFLOW"
    UNKNOWN = "UNKNOWN"


class SignalVote(BaseModel):
    category: IntentCategory
    confidence: float


class IntentSignals(BaseModel):
    rules: SignalVote
    semantic: SignalVote
    similarity: SignalVote


class ExtractedEntity(BaseModel):
    kind: str
    value: str
    entity_id: Optional[str] = None


class IntentDecision(BaseModel):
    category: IntentCategory
    sub_intent: str
    confidence: float
    signals: IntentSignals
    entities: list[ExtractedEntity]


class CommandKind(str, Enum):
    ADD_LMP_RECORD = "ADD_LMP_RECORD"
    UPDATE_LMP_STATUS = "UPDATE_LMP_STATUS"
    UPDATE_LMP_FIELD = "UPDATE_LMP_FIELD"
    ASSIGN_POC = "ASSIGN_POC"
    DELETE_LMP_RECORD = "DELETE_LMP_RECORD"
    BULK_UPDATE = "BULK_UPDATE"
    LOG_SUBMISSION = "LOG_SUBMISSION"


class CommandEnvelope(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    command: CommandKind
    entity_id: str = Field(alias="entityId")
    payload: dict[str, Any]
    idempotency_key: str = Field(alias="idempotencyKey")
    requested_by: str = Field(alias="requestedBy")
    issued_at: datetime = Field(alias="issuedAt")
    current_snapshot: Optional[dict[str, Any]] = Field(default=None, alias="currentSnapshot")
    proposed_snapshot: Optional[dict[str, Any]] = Field(default=None, alias="proposedSnapshot")


class EventType(str, Enum):
    LMP_Updated = "LMP_Updated"
    Mentor_Assigned = "Mentor_Assigned"
    Plan_Generated = "Plan_Generated"
    Interview_Scheduled = "Interview_Scheduled"
    Task_Failed = "Task_Failed"
    Retry_Requested = "Retry_Requested"
    Notification_Sent = "Notification_Sent"


class EventActor(BaseModel):
    id: str
    role: str
    name: Optional[str] = None
    email: Optional[str] = None


class EventEnvelope(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: EventType
    entity_id: str = Field(alias="entityId")
    occurred_at: datetime = Field(alias="occurredAt")
    actor: EventActor
    payload: dict[str, Any]
    causation_id: str = Field(alias="causationId")
    correlation_id: str = Field(alias="correlationId")


class CopilotBlock(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str


class VoiceMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class VoiceConfirm(BaseModel):
    pending_action_id: str


class VoiceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    messages: list[VoiceMessage]
    user_name: Optional[str] = Field(default=None, alias="userName")
    role: Optional[str] = None
    user_id: Optional[str] = Field(default=None, alias="userId")
    user_email: Optional[str] = Field(default=None, alias="userEmail")
    view_as_user_name: Optional[str] = Field(default=None, alias="viewAsUserName")
    view_as_role: Optional[str] = Field(default=None, alias="viewAsRole")
    confirm: Optional[VoiceConfirm] = None


class VoiceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    spoken: str
    blocks: list[CopilotBlock] = Field(default_factory=list)
    pending_action: Optional[PendingActionRef] = Field(default=None, alias="pendingAction")
    error: Optional[str] = None
    code: Optional[str] = None


class VoiceSpeakRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str
    voice_id: Optional[str] = Field(default=None, alias="voiceId")
