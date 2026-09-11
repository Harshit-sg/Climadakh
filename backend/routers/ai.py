import json
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

from lib.db import db
from models.ai import AiReviewHistoryItem, AiReviewRequest

router = APIRouter()
logger = logging.getLogger(__name__)

FOCUS_INSTRUCTIONS = {
    "review": "Review the design like a careful passive-solar building engineer. Prioritize the three most actionable changes and explain the trade-offs.",
    "explain": "Explain the model results in plain but technically accurate language for a project review, including what the chart and heat-loss pathways imply.",
    "report": "Draft a concise engineering study note with sections for inputs, findings, material comparison, limitations, and next validation steps.",
}


def _prompt(payload: AiReviewRequest) -> str:
    return f"""{FOCUS_INSTRUCTIONS[payload.focus]}

This is a reduced-order thermal model for a passive shelter in Ladakh. Do not present it as a certified calculation or ANSYS replacement. Use °C, kWh, and the exact values supplied. If a result is outside the comfort target, say so clearly. Never invent weather measurements or material properties.
Keep the full response under 500 words and lead with the most important decision.

User question: {payload.question or "No additional question. Make the response useful on its own."}

Climadakh analysis JSON:
{payload.analysis.model_dump_json(indent=2)}
"""


@router.post("/ai/review")
async def stream_ai_review(payload: AiReviewRequest) -> StreamingResponse:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI review is not configured")

    async def event_stream():
        full_response = ""
        review_id = str(uuid.uuid4())
        try:
            chat = (
                LlmChat(
                    api_key=api_key,
                    session_id=f"thermal-atlas-review-{review_id}",
                    system_message="You are Claude, an engineering design-review assistant inside Climadakh. Be precise, constructive, and concise.",
                )
                .with_model("anthropic", "claude-sonnet-4-6")
                .with_params(max_tokens=900)
            )
            async for event in chat.stream_message(UserMessage(text=_prompt(payload))):
                if isinstance(event, TextDelta):
                    full_response += event.content
                    yield f"data: {json.dumps({'type': 'delta', 'content': event.content})}\n\n"
                elif isinstance(event, StreamDone):
                    break
            record = AiReviewHistoryItem(
                id=review_id,
                created_at=datetime.now(timezone.utc),
                focus=payload.focus,
                recommendation=payload.analysis.recommendation,
                response=full_response,
                model="claude-sonnet-4-6",
            )
            await db.ai_reviews.insert_one(record.model_dump())
            yield f"data: {json.dumps({'type': 'done', 'review_id': review_id})}\n\n"
        except Exception as exc:
            logger.exception("Claude review failed: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'message': 'Claude could not complete this review. The thermal model is still available.'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/ai/history", response_model=list[AiReviewHistoryItem])
async def get_ai_history() -> list[AiReviewHistoryItem]:
    documents = await db.ai_reviews.find().sort("created_at", -1).to_list(12)
    return [AiReviewHistoryItem(**document) for document in documents]