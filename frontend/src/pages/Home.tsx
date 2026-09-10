import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpRight,
  Bookmark,
  Building2,
  ChevronRight,
  CloudSun,
  Compass,
  Database,
  Download,
  Gauge,
  Mountain,
  Play,
  RefreshCw,
  Save,
  Snowflake,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts";

interface ShelterDimensions {
  length: number;
  width: number;
  height: number;
}

interface AnalysisRequest {
  location: string;
  ambient_day: number;
  ambient_night: number;
  solar_irradiance: number;
  sunshine_hours: number;
  dimensions: ShelterDimensions;
  orientation: "south" | "south-east" | "east" | "west" | "north";
  opening_area: number;
  wall_material: string;
  roof_material: string;
  thermal_mass: "low" | "medium" | "high";
  duration_hours: number;
}

interface ChartPoint {
  hour: number;
  label: string;
  ambient_temp: number;
  inside_temp: number;
  solar_gain: number;
  heat_loss: number;
}

interface HeatFlow {
  name: string;
  value: number;
  color: string;
}

interface ScenarioResult {
  name: string;
  wall_material: string;
  roof_material: string;
  inside_temp: number;
  heat_loss: number;
  comfort_hours: number;
  score: number;
  note: string;
}

interface AnalysisResult {
  id: string;
  created_at: string;
  inputs: AnalysisRequest;
  average_inside_temp: number;
  current_inside_temp: number;
  solar_energy_kwh: number;
  heat_loss_kwh: number;
  comfort_hours: number;
  comfort_target: string;
  efficiency_score: number;
  chart_data: ChartPoint[];
  heat_flows: HeatFlow[];
  scenarios: ScenarioResult[];
  recommendation: string;
  recommendation_detail: string;
}

interface SavedAnalysis {
  id: string;
  name: string;
  created_at: string;
  result: AnalysisResult;
}

interface LocationPreset {
  label: string;
  altitude: string;
  day: number;
  night: number;
  solar: number;
  sunshine: number;
  descriptor: string;
}

const LOCATION_PRESETS: Record<string, LocationPreset> = {
  Leh: { label: "Leh", altitude: "3,500 m", day: 6, night: -14, solar: 5.8, sunshine: 7.9, descriptor: "Cold desert / clear winter sky" },
  Kargil: { label: "Kargil", altitude: "2,676 m", day: 8, night: -9, solar: 5.4, sunshine: 7.3, descriptor: "Sheltered valley / strong diurnal swing" },
  "Nubra Valley": { label: "Nubra Valley", altitude: "3,048 m", day: 9, night: -12, solar: 5.9, sunshine: 8.2, descriptor: "High valley / intense solar gain" },
  Pangong: { label: "Pangong", altitude: "4,350 m", day: 3, night: -19, solar: 6.1, sunshine: 8.5, descriptor: "Extreme altitude / severe night loss" },
};

const MATERIAL_LABELS: Record<string, string> = {
  "rammed-earth": "Rammed earth",
  "stone-mud": "Stone + mud mortar",
  "insulated-panel": "Insulated composite",
  adobe: "Adobe block",
  "straw-clay": "Straw-clay composite",
};

const defaultInputs: AnalysisRequest = {
  location: "Leh",
  ambient_day: 6,
  ambient_night: -14,
  solar_irradiance: 5.8,
  sunshine_hours: 7.9,
  dimensions: { length: 6, width: 4, height: 2.7 },
  orientation: "south",
  opening_area: 2.4,
  wall_material: "rammed-earth",
  roof_material: "insulated-panel",
  thermal_mass: "high",
  duration_hours: 24,
};

const mountainImage = "https://images.unsplash.com/photo-1620473488753-f74e93e4e22f?crop=entropy&cs=srgb&fm=jpg&q=85";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-300" data-testid={`field-label-${String(children).toLowerCase().replaceAll(" ", "-")}`}>{children}</label>
      {hint && <span className="font-mono text-[10px] text-slate-500" data-testid={`field-hint-${String(children).toLowerCase().replaceAll(" ", "-")}`}>{hint}</span>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, unit, tone }: { icon: LucideIcon; label: string; value: string; unit?: string; tone: "orange" | "blue" | "red" | "green" }) {
  const tones = { orange: "text-orange-300 bg-orange-400/10 border-orange-300/20", blue: "text-sky-300 bg-sky-400/10 border-sky-300/20", red: "text-rose-300 bg-rose-400/10 border-rose-300/20", green: "text-emerald-300 bg-emerald-400/10 border-emerald-300/20" };
  return (
    <motion.div whileHover={{ y: -3 }} className="group rounded-2xl border border-white/10 bg-[#0c1118]/80 p-4 shadow-[0_18px_55px_rgba(0,0,0,.25)] backdrop-blur-xl" data-testid={`metric-card-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="flex items-start justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tones[tone]}`} data-testid={`metric-icon-${label.toLowerCase().replaceAll(" ", "-")}`}><Icon size={17} /></span>
        <ArrowUpRight size={14} className="text-slate-600 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500" data-testid={`metric-label-${label.toLowerCase().replaceAll(" ", "-")}`}>{label}</p>
      <p className="mt-1 font-mono text-2xl font-medium tracking-tight text-slate-100" data-testid={`metric-value-${label.toLowerCase().replaceAll(" ", "-")}`}>{value}<span className="ml-1 text-sm text-slate-500">{unit}</span></p>
    </motion.div>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const [inputs, setInputs] = useState<AnalysisRequest>(defaultInputs);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saveName, setSaveName] = useState("Leh winter baseline");

  const savedQuery = useQuery({ queryKey: ["analyses"], queryFn: () => apiGet<SavedAnalysis[]>("/analyses"), retry: false });
  const analyzeMutation = useMutation({
    mutationFn: (payload: AnalysisRequest) => apiPost<AnalysisResult>("/analyze", payload),
    onSuccess: (data) => { setResult(data); toast.success("Simulation complete", { description: "Thermal response updated for the current shelter inputs." }); },
    onError: () => toast.error("Simulation unavailable", { description: "Check the API connection and try again." }),
  });
  const saveMutation = useMutation({
    mutationFn: (payload: { name: string; result: AnalysisResult }) => apiPost<SavedAnalysis>("/analyses", payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analyses"] }); toast.success("Analysis saved to workspace"); },
    onError: () => toast.error("Could not save this run"),
  });

  const location = LOCATION_PRESETS[inputs.location];
  const chartData = useMemo(() => result?.chart_data ?? [], [result]);
  const updateInput = <K extends keyof AnalysisRequest>(key: K, value: AnalysisRequest[K]) => setInputs((current) => ({ ...current, [key]: value }));
  const updateDimension = (key: keyof ShelterDimensions, value: number) => setInputs((current) => ({ ...current, dimensions: { ...current.dimensions, [key]: value } }));
  const chooseLocation = (value: string) => {
    const preset = LOCATION_PRESETS[value];
    setInputs((current) => ({ ...current, location: value, ambient_day: preset.day, ambient_night: preset.night, solar_irradiance: preset.solar, sunshine_hours: preset.sunshine }));
    setSaveName(`${value} winter baseline`);
  };
  const runAnalysis = () => analyzeMutation.mutate(inputs);
  const loadRun = (saved: SavedAnalysis) => { setInputs(saved.result.inputs); setResult(saved.result); setSaveName(saved.name); toast.success(`Loaded ${saved.name}`); };

  return (
    <div className="min-h-screen overflow-hidden bg-[#05070a] text-slate-100">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div className="absolute -inset-8 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${mountainImage})` }} animate={{ scale: [1.04, 1.1, 1.04], x: [0, -10, 0] }} transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }} />
        <div className="absolute inset-0 bg-[#05070a]/75" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_16%,rgba(14,165,233,.12),transparent_36%),radial-gradient(circle_at_18%_32%,rgba(249,115,22,.08),transparent_30%)]" />
        <div className="snow-field absolute inset-0 opacity-50" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-[#080b10]/80 backdrop-blur-2xl" data-testid="app-header">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3" data-testid="brand-lockup">
            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-orange-300/30 bg-orange-400/10 text-orange-300"><Mountain size={20} /><span className="absolute bottom-1 h-px w-6 bg-orange-300/60" /></div>
            <div><p className="font-heading text-sm font-semibold tracking-tight text-slate-100" data-testid="brand-name">THERMAL ATLAS</p><p className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-500" data-testid="brand-subtitle">Ladakh shelter lab / v1.0</p></div>
          </div>
          <div className="hidden items-center gap-5 md:flex" data-testid="header-status">
            <div className="flex items-center gap-2 text-[11px] text-slate-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> model engine online</div>
            <div className="h-4 w-px bg-white/10" />
            <div className="font-mono text-[10px] text-slate-500">UTC+05:30 / winter study</div>
          </div>
          <Button variant="outline" size="sm" onClick={runAnalysis} disabled={analyzeMutation.isPending} data-testid="header-run-analysis-button" className="border-orange-300/30 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20">
            {analyzeMutation.isPending ? <RefreshCw className="mr-2 animate-spin" size={14} /> : <Play className="mr-2 fill-current" size={13} />} Run model
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1600px] px-5 pb-12 pt-8 lg:px-8">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }} className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end" data-testid="hero-section">
          <div className="max-w-3xl"><div className="mb-3 flex items-center gap-2"><Badge variant="outline" className="border-sky-300/25 bg-sky-400/10 text-sky-300" data-testid="simulation-badge"><Activity size={12} className="mr-1.5" /> passive thermal simulation</Badge><span className="font-mono text-[10px] text-slate-500" data-testid="model-version">SOLVER / 0.4.2</span></div><h1 className="font-heading text-4xl font-semibold tracking-[-0.045em] text-slate-50 md:text-6xl" data-testid="page-title">Find the calm<br /><span className="text-orange-300">inside the cold.</span></h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400" data-testid="page-description">A decision workspace for area-specific shelter design in the high-altitude cold desert. Shape the envelope, capture the sun, and see exactly where your thermal budget goes.</p></div>
          <div className="min-w-[235px] rounded-2xl border border-white/10 bg-[#0c1118]/75 p-4 backdrop-blur-xl" data-testid="location-summary"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500" data-testid="location-summary-label">active climate profile</span><CloudSun size={16} className="text-sky-300" /></div><p className="font-heading text-xl text-slate-100" data-testid="active-location-name">{location.label}<span className="ml-2 text-xs font-normal text-slate-500">{location.altitude}</span></p><p className="mt-1 text-xs text-slate-400" data-testid="active-location-description">{location.descriptor}</p></div>
        </motion.section>

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <motion.aside initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .55, delay: .08 }} className="h-fit rounded-2xl border border-white/10 bg-[#0b1016]/90 p-5 shadow-[0_25px_70px_rgba(0,0,0,.25)] backdrop-blur-2xl xl:sticky xl:top-5" data-testid="simulation-controls-panel">
            <div className="mb-5 flex items-start justify-between"><div><p className="font-heading text-lg font-medium" data-testid="controls-title">Simulation controls</p><p className="mt-1 text-xs text-slate-500" data-testid="controls-description">Define the shelter + sky.</p></div><div className="rounded-lg border border-white/10 p-2 text-slate-400"><Gauge size={16} /></div></div>
            <div className="space-y-5">
              <div><FieldLabel hint="preset">climate location</FieldLabel><select value={inputs.location} onChange={(event) => chooseLocation(event.target.value)} className="control-select" data-testid="climate-location-select"><option value="Leh">Leh · 3,500 m</option><option value="Kargil">Kargil · 2,676 m</option><option value="Nubra Valley">Nubra Valley · 3,048 m</option><option value="Pangong">Pangong · 4,350 m</option></select><div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-500"><span data-testid="ambient-range">{inputs.ambient_night}°C night → {inputs.ambient_day}°C day</span><span data-testid="solar-value">{inputs.solar_irradiance} kWh/m²/day</span></div></div>
              <div className="border-t border-white/10 pt-5"><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-slate-400"><Building2 size={14} className="text-orange-300" /> shelter geometry</div><div className="grid grid-cols-3 gap-2">{([['length', 'L', 'm'], ['width', 'W', 'm'], ['height', 'H', 'm']] as const).map(([key, label, unit]) => <div key={key}><FieldLabel>{label}</FieldLabel><div className="relative"><input type="number" min="1" max="30" step="0.1" value={inputs.dimensions[key]} onChange={(event) => updateDimension(key, Number(event.target.value))} className="control-input pr-7" data-testid={`dimension-${key}-input`} /><span className="absolute right-2 top-2.5 font-mono text-[10px] text-slate-500">{unit}</span></div></div>)}</div><div className="mt-4"><FieldLabel hint={`${inputs.opening_area.toFixed(1)} m²`}>opening area</FieldLabel><input type="range" min="0" max="12" step="0.1" value={inputs.opening_area} onChange={(event) => updateInput("opening_area", Number(event.target.value))} className="control-range" data-testid="opening-area-slider" /></div></div>
              <div className="border-t border-white/10 pt-5"><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-slate-400"><Compass size={14} className="text-sky-300" /> solar orientation</div><select value={inputs.orientation} onChange={(event) => updateInput("orientation", event.target.value as AnalysisRequest["orientation"])} className="control-select" data-testid="orientation-select"><option value="south">South · full winter gain</option><option value="south-east">South-east · balanced</option><option value="east">East · morning gain</option><option value="west">West · evening gain</option><option value="north">North · low gain</option></select></div>
              <div><FieldLabel>wall material</FieldLabel><select value={inputs.wall_material} onChange={(event) => updateInput("wall_material", event.target.value)} className="control-select" data-testid="wall-material-select"><option value="rammed-earth">Rammed earth</option><option value="stone-mud">Stone + mud mortar</option><option value="insulated-panel">Insulated composite</option><option value="adobe">Adobe block</option><option value="straw-clay">Straw-clay composite</option></select></div>
              <div><FieldLabel>roof assembly</FieldLabel><select value={inputs.roof_material} onChange={(event) => updateInput("roof_material", event.target.value)} className="control-select" data-testid="roof-material-select"><option value="rammed-earth">Rammed earth</option><option value="stone-mud">Stone + mud mortar</option><option value="insulated-panel">Insulated composite</option><option value="adobe">Adobe block</option><option value="straw-clay">Straw-clay composite</option></select></div>
              <div><FieldLabel hint="thermal inertia">thermal mass</FieldLabel><div className="grid grid-cols-3 gap-1.5">{(['low', 'medium', 'high'] as const).map((mass) => <button key={mass} type="button" onClick={() => updateInput("thermal_mass", mass)} className={`mass-button ${inputs.thermal_mass === mass ? "mass-button-active" : ""}`} data-testid={`thermal-mass-${mass}-button`}>{mass}</button>)}</div></div>
              <div><FieldLabel hint={`${inputs.duration_hours} hours`}>run duration</FieldLabel><input type="range" min="6" max="72" step="6" value={inputs.duration_hours} onChange={(event) => updateInput("duration_hours", Number(event.target.value))} className="control-range" data-testid="duration-slider" /><div className="mt-1 flex justify-between font-mono text-[9px] text-slate-600"><span data-testid="duration-start">6 h</span><span data-testid="duration-end">72 h</span></div></div>
              <Button onClick={runAnalysis} disabled={analyzeMutation.isPending} className="h-12 w-full bg-orange-500 font-semibold text-white shadow-[0_10px_30px_rgba(249,115,22,.18)] hover:bg-orange-400" data-testid="run-analysis-button">{analyzeMutation.isPending ? <RefreshCw size={16} className="mr-2 animate-spin" /> : <Play size={15} className="mr-2 fill-current" />} {analyzeMutation.isPending ? "Solving thermal field…" : "Run thermal analysis"}</Button>
            </div>
            <div className="mt-6 border-t border-white/10 pt-5" data-testid="saved-runs-panel"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500"><Bookmark size={13} /> recent runs</div><Database size={13} className="text-slate-600" /></div>{savedQuery.isError && <p className="text-xs text-slate-600" data-testid="saved-runs-error">Saved runs connect when the API is available.</p>}{savedQuery.data?.length === 0 && <p className="text-xs text-slate-600" data-testid="saved-runs-empty">Your saved analyses will appear here.</p>}{savedQuery.data?.slice(0, 4).map((saved) => <button key={saved.id} onClick={() => loadRun(saved)} className="group mb-2 flex w-full items-center justify-between rounded-lg border border-white/5 bg-white/[.025] px-3 py-2 text-left hover:border-sky-300/20 hover:bg-sky-300/[.05]" data-testid={`saved-run-${saved.id}`}><span className="min-w-0"><span className="block truncate text-xs text-slate-300">{saved.name}</span><span className="font-mono text-[9px] text-slate-600">{formatDate(saved.created_at)}</span></span><ChevronRight size={13} className="text-slate-600 transition-transform group-hover:translate-x-0.5" /></button>)}</div>
          </motion.aside>

          <section className="min-w-0" data-testid="results-workspace">
            {!result ? <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex min-h-[390px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#0b1016]/70 p-8 text-center backdrop-blur-xl" data-testid="empty-results-state"><div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-orange-300/20 bg-orange-400/10 text-orange-300"><Sun size={31} className="animate-[spin_12s_linear_infinite]" /><span className="absolute inset-1 rounded-full border border-dashed border-sky-300/25" /></div><p className="font-heading text-2xl" data-testid="empty-results-title">The shelter is waiting for its sky.</p><p className="mt-2 max-w-md text-sm leading-6 text-slate-500" data-testid="empty-results-description">Set a location and envelope on the left, then run the model to reveal temperature retention, solar yield, and heat-loss pathways.</p><Button variant="outline" onClick={runAnalysis} className="mt-6 border-orange-300/25 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20" data-testid="empty-run-analysis-button"><Play size={14} className="mr-2 fill-current" /> Run Leh baseline</Button></motion.div> : <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Thermometer} label="inside now" value={`${result.current_inside_temp.toFixed(1)}`} unit="°C" tone="orange" /><Metric icon={Sun} label="solar captured" value={`${result.solar_energy_kwh.toFixed(1)}`} unit="kWh" tone="blue" /><Metric icon={Wind} label="heat loss" value={`${result.heat_loss_kwh.toFixed(1)}`} unit="kWh" tone="red" /><Metric icon={Snowflake} label="comfort window" value={`${result.comfort_hours.toFixed(1)}`} unit="hrs" tone="green" /></div>
              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(270px,.7fr)]"><Card className="overflow-hidden border-white/10 bg-[#0b1016]/85 shadow-[0_25px_80px_rgba(0,0,0,.22)] backdrop-blur-xl" data-testid="temperature-chart-card"><CardHeader className="flex-row items-start justify-between border-b border-white/10 pb-4"><div><CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500" data-testid="temperature-chart-eyebrow">24 hour thermal response / {inputs.location}</CardDescription><CardTitle className="mt-2 font-heading text-xl font-medium" data-testid="temperature-chart-title">Inside vs ambient temperature</CardTitle></div><div className="flex gap-3 pt-1 text-[10px] text-slate-400"><span className="flex items-center gap-1.5" data-testid="chart-legend-inside"><i className="h-1.5 w-5 rounded-full bg-orange-400" /> inside</span><span className="flex items-center gap-1.5" data-testid="chart-legend-ambient"><i className="h-1.5 w-5 rounded-full bg-sky-400" /> ambient</span></div></CardHeader><CardContent className="pt-5"><div className="h-[300px] w-full" data-testid="temperature-line-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}><CartesianGrid stroke="rgba(148,163,184,.10)" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.max(Math.floor(chartData.length / 6), 1)} /><YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} unit="°" /><Tooltip contentStyle={{ background: "#101720", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: 11 }} labelStyle={{ color: "#94a3b8" }} /><Line type="monotone" dataKey="inside_temp" name="Inside" stroke="#fb923c" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: "#fb923c", stroke: "#0b1016", strokeWidth: 3 }} /><Line type="monotone" dataKey="ambient_temp" name="Ambient" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 5" dot={false} /></LineChart></ResponsiveContainer></div><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4"><span className="text-xs text-slate-500" data-testid="temperature-chart-caption">Comfort target <span className="font-mono text-slate-300">{result.comfort_target}</span></span><span className="font-mono text-xs text-orange-300" data-testid="average-temperature">avg {result.average_inside_temp.toFixed(1)}°C inside</span></div></CardContent></Card>
                <Card className="border-white/10 bg-[#0b1016]/85 shadow-[0_25px_80px_rgba(0,0,0,.22)] backdrop-blur-xl" data-testid="heat-flow-card"><CardHeader><CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500" data-testid="heat-flow-eyebrow">loss pathways / kWh</CardDescription><CardTitle className="mt-2 font-heading text-xl font-medium" data-testid="heat-flow-title">Heat flow analysis</CardTitle></CardHeader><CardContent><div className="space-y-5">{result.heat_flows.map((flow) => <div key={flow.name} data-testid={`heat-flow-row-${flow.name.toLowerCase().replaceAll(" ", "-")}`}><div className="mb-2 flex justify-between text-xs"><span className="text-slate-400">{flow.name}</span><span className="font-mono text-slate-200">{flow.value.toFixed(1)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[.06]"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (flow.value / Math.max(result.heat_loss_kwh, 1)) * 100)}%` }} transition={{ duration: .8, delay: .15 }} className="h-full rounded-full" style={{ backgroundColor: flow.color }} /></div></div>)}</div><div className="mt-8 rounded-xl border border-rose-300/15 bg-rose-400/[.06] p-3"><div className="flex gap-2"><Activity size={15} className="mt-0.5 shrink-0 text-rose-300" /><p className="text-xs leading-5 text-slate-400" data-testid="heat-flow-insight">Openings account for <span className="font-mono text-rose-200">{Math.round((result.heat_flows[1]?.value / Math.max(result.heat_loss_kwh, 1)) * 100)}%</span> of modeled loss. Consider an insulated vestibule or reduced glazing on the windward face.</p></div></div></CardContent></Card></div>
              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]"><Card className="border-white/10 bg-[#0b1016]/85 backdrop-blur-xl" data-testid="scenario-comparison-card"><CardHeader className="flex-row items-start justify-between"><div><CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500" data-testid="scenario-eyebrow">same sky / alternate envelope</CardDescription><CardTitle className="mt-2 font-heading text-xl font-medium" data-testid="scenario-title">Material scenarios</CardTitle></div><span className="rounded-full border border-white/10 px-2 py-1 font-mono text-[9px] text-slate-500" data-testid="scenario-count">{result.scenarios.length} cases</span></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-b border-white/10 text-[10px] uppercase tracking-[.12em] text-slate-600"><th className="pb-3 font-medium" data-testid="scenario-column-material">assembly</th><th className="pb-3 font-medium" data-testid="scenario-column-temp">end temp</th><th className="pb-3 font-medium" data-testid="scenario-column-loss">loss</th><th className="pb-3 text-right font-medium" data-testid="scenario-column-score">fit score</th></tr></thead><tbody>{result.scenarios.map((scenario, index) => <tr key={scenario.name} className="border-b border-white/[.06] last:border-0"><td className="py-4"><div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${index === 0 ? "bg-orange-300" : "bg-slate-600"}`} /><span className="text-slate-300">{scenario.name}</span></div><p className="mt-1 pl-3.5 text-[10px] text-slate-600">{scenario.note}</p></td><td className="py-4 font-mono text-orange-200">{scenario.inside_temp.toFixed(1)}°C</td><td className="py-4 font-mono text-slate-400">{scenario.heat_loss.toFixed(1)} kWh</td><td className="py-4 text-right"><span className={`rounded-full px-2 py-1 font-mono text-[10px] ${index === 0 ? "bg-orange-400/15 text-orange-200" : "bg-white/[.06] text-slate-400"}`}>{scenario.score}/100</span></td></tr>)}</tbody></table></div></CardContent></Card>
                <Card className="relative overflow-hidden border-orange-300/25 bg-[#17100d]/90 backdrop-blur-xl" data-testid="recommendation-card"><div className="pointer-events-none absolute right-[-45px] top-[-45px] h-36 w-36 rounded-full border border-orange-300/15" /><div className="pointer-events-none absolute right-[-25px] top-[-25px] h-24 w-24 rounded-full border border-orange-300/10" /><CardHeader><div className="mb-2 flex items-center gap-2 text-orange-300"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-400/15"><Gauge size={16} /></span><span className="font-mono text-[10px] uppercase tracking-[.15em]" data-testid="recommendation-label">atlas recommendation</span></div><CardTitle className="mt-2 max-w-xs font-heading text-2xl font-medium leading-tight" data-testid="recommendation-title">{result.recommendation}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-slate-400" data-testid="recommendation-detail">{result.recommendation_detail}</p><div className="mt-6 flex items-center justify-between border-t border-orange-300/15 pt-4"><span className="text-[10px] uppercase tracking-[.14em] text-slate-500" data-testid="efficiency-score-label">efficiency score</span><span className="font-mono text-2xl text-orange-200" data-testid="efficiency-score">{result.efficiency_score}<span className="text-sm text-orange-300/50"> / 100</span></span></div></CardContent></Card></div>
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b1016]/75 p-4 backdrop-blur-xl sm:flex-row sm:items-center" data-testid="save-analysis-bar"><div className="flex flex-1 items-center gap-3"><div className="hidden rounded-xl border border-sky-300/20 bg-sky-400/10 p-2 text-sky-300 sm:block"><Save size={16} /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-300" data-testid="save-analysis-title">Keep this thermal run</p><p className="mt-1 text-[11px] text-slate-500" data-testid="save-analysis-description">Save the current inputs and results for your design log.</p></div><input value={saveName} onChange={(event) => setSaveName(event.target.value)} className="control-input max-w-[190px]" aria-label="Analysis name" data-testid="analysis-name-input" /></div><Button variant="outline" disabled={saveMutation.isPending || !saveName.trim()} onClick={() => result && saveMutation.mutate({ name: saveName.trim(), result })} className="border-sky-300/25 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20" data-testid="save-analysis-button"><Bookmark size={14} className="mr-2" /> {saveMutation.isPending ? "Saving…" : "Save analysis"}</Button><Button variant="ghost" className="text-slate-500 hover:text-slate-200" onClick={() => toast.info("Export is ready for the next study pass")} data-testid="export-analysis-button"><Download size={14} className="mr-2" /> Export</Button></div>
            </>}
          </section>
        </div>
      </main>
      <footer className="relative z-10 border-t border-white/10 bg-[#080b10]/70" data-testid="app-footer"><div className="mx-auto flex max-w-[1600px] flex-col justify-between gap-2 px-5 py-4 text-[10px] text-slate-600 sm:flex-row lg:px-8"><span data-testid="footer-method">Model uses reduced-order transient thermal balance · not an ANSYS substitute</span><span className="font-mono" data-testid="footer-location">{inputs.location.toUpperCase()} / {inputs.duration_hours}H WINDOW / PASSIVE MODE</span></div></footer>
    </div>
  );
}