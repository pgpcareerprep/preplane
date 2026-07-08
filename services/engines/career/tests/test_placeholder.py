import pytest


@pytest.mark.xfail(reason="Phase 1+: career behavior not implemented", strict=True)
def test_career_placeholder():
    raise AssertionError("career behavior pending")
