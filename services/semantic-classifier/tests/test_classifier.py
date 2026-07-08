import pytest

from classifier import score_utterance


def test_greeting_is_unknown_category():
    out = score_utterance("hello there")
    assert out.category == "UNKNOWN"
    assert out.confidence >= 0.9


def test_update_scores_command():
    out = score_utterance("update Acme PM to converted")
    assert out.category == "COMMAND"
    assert out.confidence >= 0.5


def test_workflow_multi_step():
    out = score_utterance("parse this jd and then find mentors")
    assert out.category in {"WORKFLOW", "REASONING", "COMMAND"}
