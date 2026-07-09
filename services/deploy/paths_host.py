"""Single-process host for the Python path services.

Runs the semantic classifier, reasoning path, and workflow path inside one
uvicorn process so the Render instance memory budget holds. Callers address
each service by path prefix on PATHS_PORT (default 9001):

  SEMANTIC_CLASSIFIER_URL=http://127.0.0.1:9001/semantic   -> POST /classify
  REASONING_URL=http://127.0.0.1:9001/reasoning            -> POST /plan
  WORKFLOW_URL=http://127.0.0.1:9001/workflow              -> POST /decompose

Each mounted app keeps its own /health, plus this host serves a root /health.
"""

import os
import sys

SERVICES_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(SERVICES_ROOT, "shared", "python"))
sys.path.insert(0, os.path.join(SERVICES_ROOT, "semantic-classifier"))
sys.path.insert(0, os.path.join(SERVICES_ROOT, "reasoning"))
sys.path.insert(0, os.path.join(SERVICES_ROOT, "workflow"))

import uvicorn  # noqa: E402
from fastapi import FastAPI  # noqa: E402

from classifier import app as semantic_app  # noqa: E402
from planner import app as reasoning_app  # noqa: E402
from plan import app as workflow_app  # noqa: E402

host = FastAPI(title="preplane-paths")
host.mount("/semantic", semantic_app)
host.mount("/reasoning", reasoning_app)
host.mount("/workflow", workflow_app)


@host.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "paths",
        "mounted": ["semantic", "reasoning", "workflow"],
    }


if __name__ == "__main__":
    uvicorn.run(
        host,
        host="0.0.0.0",
        port=int(os.environ.get("PATHS_PORT", "9001")),
        log_level="warning",
    )
