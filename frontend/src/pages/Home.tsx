import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpRight,
  Bookmark,
  Building2,
  LayoutDashboard,
  Layers3,
  ArrowRight,
  ChevronRight,
  CloudSun,
  Compass,
  Database,
  FileJson,
  FileSpreadsheet,
  FileText,
  Gauge,
  Mountain,
  MessageSquareText,
  Play,
  RefreshCw,
  Radio,
  Save,
  Snowflake,
  Sparkles,
  Sun,
  Thermometer,
  Upload,
  Wind,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiGet, apiPost, apiPostForm, apiPostStream } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CurrentWeather from "@/components/CurrentWeather";
import { GeometrySection, SolarSection, MaterialsSection } from "@/components/DesignSections";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { AnalysisRequest, AnalysisResult } from "@/lib/thermal-types";
import { physicsValid } from "@/lib/thermal-types";
import ThermalCharts, { ModelEvidence } from "@/components/ThermalCharts";
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

interface WeatherPoint {
  timestamp: string;
  temperature: number;
  solar_radiation_w_m2: number;
}

interface WeatherResponse {
  location: string;
  source: string;
  fetched_at: string;
  current_temperature: number;
  current_solar_radiation: number;
  ambient_day: number;
  ambient_night: number;
  solar_irradiance: number;
  points: WeatherPoint[];
}

type AiFocus = "review" | "explain" | "report";

interface AiStreamEvent {
  type: "delta" | "done" | "error";
  content?: string;
  review_id?: string;
  message?: string;
}

interface AiHistoryItem {
  id: string;
  created_at: string;
  focus: AiFocus;
  recommendation: string;
  response: string;
  model: string;
}

const LOCATION_PRESETS: Record<string, LocationPreset> = {
  Leh: { label: "Leh", altitude: "3,500 m", day: 6, night: -14, solar: 5.8, sunshine: 7.9, descriptor: "Cold desert / clear winter sky" },
  Kargil: { label: "Kargil", altitude: "2,676 m", day: 8, night: -9, solar: 5.4, sunshine: 7.3, descriptor: "Sheltered valley / strong diurnal swing" },
  "Nubra Valley": { label: "Nubra Valley", altitude: "3,048 m", day: 9, night: -12, solar: 5.9, sunshine: 8.2, descriptor: "High valley / intense solar gain" },
  Pangong: { label: "Pangong", altitude: "4,350 m", day: 3, night: -19, solar: 6.1, sunshine: 8.5, descriptor: "Extreme altitude / severe night loss" },
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
  physics: null,
};

const mountainImage = "https://images.unsplash.com/photo-1620473488753-f74e93e4e22f?crop=entropy&cs=srgb&fm=jpg&q=85";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  // Keep both anchor and Blob alive while the browser accepts the download.
  window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 10000);
}

function weatherCsv(weather: WeatherResponse) {
  const rows = [["timestamp", "temperature", "solar_radiation_w_m2"], ...weather.points.map((point) => [point.timestamp, point.temperature.toString(), point.solar_radiation_w_m2.toString()])];
  return rows.map((row) => row.join(",")).join("\n");
}

const WORKSPACE_TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, title: "A better shelter starts here.", description: "One workspace for Ladakh’s climate, your shelter design, and the thermal decisions that connect them." },
  { id: "geometry", label: "Shelter geometry", icon: Building2, title: "Give the shelter its shape.", description: "An open canvas for dimensions, openings, and the space you want to keep comfortable." },
  { id: "solar", label: "Solar & climate", icon: Sun, title: "Find your place in the sun.", description: "Set orientation, solar irradiation, and the climate conditions for your shelter study." },
  { id: "materials", label: "Materials", icon: Layers3, title: "Keep the warmth where it belongs.", description: "Tune the envelope with wall materials, roof assemblies, and thermal storage." },
  { id: "analysis", label: "Analysis", icon: Activity, title: "Follow the thermal story.", description: "Run the model, compare envelopes, review heat flows, and ask Claude about your design." },
  { id: "saved", label: "Saved runs", icon: Bookmark, title: "Your design fieldbook.", description: "Reopen a saved study to restore its shelter inputs, climate settings, and thermal results." },
] as const;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = WORKSPACE_TABS.find(tab => tab.id === searchParams.get("tab")) ?? WORKSPACE_TABS[0];
  const navigateTab = (tab: string) => { setSearchParams(current => { current.set("tab", tab); return current; }); window.scrollTo({ top: 0, behavior: "instant" }); };
  const [inputs, setInputs] = useState<AnalysisRequest>(defaultInputs);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saveName, setSaveName] = useState("Leh winter baseline");
  const [weatherOverride, setWeatherOverride] = useState<WeatherResponse | null>(null);
  const [aiFocus, setAiFocus] = useState<AiFocus>("review");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiReviewId, setAiReviewId] = useState("");

  const savedQuery = useQuery({ queryKey: ["analyses"], queryFn: () => apiGet<SavedAnalysis[]>("/analyses"), retry: false });
  const weatherQuery = useQuery({ queryKey: ["weather", inputs.location], queryFn: () => apiGet<WeatherResponse>(`/weather/live?location=${encodeURIComponent(inputs.location)}`), enabled: activeTab.id === "solar", refetchInterval: 900000, retry: false });
  const aiHistoryQuery = useQuery({ queryKey: ["ai-history"], queryFn: () => apiGet<AiHistoryItem[]>("/ai/history"), retry: false });
  const analyzeMutation = useMutation({
    mutationFn: (payload: AnalysisRequest) => apiPost<AnalysisResult>("/analyze", payload),
    onSuccess: (data) => { setResult(data); setAiResponse(""); setAiReviewId(""); setAiError(""); toast.success("Simulation complete", { description: "Thermal response updated for the current shelter inputs." }); },
    onError: () => toast.error("Simulation unavailable", { description: "Check the API connection and try again." }),
  });
  const saveMutation = useMutation({
    mutationFn: (payload: { name: string; result: AnalysisResult }) => apiPost<SavedAnalysis>("/analyses", payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analyses"] }); toast.success("Analysis saved to workspace"); },
    onError: () => toast.error("Could not save this run"),
  });
  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("location", inputs.location);
      return apiPostForm<WeatherResponse>(`/weather/import?location=${encodeURIComponent(inputs.location)}`, form);
    },
    onSuccess: (data) => {
      setWeatherOverride(data);
      setInputs((current) => ({ ...current, ambient_day: data.ambient_day, ambient_night: data.ambient_night, solar_irradiance: data.solar_irradiance }));
      toast.success("Measured weather loaded", { description: `${data.points.length} readings are now ready for the model.` });
    },
    onError: () => toast.error("CSV import failed", { description: "Use timestamp and temperature columns, plus optional solar radiation." }),
  });
  const sampleMutation = useMutation({
    mutationFn: () => apiGet<WeatherResponse>(`/weather/sample?location=${encodeURIComponent(inputs.location)}`),
    onSuccess: (data) => { downloadText(`${inputs.location.toLowerCase().replaceAll(" ", "-")}-weather-sample.csv`, weatherCsv(data), "text/csv;charset=utf-8"); toast.success("Historical sample downloaded"); },
    onError: () => toast.error("Historical sample unavailable", { description: "The public climate archive could not be reached." }),
  });
  const aiMutation = useMutation({
    mutationFn: async (payload: { analysis: AnalysisResult; focus: AiFocus; question: string }) => {
      setAiResponse("");
      setAiError("");
      setAiReviewId("");
      let streamFailed = false;
      await apiPostStream<AiStreamEvent>("/ai/review", payload, (event) => {
        if (event.type === "delta") setAiResponse((current) => current + (event.content ?? ""));
        if (event.type === "done") setAiReviewId(event.review_id ?? "");
        if (event.type === "error") { streamFailed = true; setAiError(event.message ?? "Claude could not complete the review."); }
      });
      if (streamFailed) throw new Error("Claude stream failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ai-history"] }); toast.success("Claude review ready"); },
    onError: () => { setAiError("Claude is unavailable right now. Your simulation results are still valid."); toast.error("Claude review unavailable"); },
  });

  const location = LOCATION_PRESETS[inputs.location];
  const liveWeather = weatherOverride?.location === inputs.location ? weatherOverride : weatherQuery.isError ? undefined : weatherQuery.data;
  const updateInput = <K extends keyof AnalysisRequest>(key: K, value: AnalysisRequest[K]) => setInputs((current) => ({ ...current, [key]: value }));
  const validInputs = inputs.dimensions.length > 0 && inputs.dimensions.length <= 30 && inputs.dimensions.width > 0 && inputs.dimensions.width <= 30 && inputs.dimensions.height > 0 && inputs.dimensions.height <= 15 && inputs.solar_irradiance > 0 && inputs.solar_irradiance <= 12 && inputs.sunshine_hours > 0 && inputs.sunshine_hours <= 24 && inputs.ambient_day >= inputs.ambient_night && inputs.ambient_day <= 60 && inputs.ambient_night >= -80 && inputs.opening_area <= 2 * (inputs.dimensions.length + inputs.dimensions.width) * inputs.dimensions.height && physicsValid(inputs.physics);
  const resultOutdated = result !== null && JSON.stringify(result.inputs) !== JSON.stringify(inputs);
  const chooseLocation = (value: string) => {
    const preset = LOCATION_PRESETS[value];
    setWeatherOverride(null);
    setInputs((current) => ({ ...current, location: value, ambient_day: preset.day, ambient_night: preset.night, solar_irradiance: preset.solar, sunshine_hours: preset.sunshine }));
    setSaveName(`${value} winter baseline`);
  };
  const runAnalysis = () => { if (!validInputs) { toast.error("Check the geometry and solar input limits before running."); return; } navigateTab("analysis"); analyzeMutation.mutate(inputs); };
  const loadRun = (saved: SavedAnalysis) => { setWeatherOverride(null); setInputs(saved.result.inputs); setResult(saved.result); setSaveName(saved.name); setAiResponse(""); setAiReviewId(""); setAiError(""); navigateTab("analysis"); toast.success(`Loaded ${saved.name}`); };
  const applyWeather = (weather: WeatherResponse) => {
    setInputs((current) => ({ ...current, ambient_day: weather.ambient_day, ambient_night: weather.ambient_night, solar_irradiance: weather.solar_irradiance }));
    toast.success("Weather series applied", { description: "Run the model using this series' day/night averages and solar estimate—not the current-weather snapshot." });
  };
  const exportCsv = () => {
    if (!result) return;
    const energyKeys = ["internal_in", "ambient_in", "walls_out", "roof_out", "floor_out", "openings_out", "ventilation_out", "bridges_out", "storage_change", "balance_error"] as const;
    const hasLedger = Boolean(result.model_info && result.energy_balance?.length);
    const rows = [["hour", "label", "ambient_temp_c", "inside_temp_c", "solar_gain_kwh", "heat_loss_kwh", ...(hasLedger ? energyKeys.map(key => `${key}_kwh`) : [])], ...result.chart_data.map((point, index) => [point.hour.toString(), point.label, point.ambient_temp.toString(), point.inside_temp.toString(), point.solar_gain.toString(), point.heat_loss.toString(), ...(hasLedger ? energyKeys.map(key => String(result.energy_balance?.[index]?.[key] ?? "")) : [])])];
    downloadText(`${result.inputs.location.toLowerCase().replaceAll(" ", "-")}-thermal-series.csv`, rows.map((row) => row.join(",")).join("\n"), "text/csv;charset=utf-8");
    toast.success("ANSYS thermal series exported");
  };
  const exportJson = () => {
    if (!result) return;
    downloadText(`${result.inputs.location.toLowerCase().replaceAll(" ", "-")}-ansys-parameters.json`, JSON.stringify({ schema: result.model_info ? "thermal-atlas-ansys-handoff-v2" : "thermal-atlas-ansys-handoff-v1", exported_at: new Date().toISOString(), inputs: result.inputs, metrics: { solar_energy_kwh: result.solar_energy_kwh, heat_loss_kwh: result.heat_loss_kwh, comfort_hours: result.comfort_hours }, chart_data: result.chart_data, scenarios: result.scenarios, ...(result.model_info ? { model_info: result.model_info, energy_balance: result.energy_balance, sensitivity: result.sensitivity } : {}) }, null, 2), "application/json;charset=utf-8");
    toast.success("ANSYS parameter package exported");
  };

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
          <Button variant="outline" size="sm" onClick={runAnalysis} disabled={analyzeMutation.isPending || aiMutation.isPending || !validInputs} data-testid="header-run-analysis-button" className="border-orange-300/30 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20">
            {analyzeMutation.isPending ? <RefreshCw className="mr-2 animate-spin" size={14} /> : <Play className="mr-2 fill-current" size={13} />} Run model
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto min-h-[calc(100vh-140px)] max-w-[1600px] px-5 pb-12 pt-5 lg:px-8">
        <Tabs value={activeTab.id} onValueChange={value => navigateTab(String(value))} className="gap-0">
          <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-white/10 bg-[#0b1119]/95 p-1.5" aria-label="Thermal Atlas workspace sections" data-testid="workspace-navigation">
            {WORKSPACE_TABS.map(tab => <TabsTrigger key={tab.id} value={tab.id} className="workspace-tab" data-active={activeTab.id === tab.id ? "" : undefined} data-testid={`workspace-tab-${tab.id}`}><tab.icon size={15} /><span data-testid={`workspace-tab-label-${tab.id}`}>{tab.label}</span></TabsTrigger>)}
          </TabsList>
          <div className="mb-7 flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-[#0b1118]/70 px-4 py-3 lg:flex-row lg:items-center" data-testid="workspace-context-bar">
            <div className="flex flex-wrap items-center gap-4"><div className="min-w-[175px]"><label htmlFor="workspace-location" className="mb-1.5 block text-[9px] uppercase tracking-[.16em] text-slate-400" data-testid="workspace-location-label">Study location / Ladakh</label><select id="workspace-location" value={inputs.location} onChange={event => chooseLocation(event.target.value)} className="control-select" data-testid="climate-location-select"><option value="Leh">Leh · 3,500 m</option><option value="Kargil">Kargil · 2,676 m</option><option value="Nubra Valley">Nubra Valley · 3,048 m</option><option value="Pangong">Pangong · 4,350 m</option></select></div><div className="hidden space-y-1 sm:block"><p className="font-mono text-[10px] text-slate-300" data-testid="ambient-range">{inputs.ambient_night}°C night → {inputs.ambient_day}°C day</p><p className="text-[10px] text-slate-500" data-testid="solar-value">{inputs.solar_irradiance} kWh/m²/day · {inputs.orientation} facing</p></div></div>
            <div className="flex flex-wrap items-center gap-5"><div className="min-w-[150px]"><label htmlFor="run-duration" className="mb-2 flex justify-between gap-4 text-[10px] text-slate-400" data-testid="duration-label">Simulation window <span className="font-mono text-sky-200" data-testid="duration-value">{inputs.duration_hours} h</span></label><input id="run-duration" type="range" min="6" max="168" step="6" value={inputs.duration_hours} onChange={event => updateInput("duration_hours", Number(event.target.value))} className="control-range" data-testid="duration-slider" /></div><span className={`rounded-full border px-3 py-1.5 text-[10px] ${result && !resultOutdated ? "border-emerald-300/20 text-emerald-200" : "border-orange-300/20 text-orange-200"}`} data-testid="workspace-design-status">{analyzeMutation.isPending ? "Model running…" : result ? resultOutdated ? "Draft changed · rerun needed" : "Results match this design" : "Draft design · ready to configure"}</span></div>
          </div>
          {!validInputs && <p role="alert" className="mb-5 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-sm text-rose-200" data-testid="workspace-validation-error">Check Geometry, Solar, and Materials limits. Openings cannot exceed wall area; temperatures must be −80 to 60 °C with day ≥ night. Positive dimensions, irradiation, thicknesses and U-values are required.</p>}
          <div key={activeTab.id} className="workspace-enter mb-7" data-testid="workspace-section-heading"><p className="mb-3 font-mono text-[10px] uppercase tracking-[.2em] text-orange-300" data-testid="workspace-section-eyebrow">Thermal Atlas / {activeTab.label}</p><h1 className="font-heading text-3xl font-medium tracking-[-.04em] text-slate-50 sm:text-4xl" data-testid="page-title">{activeTab.title}</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400" data-testid="page-description">{activeTab.description}</p></div>

          <TabsContent value="overview" className="workspace-enter mt-0" data-testid="workspace-panel-overview">
            <CurrentWeather location={inputs.location} />
            <div className="grid items-stretch gap-5 lg:grid-cols-[1.15fr_1fr]">
              <Card className="workspace-card relative overflow-hidden" data-testid="overview-design-card"><div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-15" style={{ backgroundImage: `url(${mountainImage})` }} /><CardContent className="relative flex h-full flex-col items-start py-7"><Badge variant="outline" className="border-orange-300/20 text-orange-200" data-testid="overview-design-badge">Passive shelter / {location.label}</Badge><h2 className="mt-6 max-w-sm font-heading text-3xl leading-tight" data-testid="overview-design-title">Small decisions.<br />Warmer nights.</h2><p className="mt-4 max-w-md text-sm leading-7 text-slate-400" data-testid="overview-design-description">Move through the dedicated design sections at your own pace. Your dimensions, materials, and climate settings stay connected.</p><div className="mt-6 flex flex-wrap gap-6"><div><p className="text-[10px] uppercase tracking-widest text-slate-500" data-testid="overview-footprint-label">Footprint</p><p className="mt-2 font-mono text-xl text-orange-100" data-testid="overview-footprint">{(inputs.dimensions.length * inputs.dimensions.width).toFixed(1)} m²</p></div><div><p className="text-[10px] uppercase tracking-widest text-slate-500" data-testid="overview-volume-label">Volume</p><p className="mt-2 font-mono text-xl text-sky-100" data-testid="overview-volume">{(inputs.dimensions.length * inputs.dimensions.width * inputs.dimensions.height).toFixed(1)} m³</p></div></div><Button onClick={() => navigateTab("geometry")} className="mt-7 bg-orange-500 text-white hover:bg-orange-400" data-testid="overview-start-design-button">Open shelter geometry <ArrowRight size={15} /></Button></CardContent></Card>
              <div className="space-y-3" data-testid="overview-workspace-shortcuts">{WORKSPACE_TABS.filter(tab => tab.id !== "overview").map((tab, index) => <button key={tab.id} type="button" onClick={() => navigateTab(tab.id)} className="group flex w-full items-center gap-4 rounded-xl border border-white/10 bg-[#0b1118]/90 px-5 py-4 text-left transition-colors hover:border-orange-300/25 hover:bg-[#15191d]" data-testid={`overview-open-${tab.id}`}><span className="font-mono text-[10px] text-slate-600" data-testid={`overview-step-${tab.id}`}>0{index + 1}</span><tab.icon size={19} className="shrink-0 text-sky-200" /><span className="flex-1"><span className="block font-heading text-sm text-slate-200" data-testid={`overview-shortcut-label-${tab.id}`}>{tab.label}</span><span className="mt-1 block text-[11px] leading-5 text-slate-500" data-testid={`overview-shortcut-description-${tab.id}`}>{tab.id === "geometry" ? "Dimensions, openings & spatial preview" : tab.id === "solar" ? "Orientation, solar exposure & weather data" : tab.id === "materials" ? "Walls, roof & thermal storage" : tab.id === "analysis" ? "Results, comparisons, Claude & ANSYS exports" : `${savedQuery.data?.length ?? 0} studies in your fieldbook`}</span></span><ArrowUpRight size={16} className="text-slate-500 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></button>)}</div>
            </div>
          </TabsContent>

          <TabsContent value="geometry" className="workspace-enter mt-0" data-testid="workspace-panel-geometry"><GeometrySection inputs={inputs} onChange={updateInput} onNext={() => navigateTab("solar")} /></TabsContent>
          <TabsContent value="materials" className="workspace-enter mt-0" data-testid="workspace-panel-materials"><MaterialsSection inputs={inputs} onChange={updateInput} onNext={() => navigateTab("analysis")} /></TabsContent>
          <TabsContent value="solar" className="workspace-enter mt-0" data-testid="workspace-panel-solar">
            <SolarSection inputs={inputs} onChange={updateInput} onNext={() => navigateTab("materials")}>
              <div className="rounded-xl border border-sky-300/15 bg-sky-400/[.06] p-3" data-testid="weather-data-panel">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.1em] text-sky-200" data-testid="weather-panel-title"><Radio size={13} className="shrink-0 text-sky-300" /> simulation weather series</div>
                  <span className="rounded-full bg-white/[.06] px-2 py-1 font-mono text-[9px] text-slate-300" data-testid="weather-connection-status">{weatherOverride?.location === inputs.location ? "imported" : weatherQuery.isFetching ? "syncing" : liveWeather ? liveWeather.source.toLowerCase().includes("archive") ? "archive" : "forecast" : "offline"}</span>
                </div>
                {liveWeather ? <>
                  <div className="grid grid-cols-2 gap-2">
                    <div><p className="text-[9px] uppercase tracking-[.12em] text-slate-500" data-testid="live-temperature-label">series start temp</p><p className="mt-1 font-mono text-lg text-slate-100" data-testid="live-temperature-value">{liveWeather.points[0]?.temperature.toFixed(1) ?? "—"}°C</p></div>
                    <div><p className="text-[9px] uppercase tracking-[.12em] text-slate-500" data-testid="live-solar-label">series start solar</p><p className="mt-1 font-mono text-lg text-orange-200" data-testid="live-solar-value">{liveWeather.points[0]?.solar_radiation_w_m2.toFixed(0) ?? "—"} <span className="text-[10px] text-slate-500" data-testid="series-solar-unit">W/m²</span></p></div>
                  </div>
                  <p className="mt-2 break-words font-mono text-[9px] text-slate-500" data-testid="weather-series-start">Series begins: {liveWeather.points[0]?.timestamp ?? "No readings"}</p>
                  <p className="mt-2 text-[10px] leading-5 text-slate-400" data-testid="weather-source">{liveWeather.source} · Retrieved {formatDate(liveWeather.fetched_at)}</p>
                  <Button variant="outline" size="sm" onClick={() => applyWeather(liveWeather)} className="mt-3 h-8 w-full border-sky-300/20 bg-sky-400/[.06] text-[11px] text-sky-200 hover:bg-sky-400/[.12]" data-testid="apply-weather-button"><CloudSun size={13} className="mr-1.5" /> Use series in model</Button>
                </> : <p className="text-xs leading-5 text-slate-500" data-testid="weather-offline-copy">Weather series unavailable. Built-in climate values remain ready for analysis.</p>}
                <p className="mt-2 text-[10px] leading-5 text-slate-500" data-testid="weather-series-context">Day/night simulation inputs, separate from the OpenWeatherMap current conditions below.</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => weatherQuery.refetch()} disabled={weatherQuery.isFetching} className="h-8 flex-1 px-2 text-[10px] text-slate-400 hover:text-sky-200" data-testid="refresh-live-weather-button"><RefreshCw size={12} className={`mr-1.5 ${weatherQuery.isFetching ? "animate-spin" : ""}`} /> Refresh series</Button>
                  <label className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center rounded-lg border border-white/10 px-2 text-[10px] text-slate-400 transition-colors hover:border-sky-300/20 hover:text-sky-200" data-testid="weather-csv-upload-label"><Upload size={12} className="mr-1.5" /> {importMutation.isPending ? "Importing…" : "Import CSV"}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) importMutation.mutate(file); event.currentTarget.value = ""; }} data-testid="weather-csv-file-input" /></label>
                </div>
                <Button variant="ghost" size="sm" onClick={() => sampleMutation.mutate()} disabled={sampleMutation.isPending} className="mt-1 h-7 w-full justify-start px-1 text-[10px] text-slate-500 hover:text-slate-300" data-testid="download-weather-sample-button"><FileSpreadsheet size={12} className="mr-1.5" /> {sampleMutation.isPending ? "Fetching historical sample…" : "Download 7-day climate sample CSV"}</Button>
              </div>
            </SolarSection>
            <div className="mt-6"><CurrentWeather location={inputs.location} /></div>
          </TabsContent>

          <TabsContent value="saved" className="workspace-enter mt-0" data-testid="workspace-panel-saved">
            <Card className="workspace-card" data-testid="saved-runs-panel"><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="font-heading text-xl" data-testid="saved-runs-title">Saved analyses</CardTitle><CardDescription className="mt-2" data-testid="saved-runs-description">Every saved run keeps its original inputs and results together.</CardDescription></div><Database size={20} className="text-sky-300" /></CardHeader><CardContent>
              {savedQuery.isPending && <p className="py-8 text-sm text-slate-400" data-testid="saved-runs-loading">Loading your design fieldbook…</p>}
              {savedQuery.isError && <div className="py-6"><p className="text-sm text-slate-400" data-testid="saved-runs-error">Saved runs are unavailable right now.</p><Button variant="outline" onClick={() => void savedQuery.refetch()} className="mt-3" data-testid="saved-runs-retry-button">Try again</Button></div>}
              {savedQuery.data?.length === 0 && <div className="py-8"><p className="text-sm text-slate-400" data-testid="saved-runs-empty">No saved studies yet. Run an analysis, then save it from the Analysis tab.</p><Button onClick={() => navigateTab("analysis")} className="mt-4" data-testid="saved-start-analysis-button">Open analysis <ArrowRight size={14} /></Button></div>}
              <div className="divide-y divide-white/10">{savedQuery.data?.map(saved => <button key={saved.id} onClick={() => loadRun(saved)} disabled={aiMutation.isPending || analyzeMutation.isPending} className="group flex w-full flex-col gap-4 rounded-lg px-3 py-5 text-left transition-colors hover:bg-sky-300/[.035] sm:flex-row sm:items-center sm:justify-between" data-testid={`saved-run-${saved.id}`}><div className="min-w-0 flex-1"><p className="truncate font-heading text-base text-slate-200" data-testid={`saved-name-${saved.id}`}>{saved.name}</p><p className="mt-2 text-xs text-slate-500" data-testid={`saved-context-${saved.id}`}>{saved.result.inputs.location} · {saved.result.inputs.dimensions.length} × {saved.result.inputs.dimensions.width} × {saved.result.inputs.dimensions.height} m · {saved.result.inputs.duration_hours} h</p></div><div className="flex flex-wrap items-center gap-6"><span className="font-mono text-sm text-orange-200" data-testid={`saved-temp-${saved.id}`}>{saved.result.average_inside_temp.toFixed(1)}°C avg</span><span className="font-mono text-[10px] text-slate-500" data-testid={`saved-date-${saved.id}`}>{formatDate(saved.created_at)}</span><ArrowUpRight size={17} className="text-sky-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div></button>)}</div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="analysis" className="workspace-enter mt-0 min-w-0" data-testid="results-workspace">
            <div className="mb-5 flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-[#0b1118]/90 p-4 sm:flex-row sm:items-center"><div><p className="text-sm text-slate-300" data-testid="analysis-configuration-summary">{inputs.location} · {inputs.dimensions.length} × {inputs.dimensions.width} × {inputs.dimensions.height} m · {inputs.duration_hours} hour study</p><p className="mt-1 text-xs text-slate-500" data-testid="analysis-configuration-description">Ready when you are. Run the shared configuration from all design tabs.</p></div><Button onClick={runAnalysis} disabled={!validInputs || analyzeMutation.isPending || aiMutation.isPending} className="bg-orange-500 text-white hover:bg-orange-400" data-testid="run-analysis-button">{analyzeMutation.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />} {analyzeMutation.isPending ? "Solving thermal field…" : "Run thermal analysis"}</Button></div>
            {resultOutdated && <p className="mb-5 rounded-xl border border-orange-300/20 bg-orange-300/5 p-3 text-xs leading-6 text-orange-200" data-testid="analysis-outdated-notice">Your design has changed. Charts, exports, and saved results below still belong to the previous {result?.inputs.location} run. Run the model again to update them.</p>}
            {!result ? <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex min-h-[310px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#0b1016]/70 p-8 text-center backdrop-blur-xl" data-testid="empty-results-state"><div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-orange-300/20 bg-orange-400/10 text-orange-300"><Sun size={28} className="animate-[spin_12s_linear_infinite]" /></div><p className="font-heading text-2xl" data-testid="empty-results-title">The shelter is waiting for its sky.</p><p className="mt-2 max-w-lg text-sm leading-6 text-slate-400" data-testid="empty-results-description">Configure Geometry, Solar & climate, and Materials using the tabs, then run the model to reveal temperature retention and heat-loss pathways.</p><Button variant="outline" onClick={runAnalysis} disabled={!validInputs || analyzeMutation.isPending || aiMutation.isPending} className="mt-6 border-orange-300/25 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20" data-testid="empty-run-analysis-button"><Play size={14} className="mr-2 fill-current" /> {analyzeMutation.isPending ? "Running model…" : `Run ${inputs.location} study`}</Button></motion.div> : <>
              <ModelEvidence result={result} />
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Thermometer} label="inside at end" value={`${result.current_inside_temp.toFixed(1)}`} unit="°C" tone="orange" /><Metric icon={Sun} label="solar captured" value={`${result.solar_energy_kwh.toFixed(1)}`} unit="kWh" tone="blue" /><Metric icon={Wind} label="heat loss" value={`${result.heat_loss_kwh.toFixed(1)}`} unit="kWh" tone="red" /><Metric icon={Snowflake} label="comfort window" value={`${result.comfort_hours.toFixed(1)}`} unit="hrs" tone="green" /></div>
              <ThermalCharts key={result.id} result={result} />
              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]"><Card className="border-white/10 bg-[#0b1016]/85 backdrop-blur-xl" data-testid="scenario-comparison-card"><CardHeader className="flex-row items-start justify-between"><div><CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500" data-testid="scenario-eyebrow">same sky / alternate envelope</CardDescription><CardTitle className="mt-2 font-heading text-xl font-medium" data-testid="scenario-title">Material scenarios</CardTitle></div><span className="rounded-full border border-white/10 px-2 py-1 font-mono text-[9px] text-slate-500" data-testid="scenario-count">{result.scenarios.length} cases</span></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-b border-white/10 text-[10px] uppercase tracking-[.12em] text-slate-600"><th className="pb-3 font-medium" data-testid="scenario-column-material">assembly</th><th className="pb-3 font-medium" data-testid="scenario-column-temp">end temp</th><th className="pb-3 font-medium" data-testid="scenario-column-loss">loss</th><th className="pb-3 text-right font-medium" data-testid="scenario-column-score">fit score</th></tr></thead><tbody>{result.scenarios.map((scenario, index) => <tr key={scenario.name} className="border-b border-white/[.06] last:border-0"><td className="py-4"><div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${index === 0 ? "bg-orange-300" : "bg-slate-600"}`} /><span className="text-slate-300">{scenario.name}</span></div><p className="mt-1 pl-3.5 text-[10px] text-slate-600">{scenario.note}</p></td><td className="py-4 font-mono text-orange-200">{scenario.inside_temp.toFixed(1)}°C</td><td className="py-4 font-mono text-slate-400">{scenario.heat_loss.toFixed(1)} kWh</td><td className="py-4 text-right"><span className={`rounded-full px-2 py-1 font-mono text-[10px] ${index === 0 ? "bg-orange-400/15 text-orange-200" : "bg-white/[.06] text-slate-400"}`}>{scenario.score}/100</span></td></tr>)}</tbody></table></div></CardContent></Card>
                <Card className="relative overflow-hidden border-orange-300/25 bg-[#17100d]/90 backdrop-blur-xl" data-testid="recommendation-card"><div className="pointer-events-none absolute right-[-45px] top-[-45px] h-36 w-36 rounded-full border border-orange-300/15" /><CardHeader><div className="mb-2 flex items-center gap-2 text-orange-300"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-400/15"><Gauge size={16} /></span><span className="font-mono text-[10px] uppercase tracking-[.15em]" data-testid="recommendation-label">best of tested cases</span></div><CardTitle className="mt-2 max-w-xs font-heading text-2xl font-medium leading-tight" data-testid="recommendation-title">{result.recommendation}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-slate-400" data-testid="recommendation-detail">{result.recommendation_detail}</p><div className="mt-6 flex items-center justify-between gap-3 border-t border-orange-300/15 pt-4"><span className="text-[10px] uppercase tracking-[.14em] text-slate-500" data-testid="efficiency-score-label">{result.model_info ? "Selected design comfort index" : "Legacy efficiency score"}</span><span className="font-mono text-2xl text-orange-200" data-testid="efficiency-score">{result.efficiency_score}<span className="text-sm text-orange-300/50"> / 100</span></span></div>{result.model_info && <p className="mt-3 text-[11px] leading-5 text-slate-500" data-testid="comfort-index-disclaimer">A degree-hour ranking index, not an energy efficiency percentage. The highest-ranked assembly still needs field validation.</p>}</CardContent></Card></div>
              <Card className="mt-5 overflow-hidden border-sky-300/20 bg-[#0b1118]/90 backdrop-blur-xl" data-testid="ai-review-card"><CardHeader className="flex-row items-start justify-between border-b border-white/10 pb-4"><div><div className="mb-2 flex items-center gap-2 text-sky-200"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400/15"><Sparkles size={16} /></span><span className="font-mono text-[10px] uppercase tracking-[.15em]" data-testid="ai-review-eyebrow">claude design review</span></div><CardTitle className="font-heading text-xl font-medium" data-testid="ai-review-title">Turn the model into a next move.</CardTitle><CardDescription className="mt-2 max-w-2xl text-xs leading-5 text-slate-500" data-testid="ai-review-description">Claude reads this exact thermal run and responds as an engineering assistant — useful for decisions, never a substitute for ANSYS validation.</CardDescription></div><Badge variant="outline" className="border-sky-300/20 bg-sky-400/[.06] text-sky-200" data-testid="ai-model-badge">Claude Sonnet 4.6</Badge></CardHeader><CardContent className="pt-5"><div className="flex flex-wrap gap-2" data-testid="ai-focus-controls">{([['review', 'Design review', MessageSquareText], ['explain', 'Explain results', Sparkles], ['report', 'Study note', FileText]] as const).map(([focus, label, Icon]) => <button key={focus} type="button" onClick={() => setAiFocus(focus)} className={`focus-button ${aiFocus === focus ? "focus-button-active" : ""}`} data-testid={`ai-focus-${focus}-button`}><Icon size={13} className="mr-1.5" />{label}</button>)}</div><textarea value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} placeholder="Ask Claude something specific about this shelter run (optional)…" className="control-input mt-4 min-h-[70px] resize-y py-3" data-testid="ai-question-input" /><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><Button onClick={() => result && aiMutation.mutate({ analysis: result, focus: aiFocus, question: aiQuestion })} disabled={aiMutation.isPending || !result} className="bg-sky-500 text-white shadow-[0_10px_30px_rgba(14,165,233,.18)] hover:bg-sky-400" data-testid="generate-ai-review-button"><Sparkles size={14} className="mr-2" />{aiMutation.isPending ? "Claude is reading the run…" : "Generate Claude review"}</Button>{aiReviewId && <span className="font-mono text-[10px] text-emerald-300" data-testid="ai-review-complete">stream saved · {aiReviewId.slice(0, 8)}</span>}</div>{aiError && <div className="mt-4 rounded-xl border border-rose-300/15 bg-rose-400/[.06] p-3 text-xs leading-5 text-rose-200" data-testid="ai-review-error">{aiError}</div>}{aiResponse && <div className="mt-5 rounded-xl border border-sky-300/15 bg-sky-400/[.04] p-4" data-testid="ai-response-panel"><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-sky-200" data-testid="ai-response-label"><Sparkles size={12} /> Claude response</div><div className="whitespace-pre-wrap text-sm leading-7 text-slate-300" data-testid="ai-response-text">{aiResponse}</div></div>}{!aiResponse && !aiMutation.isPending && !aiError && <p className="mt-4 text-xs text-slate-600" data-testid="ai-empty-state">Choose a lens and generate a streamed review from this run.</p>}{aiHistoryQuery.data && aiHistoryQuery.data.length > 0 && <div className="mt-5 border-t border-white/10 pt-4"><p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500" data-testid="ai-history-title"><MessageSquareText size={12} /> previous Claude reviews</p><div className="grid gap-2 md:grid-cols-2">{aiHistoryQuery.data.slice(0, 4).map((item) => <div key={item.id} className="rounded-lg border border-white/[.06] bg-white/[.025] p-3" data-testid={`ai-history-item-${item.id}`}><div className="flex items-center justify-between gap-2"><span className="text-xs capitalize text-slate-300">{item.focus}</span><span className="font-mono text-[9px] text-slate-600">{formatDate(item.created_at)}</span></div><p className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-500">{item.response}</p></div>)}</div></div>}</CardContent></Card>
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b1016]/75 p-4 backdrop-blur-xl xl:flex-row xl:items-center" data-testid="save-analysis-bar"><div className="flex flex-1 flex-wrap items-center gap-3"><div className="hidden rounded-xl border border-sky-300/20 bg-sky-400/10 p-2 text-sky-300 sm:block"><Save size={16} /></div><div className="min-w-[150px] flex-1"><p className="text-xs font-semibold text-slate-300" data-testid="save-analysis-title">Keep this thermal run</p><p className="mt-1 text-[11px] text-slate-500" data-testid="save-analysis-description">Save this completed run’s inputs and results for your design log.</p></div><input value={saveName} maxLength={80} onChange={(event) => setSaveName(event.target.value)} className="control-input max-w-[230px]" aria-label="Analysis name" data-testid="analysis-name-input" /></div><Button variant="outline" disabled={saveMutation.isPending || analyzeMutation.isPending || !saveName.trim()} onClick={() => result && saveMutation.mutate({ name: saveName.trim(), result })} className="border-sky-300/25 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20" data-testid="save-analysis-button"><Bookmark size={14} className="mr-2" /> {saveMutation.isPending ? "Saving…" : "Save analysis"}</Button><Button variant="ghost" className="text-slate-500 hover:text-slate-200" onClick={exportCsv} data-testid="export-csv-button"><FileSpreadsheet size={14} className="mr-2" /> CSV for ANSYS</Button><Button variant="ghost" className="text-slate-500 hover:text-slate-200" onClick={exportJson} data-testid="export-json-button"><FileJson size={14} className="mr-2" /> JSON parameters</Button></div>
            </>}
          </TabsContent>
        </Tabs>
      </main>
      <footer className="relative z-10 border-t border-white/10 bg-[#080b10]/70" data-testid="app-footer"><div className="mx-auto flex max-w-[1600px] flex-col justify-between gap-2 px-5 py-4 text-[10px] text-slate-600 sm:flex-row lg:px-8"><span data-testid="footer-method">Model uses reduced-order transient thermal balance · not an ANSYS substitute</span><span className="font-mono" data-testid="footer-location">{inputs.location.toUpperCase()} / {inputs.duration_hours}H WINDOW / PASSIVE MODE</span></div></footer>
    </div>
  );
}