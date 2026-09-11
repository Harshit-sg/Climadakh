from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field

from models.analysis import AnalysisResult


class AiReviewRequest(BaseModel):
    analysis: AnalysisResult
    focus: Literal["review", "explain", "report"] = "review"
    question: str = Field(default="", max_length=1200)


class AiReviewHistoryItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    focus: Literal["review", "explain", "report"]
    recommendation: str
    response: str
    model: str