import pytest


@pytest.mark.xfail(reason="Phase 1+: reasoning behavior not implemented", strict=True)
def test_reasoning_placeholder():
    raise AssertionError("reasoning behavior pending")
