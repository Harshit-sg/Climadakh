import math
import pytest
from fastapi import HTTPException
from lib.materials import MATERIALS
from lib.thermal_solver import build_analysis, simulate, _parameters, FLOW_KEYS
from models.analysis import AnalysisRequest, AnalysisResult
from models.thermal import PhysicsInputs


def request(**changes):
    data = dict(location="Leh", ambient_day=6, ambient_night=-14, solar_irradiance=5.8, sunshine_hours=7.9,
        dimensions={"length": 6, "width": 4, "height": 2.7}, orientation="south", opening_area=2.4,
        wall_material="rammed-earth", roof_material="insulated-panel", thermal_mass="high", duration_hours=24)
    data.update(changes)
    return AnalysisRequest(**data)


def test_material_catalogue_and_preserved_identifiers():
    assert len(MATERIALS) == 18
    assert {"rammed-earth", "stone-mud", "insulated-panel", "adobe", "straw-clay"} <= MATERIALS.keys()
    for material in MATERIALS.values():
        assert min(material.conductivity_w_m_k, material.density_kg_m3, material.specific_heat_j_kg_k, material.default_thickness_mm) > 0


def test_energy_conservation_and_pathway_closure():
    result = build_analysis(request(duration_hours=72))
    for point in result.energy_balance:
        loss = sum(getattr(point, key) for key in FLOW_KEYS)
        assert abs(point.solar_in + point.internal_in + point.ambient_in - loss - point.storage_change) < 1e-6
        assert abs(point.balance_error) < 1e-8
    assert sum(flow.value for flow in result.heat_flows) == pytest.approx(result.heat_loss_kwh, abs=5e-6)
    assert len(result.sensitivity) == 72
    for point, band in zip(result.chart_data, result.sensitivity):
        assert band.low <= point.inside_temp <= band.high


def test_equilibrium_has_no_fictitious_heat_loss():
    result = build_analysis(request(ambient_day=20, ambient_night=20,
        physics=PhysicsInputs(initial_temperature_c=20, ground_temperature_c=20, solar_absorptance=0, solar_heat_gain_coefficient=0)))
    assert all(point.inside_temp == 20 for point in result.chart_data)
    assert result.heat_loss_kwh == pytest.approx(0, abs=1e-7)
    assert result.comfort_hours == 24


def test_constant_boundary_matches_analytic_rc_solution():
    req = request(ambient_day=0, ambient_night=0, duration_hours=6,
        physics=PhysicsInputs(initial_temperature_c=20, ground_temperature_c=0, solar_absorptance=0, solar_heat_gain_coefficient=0))
    _, _, _, c, _, conductances, _ = _parameters(req)
    result = simulate(req)
    expected = 20 * math.exp(-sum(conductances) * 6 * 3600 / c)
    assert result["points"][-1].inside_temp == pytest.approx(expected, abs=.006)


@pytest.mark.parametrize("sunshine", [.001, 1, 7.9, 24])
def test_solar_energy_is_normalised_independent_of_sunshine(sunshine):
    req = request(sunshine_hours=sunshine, physics=PhysicsInputs(solar_absorptance=0, solar_heat_gain_coefficient=.6))
    result = simulate(req)
    assert result["totals"]["solar_in"] == pytest.approx(5.8 * 2.4 * .6, rel=1e-9)


def test_resistance_thickness_and_exterior_insulation():
    baseline = _parameters(request())
    thick = _parameters(request(physics=PhysicsInputs(wall_thickness_mm=800)))
    insulated = _parameters(request(physics=PhysicsInputs(wall_insulation_id="mineral-wool", wall_insulation_mm=100)))
    assert baseline[1] == pytest.approx(1 / (.13 + .4 / 1.2 + .04))
    assert thick[1] < baseline[1]
    assert insulated[1] == pytest.approx(1 / (.13 + .4 / 1.2 + .1 / .035 + .04))


def test_new_request_rejects_unknown_material_and_impossible_openings():
    for req in [request(wall_material="unobtainium"), request(opening_area=100), request(physics=PhysicsInputs(wall_insulation_id="concrete"))]:
        with pytest.raises(HTTPException) as error:
            build_analysis(req)
        assert error.value.status_code == 422


def test_legacy_result_remains_readable_without_added_metadata():
    result = build_analysis(request()).model_dump()
    original_temp = result["current_inside_temp"]
    for key in ("model_info", "energy_balance", "sensitivity"):
        result.pop(key)
    result["inputs"].pop("physics")
    loaded = AnalysisResult(**result)
    assert loaded.current_inside_temp == original_temp and loaded.model_info is None
    assert loaded.energy_balance == [] and loaded.inputs.physics is None