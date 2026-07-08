import pytest


@pytest.mark.xfail(reason="Phase 1+: semantic-classifier behavior not implemented", strict=True)
def test_semantic_classifier_placeholder():
    raise AssertionError("semantic-classifier behavior pending")
