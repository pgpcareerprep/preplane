from planner import build_context, planner_stub, validate_with_repair, PlanRequest


def test_reasoning_plan_returns_sse_text():
    req = PlanRequest(utterance="find mentors for this JD", sub_intent="mentor_matching")
    ctx = build_context(req)
    output, repaired = validate_with_repair(planner_stub(req, ctx).model_dump())
    assert repaired is False
    assert "JD" in (output.answer or "")


def test_validator_repairs_malformed_output():
    output, repaired = validate_with_repair({"path": "not_a_valid_path"})
    assert repaired is True
    assert output.path == "answer"
    assert output.answer
