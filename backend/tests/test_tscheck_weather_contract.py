from io import BytesIO


def test_weather_live_sample_and_import_contract(client):
    live = client.get("/weather/live", params={"location": "Leh"})
    assert live.status_code == 200, live.text[:500]
    live_data = live.json()
    assert live_data["location"] == "Leh"
    assert live_data["source"]
    assert isinstance(live_data["points"], list)
    assert "current_temperature" in live_data

    sample = client.get("/weather/sample", params={"location": "Leh"})
    assert sample.status_code == 200, sample.text[:500]
    sample_data = sample.json()
    assert sample_data["source"]
    assert len(sample_data["points"]) >= 2

    csv = b"timestamp,temperature,solar_radiation\n2026-09-10T00:00:00Z,-12,0\n2026-09-10T12:00:00Z,4,620\n"
    imported = client.post(
        "/weather/import",
        params={"location": "Leh"},
        files={"file": ("tscheck-measured-weather.csv", BytesIO(csv), "text/csv")},
    )
    assert imported.status_code == 200, imported.text[:500]
    imported_data = imported.json()
    assert imported_data["source"].startswith("Uploaded measured CSV")
    assert imported_data["points"][0]["temperature"] == -12
    assert imported_data["points"][1]["solar_radiation_w_m2"] == 620


def test_weather_import_rejects_non_csv_and_malformed_rows(client):
    non_csv = client.post(
        "/weather/import",
        files={"file": ("notes.txt", BytesIO(b"temperature\n2\n3\n"), "text/plain")},
    )
    assert non_csv.status_code == 422, non_csv.text[:500]

    malformed = client.post(
        "/weather/import",
        files={"file": ("bad.csv", BytesIO(b"timestamp,solar_radiation\n2026-09-10,50\n"), "text/csv")},
    )
    assert malformed.status_code == 422, malformed.text[:500]
