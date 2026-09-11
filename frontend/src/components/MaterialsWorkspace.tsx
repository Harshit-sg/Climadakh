import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Layers3, Search, Settings2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet } from "@/lib/api";
import { DEFAULT_PHYSICS } from "@/lib/thermal-types";
import type { AnalysisRequest, UpdateAnalysisInput, MaterialDefinition, PhysicsInputs } from "@/lib/thermal-types";

const CATEGORIES = ["All", "Earth & masonry", "Structural", "Insulation"] as const;

function PropertyInput({ id, label, unit, value, fallback, min, max, onChange }: {
  id: string; label: string; unit: string; value: number | null; fallback?: number; min: number; max: number; onChange: (value: number | null) => void;
}) {
  return <div><Label htmlFor={id} className="mb-2 text-xs leading-5 text-slate-300" data-testid={`${id}-label`}>{label} <span className="text-[10px] text-slate-500">{unit}</span></Label><Input id={id} type="number" step="any" min={min} max={max} value={value ?? ""} placeholder={fallback === undefined ? "Auto" : `Auto: ${fallback}`} onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))} className="h-10 border-white/15 bg-white/[.03] font-mono text-sm invalid:border-rose-400" data-testid={id} /></div>;
}

export default function MaterialsWorkspace({ inputs, onChange, onNext }: { inputs: AnalysisRequest; onChange: UpdateAnalysisInput; onNext: () => void }) {
  const query = useQuery({ queryKey: ["materials"], queryFn: () => apiGet<MaterialDefinition[]>("/materials"), staleTime: 300000, retry: false });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [inspected, setInspected] = useState<string>(inputs.wall_material);
  const materials = query.data ?? [];
  const selected = materials.find(material => material.id === inspected);
  const physics = { ...DEFAULT_PHYSICS, ...inputs.physics };
  const updatePhysics = <K extends keyof PhysicsInputs>(key: K, value: PhysicsInputs[K]) => onChange("physics", { ...physics, [key]: value });
  const filtered = materials.filter(material => (category === "All" || material.category === category) && `${material.label} ${material.id}`.toLowerCase().includes(search.toLowerCase()));
  const uValue = (side: "wall" | "roof") => {
    const core = materials.find(m => m.id === inputs[`${side}_material`]);
    if (!core) return null;
    const insulation = materials.find(m => m.id === physics[`${side}_insulation_id`]);
    const r = (side === "wall" ? .13 : .1) + .04 + (physics[`${side}_thickness_mm`] ?? core.default_thickness_mm) / 1000 / core.conductivity_w_m_k + (insulation ? physics[`${side}_insulation_mm`] / 1000 / insulation.conductivity_w_m_k : 0);
    return 1 / r;
  };
  return <div className="space-y-6" data-testid="materials-section">
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200/15 bg-amber-300/[.04] p-4 sm:flex-row sm:items-center" data-testid="material-reference-disclaimer"><BookOpen size={19} className="shrink-0 text-amber-200" /><p className="text-xs leading-6 text-slate-300" data-testid="material-reference-copy">Reference properties, not certified samples. Conductivity λ is a material property; assembly U-value also depends on thickness, surface films, and insulation. Fire and structural suitability require separate checks.</p></div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(360px,.85fr)_minmax(0,1.15fr)]">
      <Card className="workspace-card" data-testid="materials-input-card"><CardHeader><CardTitle className="flex items-center gap-2 font-heading text-xl" data-testid="materials-input-title"><Layers3 size={19} className="text-orange-300" /> Design the layers</CardTitle><CardDescription data-testid="materials-input-description">Core + optional exterior insulation. Blank thickness uses the catalogue default.</CardDescription></CardHeader><CardContent className="space-y-6">
        {(["wall", "roof"] as const).map(side => <div key={side} className="space-y-4 rounded-xl border border-white/10 bg-white/[.015] p-4" data-testid={`${side}-assembly-editor`}>
          <div className="flex items-center justify-between"><Label htmlFor={`${side}-material-select`} className="capitalize text-sm text-slate-100" data-testid={`${side}-material-label`}>{side} core</Label><span className="font-mono text-[11px] text-sky-200" data-testid={`${side}-u-value`}>U {uValue(side)?.toFixed(3) ?? "—"} W/m²K</span></div>
          <select id={`${side}-material-select`} value={inputs[`${side}_material`]} onChange={event => { onChange("physics", { ...physics, [`${side}_thickness_mm`]: null }); onChange(`${side}_material`, event.target.value); }} className="control-select" disabled={!materials.length} data-testid={`${side}-material-select`}>
            {!materials.length && <option value={inputs[`${side}_material`]}>Loading catalogue…</option>}
            {CATEGORIES.filter(c => c !== "All").map(group => <optgroup key={group} label={group}>{materials.filter(material => material.category === group).map(material => <option key={material.id} value={material.id}>{material.label}</option>)}</optgroup>)}
          </select>
          <PropertyInput id={`${side}-thickness-input`} label="Core thickness" unit="mm" min={.001} max={1500} value={physics[`${side}_thickness_mm`]} fallback={materials.find(m => m.id === inputs[`${side}_material`])?.default_thickness_mm} onChange={value => updatePhysics(`${side}_thickness_mm`, value)} />
          <div><Label htmlFor={`${side}-insulation-select`} className="mb-2 text-xs text-slate-400" data-testid={`${side}-insulation-label`}>Exterior insulation layer</Label><select id={`${side}-insulation-select`} value={physics[`${side}_insulation_id`] ?? "none"} onChange={event => updatePhysics(`${side}_insulation_id`, event.target.value === "none" ? null : event.target.value)} className="control-select" data-testid={`${side}-insulation-select`}><option value="none">None · core only</option>{materials.filter(material => material.category === "Insulation").map(material => <option key={material.id} value={material.id}>{material.label}</option>)}</select></div>
          {physics[`${side}_insulation_id`] && <PropertyInput id={`${side}-insulation-thickness-input`} label="Insulation thickness" unit="mm" min={0} max={500} value={physics[`${side}_insulation_mm`]} onChange={value => updatePhysics(`${side}_insulation_mm`, value ?? 0)} />}
        </div>)}
        <div><p className="mb-3 text-xs text-slate-300" data-testid="thermal-mass-label">Additional internal thermal storage</p><div className="grid grid-cols-3 gap-2">{(["low", "medium", "high"] as const).map(mass => <button key={mass} type="button" aria-pressed={inputs.thermal_mass === mass} onClick={() => onChange("thermal_mass", mass)} className={`mass-button py-3 ${inputs.thermal_mass === mass ? "mass-button-active" : ""}`} data-testid={`thermal-mass-${mass}-button`}>{mass}</button>)}</div><p className="mt-2 text-[11px] leading-5 text-slate-500" data-testid="thermal-mass-description">10 / 30 / 60 kJ per m²·K of internal storage, plus estimated active core-layer heat capacity. Not a measured whole-building capacity.</p></div>
        <Button onClick={onNext} className="h-11 w-full bg-orange-500 text-white hover:bg-orange-400" data-testid="materials-next-button">Next: Analysis <ArrowRight size={15} /></Button>
      </CardContent></Card>
      <Card className="workspace-card" data-testid="material-guide-card"><CardHeader className="flex-row items-start justify-between"><div><CardDescription className="font-mono text-[10px] uppercase tracking-[.16em]" data-testid="material-guide-eyebrow">Material field library</CardDescription><CardTitle className="mt-2 font-heading text-xl" data-testid="material-guide-title">Choose with the numbers.</CardTitle></div><span className="rounded-full border border-white/10 px-2 py-1 font-mono text-xs text-sky-200" data-testid="material-catalogue-count">{materials.length} materials</span></CardHeader><CardContent>
        <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-500" /><Input aria-label="Search material catalogue" placeholder="Search earth, wool, PIR…" value={search} onChange={event => setSearch(event.target.value)} className="border-white/10 bg-white/[.025] pl-9" data-testid="material-search-input" /></div>
        <div className="my-4 flex flex-wrap gap-2">{CATEGORIES.map((group, index) => <Button key={group} variant="outline" size="sm" aria-pressed={category === group} onClick={() => setCategory(group)} className={category === group ? "border-orange-300/30 bg-orange-300/10 text-orange-200" : "border-white/10 text-slate-400"} data-testid={`material-category-${index}`}>{group}</Button>)}</div>
        {query.isError && <div data-testid="material-catalogue-error"><p className="text-xs text-rose-200">Material catalogue is unavailable. Your current selection is kept.</p><Button className="mt-3" onClick={() => void query.refetch()} data-testid="material-catalogue-retry">Retry catalogue</Button></div>}
        {query.isPending && <p className="py-8 text-sm text-slate-400" data-testid="material-catalogue-loading">Loading reference properties…</p>}
        {!query.isPending && !query.isError && !filtered.length && <p className="py-6 text-xs text-slate-400" data-testid="material-search-empty">No matching materials. Try another name or category.</p>}
        <div className="max-h-[410px] space-y-1 overflow-y-auto pr-1" data-testid="material-catalogue-list">{filtered.map(material => <button key={material.id} type="button" aria-pressed={inspected === material.id} onClick={() => setInspected(material.id)} className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-sky-300/5 ${inspected === material.id ? "border-sky-300/25 bg-sky-300/5" : "border-transparent"}`} data-testid={`material-inspect-${material.id}`}><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-slate-200" data-testid={`material-name-${material.id}`}>{material.label}</p><p className="mt-1 text-[10px] text-slate-500" data-testid={`material-category-label-${material.id}`}>{material.category} · {material.default_thickness_mm} mm reference layer</p></div><div className="text-right"><p className="font-mono text-sm text-orange-200" data-testid={`material-lambda-${material.id}`}>{material.conductivity_w_m_k.toFixed(3)}</p><p className="text-[9px] text-slate-500" data-testid={`material-lambda-unit-${material.id}`}>λ W/m·K</p></div></div></button>)}</div>
        {selected && <div className="mt-5 rounded-xl border border-sky-300/15 bg-sky-300/[.035] p-4" data-testid="material-property-detail"><p className="font-heading text-lg text-sky-100" data-testid="material-detail-title">{selected.label}</p><div className="my-4 grid grid-cols-2 gap-3"><div><p className="text-[10px] text-slate-500" data-testid="material-density-label">Density</p><p className="mt-1 font-mono text-sm" data-testid="material-density-value">{selected.density_kg_m3} kg/m³</p></div><div><p className="text-[10px] text-slate-500" data-testid="material-capacity-label">Specific heat</p><p className="mt-1 font-mono text-sm" data-testid="material-capacity-value">{selected.specific_heat_j_kg_k} J/kg·K</p></div></div><p className="text-xs leading-6 text-slate-400" data-testid="material-detail-description">{selected.description}</p><p className="mt-2 text-[11px] leading-5 text-amber-100/70" data-testid="material-property-basis">{selected.property_basis}</p><a href={selected.source_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-sky-200 underline underline-offset-4 transition-colors hover:text-white" data-testid="material-source-link">Reference / background <ExternalLink size={11} /></a></div>}
      </CardContent></Card>
    </div>
    <Card className="workspace-card" data-testid="heat-balance-settings-card"><CardHeader><CardTitle className="flex items-center gap-2 font-heading text-xl" data-testid="heat-balance-settings-title"><Settings2 size={18} className="text-sky-300" /> Heat-balance assumptions</CardTitle><CardDescription data-testid="heat-balance-settings-description">Editable scenario settings. Use measured values when available; blank ground/initial temperatures use the stated defaults.</CardDescription></CardHeader><CardContent>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {([
          ["air_changes_per_hour", "Air exchange", "ACH", 0, 10],
          ["glazing_u_value", "Opening U-value", "W/m²K", .001, 10],
          ["solar_heat_gain_coefficient", "Glazing solar gain coefficient", "0–1", 0, 1],
          ["floor_u_value", "Floor U-value", "W/m²K", .001, 10],
          ["internal_gains_w", "Internal sensible gains", "W", 0, 10000],
          ["thermal_bridge_w_k", "Additional bridge conductance", "W/K", 0, 1000],
          ["solar_absorptance", "Opaque solar absorptance", "0–1", 0, 1],
        ] as const).map(([key, label, unit, min, max]) => <PropertyInput key={key} id={`physics-${key.replaceAll("_", "-")}`} label={label} unit={unit} min={min} max={max} value={physics[key]} onChange={value => updatePhysics(key, value ?? 0)} />)}
        <PropertyInput id="physics-ground-temperature" label="Ground temperature" unit="°C" min={-80} max={60} value={physics.ground_temperature_c} fallback={(inputs.ambient_day + inputs.ambient_night) / 2} onChange={value => updatePhysics("ground_temperature_c", value)} />
        <PropertyInput id="physics-initial-temperature" label="Initial inside temperature" unit="°C" min={-80} max={60} value={physics.initial_temperature_c} fallback={inputs.ambient_night} onChange={value => updatePhysics("initial_temperature_c", value)} />
      </div>
      <p className="mt-5 text-xs leading-6 text-slate-500" data-testid="heat-balance-input-warning">Zero bridge conductance excludes bridges; zero internal gains means no occupants/equipment heat. ACH is a scenario input, not inferred from the current wind reading. All openings are treated as glazing. Choosing insulation alone does not create a structurally buildable wall.</p>
    </CardContent></Card>
  </div>;
}