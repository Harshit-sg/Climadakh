from models.materials import MaterialDefinition

IES = "https://help.iesve.com/ve2022/table_6_thermal_conductivity__specific_heat_capacity_and_density.htm"
OU = "https://www.open.edu/openlearn/nature-environment/energy-buildings/content-section-3.2.3"
AAU = "https://vbn.aau.dk/ws/files/456230861/Thermal_properties_building_materials_2021.pdf"

# Generic, dry reference/scenario properties, not measured Ladakh samples.
# Legacy IDs are retained; only NEW runs use these versioned physical properties.
ROWS = [
    ("rammed-earth", "Rammed earth", "Earth & masonry", 1.2, 2000, 900, 400, "Dense earthen mass; moisture and compaction strongly affect heat transfer.", AAU, "Indicative earth scenario; not a tested local mix."),
    ("stone-mud", "Stone + mud mortar", "Earth & masonry", 1.8, 2243, 837, 450, "Stone-dominant equivalent layer; mortar joints are not resolved.", IES, "Stone ST01 reference approximates the composite, not a certified assembly."),
    ("insulated-panel", "Insulated composite", "Insulation", .025, 30, 1400, 100, "Equivalent PUR insulation core; skins and framing are omitted.", IES, "Polyurethane board reference; not a complete sandwich-panel rating."),
    ("adobe", "Adobe block", "Earth & masonry", .7, 1700, 900, 350, "Earthen block with heat storage; conductivity varies with moisture.", AAU, "Indicative dry adobe scenario; verify the actual soil formulation."),
    ("straw-clay", "Straw-clay composite", "Earth & masonry", .15, 400, 1400, 300, "Light earth-fibre infill; density varies considerably.", AAU, "Indicative composite scenario; laboratory measurements required."),
    ("brick", "Fired clay brick", "Earth & masonry", .84, 1700, 800, 230, "Outer-leaf brickwork reference; high mass is not high insulation.", IES, "Generic brickwork outer-leaf table values."),
    ("concrete", "Dense concrete", "Structural", 1.4, 2100, 840, 200, "Dense cast concrete; often benefits from continuous insulation.", IES, "Generic dense cast-concrete table values."),
    ("aac", "Aerated concrete (AAC)", "Structural", .11, 480, 1050, 200, "Low-density aerated block; confirm the required strength grade.", IES, "Reference low-density aerated block, not every AAC product."),
    ("timber", "Softwood timber", "Structural", .115, 513, 1381, 150, "Softwood equivalent layer; grain, moisture, and joints matter.", IES, "Generic softwood WD01 table values."),
    ("mineral-wool", "Mineral wool", "Insulation", .035, 30, 1000, 100, "Fibre-slab insulation; needs weather protection and a supporting assembly.", IES, "Generic mineral-fibre slab table values."),
    ("glass-wool", "Glass wool", "Insulation", .035, 25, 1000, 100, "Lightweight fibre insulation; compression changes performance.", IES, "Generic glass-fibre slab table values."),
    ("eps", "Expanded polystyrene (EPS)", "Insulation", .035, 25, 1400, 100, "Rigid foam; check fire protection, moisture, and detailing.", IES, "Generic EPS slab table values."),
    ("xps", "Extruded polystyrene (XPS)", "Insulation", .032, 35, 1400, 100, "Rigid foam for moisture-exposed detailing; product properties vary.", OU, "Conductivity within OU foam range; density and heat capacity are scenario estimates."),
    ("pir", "Polyisocyanurate (PIR)", "Insulation", .023, 32, 900, 100, "Low-conductivity foam; aging, facings, and fire detailing matter.", IES, "Generic cellular polyisocyanurate table values."),
    ("pur", "Polyurethane (PUR)", "Insulation", .025, 30, 1400, 100, "Foam-board insulation; confirm declared aged conductivity.", IES, "Generic polyurethane-board table values."),
    ("aerogel", "Aerogel blanket", "Insulation", .018, 150, 700, 30, "Thin specialty insulation; blanket composition matters.", AAU, "Indicative blanket properties, not a specific manufacturer's test certificate."),
    ("cork", "Expanded cork board", "Insulation", .04, 160, 1888, 100, "Bio-based insulation with moderate volumetric heat storage.", IES, "Generic cork-board table values."),
    ("hemp-fibre", "Hemp fibre insulation", "Insulation", .04, 40, 1600, 100, "Fibre insulation; needs moisture and fire-safe assembly design.", OU, "Conductivity at OU fibre range boundary; density and heat capacity are scenario estimates."),
]
MATERIALS = {row[0]: MaterialDefinition(**dict(zip(
    ("id", "label", "category", "conductivity_w_m_k", "density_kg_m3", "specific_heat_j_kg_k", "default_thickness_mm", "description", "source_url", "property_basis"), row
))) for row in ROWS}