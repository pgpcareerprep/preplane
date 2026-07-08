import pytest


@pytest.mark.xfail(reason="Phase 1+: workflow behavior not implemented", strict=True)
def test_workflow_placeholder():
    raise AssertionError("workflow behavior pending")
