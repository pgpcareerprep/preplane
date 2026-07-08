from plan import (
    MAX_ROUNDS,
    SOFT_WRAP_ROUND,
    UpdatePlanStepRequest,
    decompose_utterance,
    format_plan_sse,
    make_plan,
    update_plan_step,
)


def test_decompose_jd_mentor_assign_plan():
    plan = decompose_utterance("parse this JD, find mentors, assign the best")
    assert len(plan.steps) >= 3
    kinds = {s.kind for s in plan.steps}
    assert "REASONING" in kinds
    assert "COMMAND" in kinds
    assert "plan-card" in format_plan_sse(plan)


def test_round_budget_soft_wrap():
    plan = make_plan("goal", [{"id": "s1", "title": "Step 1"}])
    for i in range(SOFT_WRAP_ROUND):
        plan = update_plan_step(
            UpdatePlanStepRequest(
                plan_id=plan.plan_id,
                step_id="s1",
                status="done",
                result_summary=f"r{i}",
            )
        )
    assert plan.rounds_used >= SOFT_WRAP_ROUND
    assert plan.rounds_used <= MAX_ROUNDS
