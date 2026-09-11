from typing import Literal
from pydantic import BaseModel


class MaterialDefinition(BaseModel):
    id: str
    label: str
    category: Literal["Earth & masonry", "Structural", "Insulation"]
    conductivity_w_m_k: float
    density_kg_m3: float
    specific_heat_j_kg_k: float
    default_thickness_mm: float
    description: str
    source_url: str
    property_basis: str