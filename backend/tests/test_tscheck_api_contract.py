from tests.helpers import thermal_payload


def test_api_contract_supports_analyze_save_and_list(client):
    response = client.post("/analyze", json=thermal_payload())
    assert response.status_code == 200, response.text[:500]
    result = response.json()
    assert result["inputs"]["location"] == "Pangong"
    saved = client.post("/analyses", json={"name": "tscheck-api-contract", "result": result})
    assert saved.status_code == 200, saved.text[:500]
    listing = client.get("/analyses")
    assert listing.status_code == 200, listing.text[:500]
    assert any(item["id"] == saved.json()["id"] for item in listing.json())


def test_api_contract_rejects_bad_duration(client):
    bad = thermal_payload()
    bad["duration_hours"] = 2
    response = client.post("/analyze", json=bad)
    assert response.status_code == 422, response.text[:500]
