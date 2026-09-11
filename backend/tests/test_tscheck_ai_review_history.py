import json

import httpx

from tests.helpers import thermal_payload
from tests.conftest import api_url


def test_ai_review_streams_and_persists_to_history():
    payload = thermal_payload()
    with httpx.Client(timeout=60.0) as raw:
        analyzed = raw.post(api_url("/analyze"), json=payload)
        assert analyzed.status_code == 200, analyzed.text[:500]
        analysis = analyzed.json()

        review_request = {
            "analysis": analysis,
            "focus": "review",
            "question": "tscheck-ai-history: what should change first?",
        }

        collected = ""
        review_id = None
        with raw.stream(
            "POST",
            api_url("/ai/review"),
            json=review_request,
            timeout=90.0,
        ) as response:
            assert response.status_code == 200, f"unexpected status {response.status_code}"
            for line in response.iter_lines():
                if not line or not line.startswith("data: "):
                    continue
                event = json.loads(line[len("data: "):])
                if event["type"] == "delta":
                    collected += event.get("content", "")
                elif event["type"] == "done":
                    review_id = event.get("review_id")
                elif event["type"] == "error":
                    raise AssertionError(f"Claude stream reported error: {event.get('message')}")

        assert review_id, "expected a review_id from the done event"
        assert len(collected) > 0, "expected streamed text content before completion"

        history = raw.get(api_url("/ai/history"))
        assert history.status_code == 200, history.text[:500]
        matches = [item for item in history.json() if item["id"] == review_id]
        assert len(matches) == 1, f"saved review {review_id} not found in /api/ai/history"
        saved = matches[0]
        assert saved["response"], "saved review response should be non-empty"
        assert saved["focus"] == "review"
        assert saved["recommendation"] == analysis["recommendation"]
        assert saved["created_at"]
        assert saved["model"] == "claude-sonnet-4-6"
