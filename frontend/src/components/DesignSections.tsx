import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Box, Compass, Layers3, Ruler, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnalysisRequest, UpdateAnalysisInput } from "@/lib/thermal-types";

interface DesignProps {
  inputs: AnalysisRequest;
  onChange: UpdateAnalysisInput;
  onNext: () => void;
}

function NumberField({ id, label, value, unit, min, max, onChange }: {
  id: string; label: string; value: number; unit: string; min?: number; max?: number; onChange: (value: number) => void;
}) {
  return <div>
    <Label htmlFor={id} className="mb-2 text-xs text-slate-300" data-testid={`${id}-label`}>{label}</Label>
    <div className="relative"><Input id={id} type="number" min={min} max={max} step="0.1" value={value} onChange={event => onChange(Number(event.target.value))} className="h-12 border-white/15 bg-white/[.025] pr-16 font-mono text-base invalid:border-rose-400/60" data-testid={id} /><span className="pointer-events-none absolute right-3 top-4 text-[10px] text-slate-400" data-testid={`${id}-unit`}>{unit}</span></div>
  </div>;
}

function Readout({ id, label, value }: { id: string; label: string; value: string }) {
  return <div className="border-l border-sky-300/20 pl-4"><p className="text-[10px] uppercase tracking-[.12em] text-slate-400" data-testid={`${id}-label`}>{label}</p><p className="mt-2 font-mono text-xl text-sky-100" data-testid={id}>{value}</p></div>;
}

export function GeometrySection({ inputs, onChange, onNext }: DesignProps) {
  const { length, width, height } = inputs.dimensions;
  const reducedMotion = useReducedMotion();
  // Orthographic projection uses the entered proportions, normalised to fit the canvas.
  const scale = 240 / Math.max(length + width, height * 1.7, 1);
  const project = (x: number, y: number, z: number) => `${290 + (x - y) * scale},${205 + (x + y) * scale * .38 - z * scale}`;
  const face = (points: number[][]) => points.map(([x, y, z]) => project(x, y, z)).join(" ");
  const front = face([[0, 0, 0], [length, 0, 0], [length, 0, height], [0, 0, height]]);
  const side = face([[0, 0, 0], [0, width, 0], [0, width, height], [0, 0, height]]);
  const roof = face([[0, 0, height], [length, 0, height], [length, width, height], [0, width, height]]);
  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(360px,.85fr)_minmax(0,1.3fr)]" data-testid="geometry-section">
    <Card className="workspace-card" data-testid="geometry-input-card"><CardHeader><CardTitle className="flex items-center gap-2 font-heading text-xl" data-testid="geometry-input-title"><Ruler size={19} className="text-orange-300" /> Size the shelter</CardTitle><CardDescription data-testid="geometry-input-description">Define a rectangular shelter. Every dimension feeds the thermal model.</CardDescription></CardHeader><CardContent className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">{([['length', 'Length', 30], ['width', 'Width', 30], ['height', 'Height', 15]] as const).map(([key, label, max]) => <NumberField key={key} id={`dimension-${key}-input`} label={label} value={inputs.dimensions[key]} unit="m" min={0.1} max={max} onChange={value => onChange("dimensions", { ...inputs.dimensions, [key]: value })} />)}</div>
      <p className="text-[11px] text-slate-500" data-testid="geometry-dimension-limits">Length & width: up to 30 m · Height: up to 15 m</p>
      <div className="border-t border-white/10 pt-5"><div className="mb-4 flex items-center justify-between"><Label htmlFor="opening-area" className="text-sm text-slate-300" data-testid="opening-area-label">Total opening area</Label><span className="font-mono text-orange-200" data-testid="opening-area-value">{inputs.opening_area.toFixed(1)} m²</span></div><input id="opening-area" type="range" min="0" max="100" step="0.1" value={inputs.opening_area} onChange={event => onChange("opening_area", Number(event.target.value))} className="control-range" data-testid="opening-area-slider" /><p className="mt-3 text-xs leading-6 text-slate-400" data-testid="opening-area-description">Combined openings influence both solar capture and heat leakage. Keep them proportionate to the wall area.</p></div>
      <Button onClick={onNext} className="h-11 w-full bg-orange-500 text-white hover:bg-orange-400" data-testid="geometry-next-button">Next: Solar & climate <ArrowRight size={15} /></Button>
    </CardContent></Card>
    <Card className="workspace-card overflow-hidden" data-testid="shelter-preview-card"><CardHeader className="flex-row items-center justify-between"><div><CardDescription className="font-mono text-[10px] uppercase tracking-[.17em]" data-testid="geometry-preview-eyebrow">Envelope / live proportions</CardDescription><CardTitle className="mt-2 font-heading text-xl" data-testid="geometry-preview-title">Your shelter, taking shape.</CardTitle></div><Box className="text-sky-300" size={21} /></CardHeader><CardContent>
      <div className="blueprint-surface overflow-hidden rounded-xl border border-sky-300/10">
        <svg viewBox="0 0 650 360" className="w-full" role="img" aria-label={`Rectangular shelter ${length} by ${width} by ${height} metres`} data-testid="shelter-geometry-preview">
          <path d="M60 305 H590 M325 30 V335" stroke="#203649" strokeDasharray="3 6" />
          <motion.g animate={reducedMotion ? {} : { y: [0, -4, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>
            <polygon points={side} fill="#102736" stroke="#6fabc1" strokeWidth="1.4" />
            <polygon points={front} fill="#173647" stroke="#6fabc1" strokeWidth="1.4" />
            <polygon points={roof} fill="#29424b" stroke="#fdba74" strokeWidth="1.5" />
          </motion.g>
          <text x="30" y="32" fill="#5e8798" fontFamily="monospace" fontSize="10" data-testid="geometry-preview-projection">ISOMETRIC / RECTANGULAR ENVELOPE</text>
          <text x="30" y="340" fill="#b8d4df" fontFamily="monospace" fontSize="12" data-testid="geometry-preview-dimensions">L {length} m   ×   W {width} m   ×   H {height} m</text>
        </svg>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3"><Readout id="geometry-floor-area" label="Floor footprint" value={`${(length * width).toFixed(1)} m²`} /><Readout id="geometry-volume" label="Internal volume" value={`${(length * width * height).toFixed(1)} m³`} /><Readout id="geometry-wall-area" label="Gross wall area" value={`${(2 * (length + width) * height).toFixed(1)} m²`} /></div>
      <p className="mt-5 text-[11px] leading-5 text-slate-500" data-testid="geometry-preview-note">Proportion study only, not a construction drawing. Openings are represented in the calculation, not individually drawn.</p>
    </CardContent></Card>
  </div>;
}

export function SolarSection({ inputs, onChange, onNext, children }: DesignProps & { children: ReactNode }) {
  const degrees = { north: 0, east: 90, "south-east": 135, south: 180, west: 270 }[inputs.orientation];
  const reducedMotion = useReducedMotion();
  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]" data-testid="solar-section">
    <Card className="workspace-card" data-testid="solar-input-card"><CardHeader><CardTitle className="flex items-center gap-2 font-heading text-xl" data-testid="solar-input-title"><Sun size={19} className="text-orange-300" /> Work with the sun</CardTitle><CardDescription data-testid="solar-input-description">Set solar exposure and the ambient day/night cycle used in your simulation.</CardDescription></CardHeader><CardContent className="space-y-6">
      <div className="grid items-center gap-7 md:grid-cols-[1fr_190px]"><div><Label htmlFor="orientation" className="mb-3 text-xs text-slate-300" data-testid="orientation-label">Solar-facing orientation</Label><select id="orientation" value={inputs.orientation} onChange={event => onChange("orientation", event.target.value as AnalysisRequest["orientation"])} className="control-select" data-testid="orientation-select"><option value="south">South · full winter gain</option><option value="south-east">South-east · balanced</option><option value="east">East · morning gain</option><option value="west">West · evening gain</option><option value="north">North · low gain</option></select><p className="mt-3 text-xs leading-6 text-slate-400" data-testid="orientation-description">Orientation changes the model’s solar gain factor. South-facing exposure is favoured for Ladakh winter studies.</p></div>
      <div className="relative mx-auto flex h-44 w-44 items-center justify-center rounded-full border border-sky-300/20 bg-sky-300/[.025]" role="img" aria-label={`Orientation compass: ${inputs.orientation}`} data-testid="orientation-compass"><div className="absolute inset-5 rounded-full border border-dashed border-sky-300/15" /><span className="absolute top-2 text-xs text-slate-400" data-testid="compass-north">N</span><span className="absolute bottom-2 text-xs text-slate-400" data-testid="compass-south">S</span><span className="absolute left-3 text-xs text-slate-400" data-testid="compass-west">W</span><span className="absolute right-3 text-xs text-slate-400" data-testid="compass-east">E</span><motion.div animate={{ rotate: degrees }} transition={{ duration: reducedMotion ? 0 : .5 }} className="absolute h-28 w-4"><div className="mx-auto h-12 w-0.5 bg-orange-300" /><div className="absolute -top-1 left-0 h-0 w-0 border-x-8 border-b-[14px] border-x-transparent border-b-orange-300" /></motion.div><div className="z-10 flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/20 bg-[#0c1720]"><Compass size={18} className="text-sky-200" /></div></div></div>
      <div className="grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-2"><NumberField id="solar-irradiance-input" label="Daily solar irradiation" value={inputs.solar_irradiance} unit="kWh/m²" min={0.1} max={12} onChange={value => onChange("solar_irradiance", value)} /><NumberField id="sunshine-hours-input" label="Sunshine duration / day" value={inputs.sunshine_hours} unit="hours" min={0.1} max={24} onChange={value => onChange("sunshine_hours", value)} /><NumberField id="ambient-day-input" label="Day ambient temperature" value={inputs.ambient_day} unit="°C" onChange={value => onChange("ambient_day", value)} /><NumberField id="ambient-night-input" label="Night ambient temperature" value={inputs.ambient_night} unit="°C" onChange={value => onChange("ambient_night", value)} /></div>
      <p className="rounded-xl border border-orange-300/10 bg-orange-300/5 p-3 text-xs leading-6 text-slate-400" data-testid="solar-model-context">These are scenario inputs, not live measurements. Changing location restores that area’s climate preset; use the weather series or your collected data to replace it.</p>
      <Button onClick={onNext} className="h-11 w-full bg-orange-500 text-white hover:bg-orange-400" data-testid="solar-next-button">Next: Materials <ArrowRight size={15} /></Button>
    </CardContent></Card>
    <div className="space-y-5" data-testid="solar-weather-tools">{children}<Card className="workspace-card" data-testid="solar-handoff-card"><CardContent className="pt-5"><p className="font-heading text-lg" data-testid="solar-handoff-title">One sky. Different envelopes.</p><p className="mt-2 text-xs leading-6 text-slate-400" data-testid="solar-handoff-description">The analysis compares material assemblies under these same conditions. Keep the sky fixed to isolate the effect of your shelter choices.</p></CardContent></Card></div>
  </div>;
}

const MATERIALS = [
  ["rammed-earth", "Rammed earth", "Dense earth construction with substantial thermal storage."],
  ["stone-mud", "Stone + mud mortar", "Traditional masonry; insulation remains an important consideration."],
  ["insulated-panel", "Insulated composite", "A lightweight insulated assembly for limiting heat transfer."],
  ["adobe", "Adobe block", "Earthen blocks with thermal mass for day-to-night buffering."],
  ["straw-clay", "Straw-clay composite", "Plant fibre and clay combine insulation and some heat storage."],
] as const;

export function MaterialsSection({ inputs, onChange, onNext }: DesignProps) {
  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,.75fr)_minmax(0,1.25fr)]" data-testid="materials-section">
    <Card className="workspace-card" data-testid="materials-input-card"><CardHeader><CardTitle className="flex items-center gap-2 font-heading text-xl" data-testid="materials-input-title"><Layers3 size={19} className="text-orange-300" /> Build the envelope</CardTitle><CardDescription data-testid="materials-input-description">Choose the wall, roof, and heat-storage strategy.</CardDescription></CardHeader><CardContent className="space-y-6">
      {([['wall_material', 'Wall material', 'wall-material-select'], ['roof_material', 'Roof assembly', 'roof-material-select']] as const).map(([key, label, id]) => <div key={key}><Label htmlFor={id} className="mb-3 text-xs text-slate-300" data-testid={`${id}-label`}>{label}</Label><select id={id} value={inputs[key]} onChange={event => onChange(key, event.target.value)} className="control-select" data-testid={id}>{MATERIALS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div>)}
      <div className="border-t border-white/10 pt-5"><p className="mb-3 text-xs text-slate-300" data-testid="thermal-mass-label">Thermal mass / storage</p><div className="grid grid-cols-3 gap-2">{(["low", "medium", "high"] as const).map(mass => <button key={mass} type="button" aria-pressed={inputs.thermal_mass === mass} onClick={() => onChange("thermal_mass", mass)} className={`mass-button py-3 ${inputs.thermal_mass === mass ? "mass-button-active" : ""}`} data-testid={`thermal-mass-${mass}-button`}>{mass}</button>)}</div><p className="mt-3 text-xs leading-6 text-slate-400" data-testid="thermal-mass-description">Higher thermal mass slows temperature changes; it does not replace insulation.</p></div>
      <Button onClick={onNext} className="h-11 w-full bg-orange-500 text-white hover:bg-orange-400" data-testid="materials-next-button">Next: Analysis <ArrowRight size={15} /></Button>
    </CardContent></Card>
    <Card className="workspace-card" data-testid="material-guide-card"><CardHeader><CardDescription className="font-mono text-[10px] uppercase tracking-[.16em]" data-testid="material-guide-eyebrow">Material field notes</CardDescription><CardTitle className="font-heading text-xl" data-testid="material-guide-title">Different layers. Different roles.</CardTitle></CardHeader><CardContent><div className="divide-y divide-white/10">{MATERIALS.map(([id, name, description]) => <div key={id} className="flex flex-col justify-between gap-3 py-4 first:pt-0 sm:flex-row sm:items-center" data-testid={`material-guide-${id}`}><div><p className="text-sm text-slate-200" data-testid={`material-name-${id}`}>{name}</p><p className="mt-1 text-xs leading-6 text-slate-400" data-testid={`material-description-${id}`}>{description}</p></div><div className="flex gap-2">{inputs.wall_material === id && <span className="rounded-full border border-orange-300/20 px-2 py-1 text-[10px] text-orange-200" data-testid={`material-wall-badge-${id}`}>Wall</span>}{inputs.roof_material === id && <span className="rounded-full border border-sky-300/20 px-2 py-1 text-[10px] text-sky-200" data-testid={`material-roof-badge-${id}`}>Roof</span>}</div></div>)}</div></CardContent></Card>
  </div>;
}