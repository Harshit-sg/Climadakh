from tests.helpers import thermal_payload


def test_ai_review_rejects_missing_analysis(client):
    response = client.post("/ai/review", json={"focus": "review", "question": "hi"})
    assert response.status_code == 422, response.text[:500]


def test_ai_review_rejects_invalid_focus(client):
    analyzed = client.post("/analyze", json=thermal_payload())
    assert analyzed.status_code == 200, analyzed.text[:500]
    response = client.post(
        "/ai/review",
        json={"analysis": analyzed.json(), "focus": "not-a-real-focus", "question": ""},
    )
    assert response.status_code == 422, response.text[:500]


def test_ai_review_rejects_question_over_max_length(client):
    analyzed = client.post("/analyze", json=thermal_payload())
    assert analyzed.status_code == 200, analyzed.text[:500]
    response = client.post(
        "/ai/review",
        json={"analysis": analyzed.json(), "focus": "review", "question": "x" * 1300},
    )
    assert response.status_code == 422, response.text[:500]
