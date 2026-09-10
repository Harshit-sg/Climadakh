import uuid

from tests.helpers import thermal_payload


def test_saved_analysis_can_be_created_and_listed(client):
    name = f"tscheck-save-{uuid.uuid4().hex[:10]}"
    analyzed = client.post("/analyze", json=thermal_payload())
    assert analyzed.status_code == 200, analyzed.text[:500]
    saved = client.post("/analyses", json={"name": name, "result": analyzed.json()})
    assert saved.status_code == 200, saved.text[:500]
    saved_body = saved.json()
    assert saved_body["name"] == name
    listed = client.get("/analyses")
    assert listed.status_code == 200, listed.text[:500]
    matching = [row for row in listed.json() if row["id"] == saved_body["id"]]
    assert len(matching) == 1
    assert matching[0]["result"]["inputs"]["location"] == "Pangong"


def test_saved_analysis_rejects_empty_name(client):
    analyzed = client.post("/analyze", json=thermal_payload())
    assert analyzed.status_code == 200
    response = client.post("/analyses", json={"name": "", "result": analyzed.json()})
    assert response.status_code == 422, response.text[:500]
