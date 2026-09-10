from tests.helpers import thermal_payload


def payload():
    return thermal_payload()


def test_analyze_populates_thermal_outputs(client):
    response = client.post("/analyze", json=payload())
    assert response.status_code == 200, response.text[:500]
    body = response.json()
    assert body["inputs"]["location"] == "Pangong"
    assert len(body["chart_data"]) == 24
    assert body["heat_flows"] and body["scenarios"]
    assert body["recommendation"] and body["recommendation_detail"]


def test_analyze_rejects_invalid_dimensions(client):
    invalid = payload()
    invalid["dimensions"]["length"] = 0
    response = client.post("/analyze", json=invalid)
    assert response.status_code == 422, response.text[:500]
