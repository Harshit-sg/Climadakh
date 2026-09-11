"""HTTP-level check for the v2 heat-balance solver contract on /api/analyze.

Verifies (over the running server, real DB) that a v2 request:
  - returns rc-energy-v2.0 model_info metadata with material snapshots
  - produces an hourly energy_balance ledger matching duration_hours
  - each hour's gains (solar+internal+ambient) minus the six positive
    outward loss pathways equals storage_change within 1e-6 kWh
  - heat_flows pathway totals reconcile with heat_loss_kwh
"""
import httpx

BASE_URL = "http://localhost:8001"


def v2_payload():
    return {
        "location": "Leh",
        "ambient_day": 6,
        "ambient_night": -14,
        "solar_irradiance": 5.8,
        "sunshine_hours": 9,
        "dimensions": {"length": 6, "width": 4, "height": 2.7},
        "orientation": "south",
        "opening_area": 2.4,
        "wall_material": "aac",
        "roof_material": "insulated-panel",
        "thermal_mass": "medium",
        "duration_hours": 24,
        "physics": {
            "wall_insulation_id": "mineral-wool",
            "air_changes_per_hour": 1.0,
        },
    }


def test_analyze_v2_metadata_and_balance_closure():
    resp = httpx.post(f"{BASE_URL}/api/analyze", json=v2_payload(), timeout=30)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # metadata contract
    model_info = data["model_info"]
    assert model_info is not None
    assert model_info["version"] == "rc-energy-v2.0"
    assert model_info["validation_status"] == "uncalibrated"
    snapshot_ids = {m["id"] for m in model_info["material_snapshots"]}
    assert snapshot_ids == {"aac", "insulated-panel", "mineral-wool"}

    # duration-matched hourly ledger
    ledger = data["energy_balance"]
    assert len(ledger) == 24

    positive_loss_keys = [
        "walls_out",
        "roof_out",
        "floor_out",
        "openings_out",
        "ventilation_out",
        "bridges_out",
    ]
    for point in ledger:
        for key in positive_loss_keys:
            assert point[key] >= -1e-9, f"loss pathway {key} should be non-negative, got {point[key]}"
        gains = point["solar_in"] + point["internal_in"] + point["ambient_in"]
        losses = sum(point[k] for k in positive_loss_keys)
        assert abs(gains - losses - point["storage_change"]) < 1e-6, (
            f"hour {point['hour']}: gains {gains} - losses {losses} != storage_change {point['storage_change']}"
        )

    # pathway totals reconcile with headline heat_loss_kwh
    heat_flow_total = sum(flow["value"] for flow in data["heat_flows"])
    assert abs(heat_flow_total - data["heat_loss_kwh"]) < 5e-3


def test_analyze_v2_rejects_unknown_material():
    payload = v2_payload()
    payload["wall_material"] = "tscheck-not-a-real-material"
    resp = httpx.post(f"{BASE_URL}/api/analyze", json=payload, timeout=30)
    assert resp.status_code == 422, resp.text
