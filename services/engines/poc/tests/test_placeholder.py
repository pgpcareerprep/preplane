import pytest


@pytest.mark.xfail(reason="Phase 1+: poc behavior not implemented", strict=True)
def test_poc_placeholder():
    raise AssertionError("poc behavior pending")
