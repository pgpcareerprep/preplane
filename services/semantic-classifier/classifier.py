import os
import re
import sys
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared", "python"))
sys.path.insert(0, ROOT)

from preplane_health import create_app

Category = Literal["COMMAND", "QUERY", "REASONING", "WORKFLOW", "UNKNOWN"]

BUCKETS: dict[Category, list[str]] = {
    "COMMAND": ["update", "delete", "assign", "create lmp", "mark", "convert", "set status"],
    "QUERY": [
        "search",
        "show",
        "list",
        "find",
        "how many",
        "workload",
        "progress of",
        "who is",
        "overview",
        "summary",
    ],
    "REASONING": ["mentor", "case study", "parse jd", "jd", "cv", "recommend poc", "analyze"],
    "WORKFLOW": ["make plan", "and then", "first parse", "then assign", "then find"],
}


class ClassifyRequest(BaseModel):
    utterance: str


class ClassifyResponse(BaseModel):
    category: Category
    confidence: float = Field(ge=0.0, le=1.0)
    probabilities: dict[Category, float]


def score_utterance(utterance: str) -> ClassifyResponse:
    msg = utterance.lower().strip()
    scores: dict[Category, float] = {k: 0.15 for k in BUCKETS}
    for cat, keys in BUCKETS.items():
        hits = sum(1 for k in keys if k in msg)
        if hits:
            scores[cat] = min(0.95, 0.4 + hits * 0.15)
    if re.search(r"^(hi|hey|hello)\b", msg):
        scores["UNKNOWN"] = 0.95
    best = max(scores.items(), key=lambda x: x[1])
    total = sum(scores.values()) or 1.0
    probs = {k: v / total for k, v in scores.items()}
    return ClassifyResponse(category=best[0], confidence=best[1], probabilities=probs)


app = create_app("semantic-classifier")


@app.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    return score_utterance(req.utterance)
