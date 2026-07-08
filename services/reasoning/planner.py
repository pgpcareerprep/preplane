from __future__ import annotations

import json
import os
import re
import sys
from typing import Any, Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field, ValidationError

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared", "python"))
sys.path.insert(0, ROOT)

from preplane_health import create_app

PathKind = Literal["answer", "command", "plan"]


class PlanRequest(BaseModel):
    utterance: str
    sub_intent: str | None = None
    role: str | None = None
    lmp_id: str | None = None
    mode: str | None = None


class LmpContext(BaseModel):
    has_jd: bool = False
    jd_summary: str | None = None
    missing_fields: list[str] = Field(default_factory=list)
    guidance: str | None = None
    company: str | None = None
    role: str | None = None


class PlannerOutput(BaseModel):
    path: PathKind
    answer: str | None = None
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    command: dict[str, Any] | None = None
    plan: dict[str, Any] | None = None


class PlanResponse(BaseModel):
    context: LmpContext
    output: PlannerOutput
    sse_text: str
    repaired: bool = False


MENTOR_PATTERNS = re.compile(r"\b(mentor|jd|parse)\b", re.I)
CASE_STUDY_PATTERNS = re.compile(r"\bcase study\b", re.I)


def build_context(req: PlanRequest) -> LmpContext:
    company = None
    role = None
    m = re.search(r"for\s+([A-Za-z0-9&.\- ]+)", req.utterance, re.I)
    if m:
        company = m.group(1).strip().rstrip("?.,")
    if req.lmp_id:
        return LmpContext(
            has_jd=True,
            jd_summary="JD attached on active LMP context.",
            missing_fields=[],
            guidance="Use the active LMP JD for mentor matching.",
            company=company,
            role=role,
        )
    if MENTOR_PATTERNS.search(req.utterance):
        return LmpContext(
            has_jd=False,
            missing_fields=["jd_text"],
            guidance="Attach or parse a JD before mentor matching.",
            company=company,
            role=role,
        )
    return LmpContext(company=company, role=role)


def planner_stub(req: PlanRequest, ctx: LmpContext) -> PlannerOutput:
    if CASE_STUDY_PATTERNS.search(req.utterance):
        return PlannerOutput(
            path="answer",
            answer="I can draft a case-study brief once the LMP JD context is attached.",
            blocks=[{"type": "alert-cards", "alerts": [{"severity": "info", "title": "Reasoning path", "message": "Case study planner ready (Phase 3 stub)."}]}],
        )
    if MENTOR_PATTERNS.search(req.utterance):
        if not ctx.has_jd:
            return PlannerOutput(
                path="answer",
                answer="I need a JD before I can rank mentors. Parse the JD or @mention an LMP with JD attached.",
                blocks=[{"type": "alert-cards", "alerts": [{"severity": "warning", "title": "Missing JD", "message": ctx.guidance or "Attach JD context first."}]}],
            )
        return PlannerOutput(
            path="answer",
            answer="Mentor shortlist reasoning is ready — execution still routes through confirm-then-write in later phases.",
            blocks=[{"type": "mentor-shortlist-card", "title": "Mentor reasoning (stub)", "items": []}],
        )
    return PlannerOutput(
        path="answer",
        answer="Reasoning path received your request. Full LLM planner wiring lands in Phase 5+.",
    )


def validate_planner_json(raw: dict[str, Any]) -> PlannerOutput:
    return PlannerOutput.model_validate(raw)


def validate_with_repair(raw: dict[str, Any]) -> tuple[PlannerOutput, bool]:
    try:
        return validate_planner_json(raw), False
    except ValidationError:
        repaired = dict(raw)
        repaired["path"] = "answer"
        repaired.setdefault("answer", "I could not parse the model output safely.")
        repaired.setdefault("blocks", [])
        return validate_planner_json(repaired), True


def format_sse(output: PlannerOutput) -> str:
    text = output.answer or "Reasoning complete."
    if output.blocks:
        return f"{text}\n\n:::blocks\n{json.dumps(output.blocks)}\n:::"
    return text


app = create_app("reasoning")


@app.post("/plan", response_model=PlanResponse)
def plan(req: PlanRequest) -> PlanResponse:
    ctx = build_context(req)
    output, repaired = validate_with_repair(planner_stub(req, ctx).model_dump())
    return PlanResponse(
        context=ctx,
        output=output,
        sse_text=format_sse(output),
        repaired=repaired,
    )
