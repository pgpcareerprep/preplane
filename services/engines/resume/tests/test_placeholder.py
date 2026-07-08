import pytest


@pytest.mark.xfail(reason="Phase 1+: resume behavior not implemented", strict=True)
def test_resume_placeholder():
    raise AssertionError("resume behavior pending")
