from __future__ import annotations

import json
import os
import re
import sys
import uuid
from typing import Any, Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared", "python"))
sys.path.insert(0, ROOT)

from preplane_health import create_app

StepKind = Literal["QUERY", "COMMAND", "REASONING"]
StepStatus = Literal["pending", "in_progress", "done", "failed", "skipped"]

MAX_ROUNDS = 14
SOFT_WRAP_ROUND = 12

_PLANS: dict[str, "WorkflowPlan"] = {}


class PlanStep(BaseModel):
    id: str
    title: str
    detail: str | None = None
    kind: StepKind = "QUERY"
    tool: str | None = None
    depends_on: list[str] = Field(default_factory=list)
    status: StepStatus = "pending"
    result_summary: str | None = None


class WorkflowPlan(BaseModel):
    plan_id: str
    goal: str
    steps: list[PlanStep]
    started_at: str
    rounds_used: int = 0


class MakePlanRequest(BaseModel):
    goal: str
    steps: list[dict[str, Any]] = Field(default_factory=list)


class UpdatePlanStepRequest(BaseModel):
    plan_id: str
    step_id: str
    status: StepStatus
    result_summary: str | None = None


class DecomposeRequest(BaseModel):
    utterance: str


class WorkflowResponse(BaseModel):
    plan: WorkflowPlan
    sse_text: str
    follow_ups: list[str] = Field(default_factory=list)
    soft_wrap: bool = False


WORKFLOW_PATTERNS = [
    (re.compile(r"parse.*jd.*mentor", re.I), [
        ("Parse JD", "REASONING", "parse_jd"),
        ("Find mentors", "REASONING", "find_mentors_for_jd"),
        ("Assign best mentor", "COMMAND", "assign_poc"),
    ]),
    (re.compile(r"parse.*assign|find mentors.*assign", re.I), [
        ("Parse JD", "REASONING", "parse_jd"),
        ("Find mentors", "REASONING", "find_mentors_for_jd"),
        ("Assign best mentor", "COMMAND", "prepare_write"),
    ]),
]


def make_plan(goal: str, raw_steps: list[dict[str, Any]]) -> WorkflowPlan:
    steps: list[PlanStep] = []
    seen: set[tuple[str, str]] = set()
    for i, raw in enumerate(raw_steps[:12]):
        tool = str(raw.get("tool") or raw.get("title") or f"step_{i+1}")
        key = (tool, json.dumps(raw.get("args", {}), sort_keys=True))
        if key in seen:
            continue
        seen.add(key)
        steps.append(
            PlanStep(
                id=str(raw.get("id") or f"s{i+1}"),
                title=str(raw.get("title") or f"Step {i+1}"),
                detail=raw.get("detail"),
                kind=raw.get("kind", "QUERY"),
                tool=raw.get("tool"),
                depends_on=list(raw.get("depends_on") or []),
            )
        )
    plan = WorkflowPlan(
        plan_id=f"pl_{uuid.uuid4().hex[:8]}",
        goal=goal,
        steps=steps,
        started_at=__import__("datetime").datetime.utcnow().isoformat() + "Z",
    )
    _PLANS[plan.plan_id] = plan
    return plan


def decompose_utterance(utterance: str) -> WorkflowPlan:
    for pattern, blueprint in WORKFLOW_PATTERNS:
        if pattern.search(utterance):
            steps = [
                {"id": f"s{i+1}", "title": title, "kind": kind, "tool": tool}
                for i, (title, kind, tool) in enumerate(blueprint)
            ]
            return make_plan(utterance.strip(), steps)
    return make_plan(
        utterance.strip(),
        [
            {"id": "s1", "title": "Gather context", "kind": "QUERY", "tool": "search_lmp_records"},
            {"id": "s2", "title": "Reason over data", "kind": "REASONING", "tool": "check_lmp_context"},
            {"id": "s3", "title": "Stage command", "kind": "COMMAND", "tool": "prepare_write"},
        ],
    )


def update_plan_step(req: UpdatePlanStepRequest) -> WorkflowPlan:
    plan = _PLANS.get(req.plan_id)
    if not plan:
        raise KeyError(f"Unknown plan_id {req.plan_id}")
    step = next((s for s in plan.steps if s.id == req.step_id), None)
    if not step:
        raise KeyError(f"Unknown step_id {req.step_id}")
    step.status = req.status
    if req.result_summary:
        step.result_summary = req.result_summary
    plan.rounds_used += 1
    return plan


def format_plan_sse(plan: WorkflowPlan, soft_wrap: bool = False) -> str:
    follow = "Continue from where you left off." if soft_wrap else ""
    text = f"Workflow plan for: {plan.goal}"
    if follow:
        text += f"\n\n{follow}"
    block = {
        "type": "plan-card",
        "plan_id": plan.plan_id,
        "goal": plan.goal,
        "steps": [s.model_dump() for s in plan.steps],
        "rounds_used": plan.rounds_used,
        "max_rounds": MAX_ROUNDS,
    }
    return f"{text}\n\n:::blocks\n{json.dumps([block])}\n:::"


app = create_app("workflow")


@app.post("/make_plan", response_model=WorkflowResponse)
def create_plan(req: MakePlanRequest) -> WorkflowResponse:
    plan = make_plan(req.goal, [s for s in req.steps])
    return WorkflowResponse(plan=plan, sse_text=format_plan_sse(plan))


@app.post("/decompose", response_model=WorkflowResponse)
def decompose(req: DecomposeRequest) -> WorkflowResponse:
    plan = decompose_utterance(req.utterance)
    return WorkflowResponse(plan=plan, sse_text=format_plan_sse(plan))


@app.post("/update_plan_step", response_model=WorkflowResponse)
def patch_plan_step(req: UpdatePlanStepRequest) -> WorkflowResponse:
    plan = update_plan_step(req)
    soft_wrap = plan.rounds_used >= SOFT_WRAP_ROUND
    follow_ups = ["Continue from where you left off."] if soft_wrap else []
    return WorkflowResponse(
        plan=plan,
        sse_text=format_plan_sse(plan, soft_wrap=soft_wrap),
        follow_ups=follow_ups,
        soft_wrap=soft_wrap,
    )
