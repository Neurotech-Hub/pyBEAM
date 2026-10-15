import * as Plot from "@observablehq/plot";
import { useMemo, useState } from "react";
import { bandId, periodId } from "../analysis/metrics";
import { sortGroups, type Subject } from "../analysis/select";
import { mean, sem } from "../analysis/stats";
import { isLightSlot } from "../analysis/time";
import {
  ACF_MAX_H,
  BANDS,
  MAX_EMPTY,
  PERIODS,
  U_MAX_H,
  U_MIN_H,
  outsideCoi,
  ultradianAnalysis,
  type UltradianResult,
} from "../analysis/ultradian";
import { Legend, genotypeDotItems, groupLineItems } from "../components/Legend";
import { MethodNote } from "../components/MethodNote";
import { MetricLegend, MetricPanel } from "../components/MetricPanel";
import { PlotFigure } from "../components/PlotFigure";
import { Empty, Panel, Segmented, fmt } from "../components/ui";
import { useSetSearch } from "../state/route";
import type { Search } from "../state/search";
import type { View } from "../state/view";
import { DARK_COLOR, FLAG_COLOR, genotypeColor } from "../theme";
import { FlagNote, clockTick } from "./shared";

const PERIOD_TICKS = [0.5, 1, 2, 4, 8];
const ROW_IDS = [
  ...BANDS.map((_, b) => (["light", "dark", "all"] as const).map((p) => bandId(b, p))),
  (["light", "dark", "all"] as const).map(periodId),
  ["up_sig", "acf_lag", "acf_r"],
  ["ls_period", "ls_power"],
];
const BOUT_IDS = ["a_bout_len", "ibi"];

/** Geometric midpoints between log-spaced periods, for drawing period cells. */
const PERIOD_EDGES = [
  U_MIN_H ** 2 / Math.sqrt(PERIODS[0] * PERIODS[1]),
  ...PERIODS.slice(1).map((p, j) => Math.sqrt(p * PERIODS[j])),
  U_MAX_H ** 2 / Math.sqrt(PERIODS[PERIODS.length - 1] * PERIODS[PERIODS.length - 2]),
];

interface Analyzed {
  sub: Subject;
  r: UltradianResult;
  index: number;
}

export function UltradianTab({ view }: { view: View }) {
  const { subjects, schedule, search } = view;
  const setSearch = useSetSearch();
  const analyzed = useMemo<Analyzed[]>(
    () =>
      subjects
        .map((sub, index) => ({ sub, index, r: ultradianAnalysis(sub.series, schedule!, search.udt) }))
        .filter((a): a is Analyzed => a.r != null),
    [subjects, schedule, search.udt],
  );
  if (!subjects.length) return <Empty>No mice match the current filters.</Empty>;
  const skipped = subjects.length - analyzed.length;

  return (
    <div className="space-y-3">
      <FlagNote view={view} />
      <div className="no-print flex flex-wrap items-center gap-4">
        <Segmented<Search["udt"]>
          label="Activity"
          value={search.udt}
          onChange={(udt) => setSearch({ udt })}
          options={[
            { value: "detrended", label: "Detrended", title: "Remove each light/dark block's mean and linear trend" },
            { value: "raw", label: "Raw", title: "Raw activity (24-h harmonics will appear)" },
          ]}
        />
        <Segmented<Search["uphase"]>
          label="Spectra over"
          value={search.uphase}
          onChange={(uphase) => setSearch({ uphase })}
          options={[
            { value: "all", label: "24 h" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <MethodNote id="ultradianPrep" />
        {skipped > 0 && (
          <span className="text-[11px] text-slate-500">
            {skipped} {skipped > 1 ? "mice" : "mouse"} not analyzed (more than {MAX_EMPTY} empty slots).
          </span>
        )}
      </div>
      {analyzed.length ? (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            <GlobalSpectrum analyzed={analyzed} phase={search.uphase} />
            <PeriodHeatmap analyzed={analyzed} phase={search.uphase} flags={view.flags} />
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Scalogram analyzed={analyzed} view={view} />
            <Autocorrelation analyzed={analyzed} />
          </div>
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                Ultradian metrics <MethodNote id="wavelet" /> <MethodNote id="stats" />
              </span>
            }
            aside="Click a metric title to select it for Cohort Effects."
          >
            <MetricLegend view={view} />
            <div className="space-y-1">
              {ROW_IDS.map((ids) => (
                <MetricPanel key={ids[0]} view={view} ids={ids} cols="grid-cols-1 sm:grid-cols-3" />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Awake bouts <MethodNote id="interbout" />
            </div>
            <MetricPanel view={view} ids={BOUT_IDS} cols="grid-cols-1 sm:grid-cols-3" />
          </Panel>
          <IbiVsPeriod analyzed={analyzed} view={view} />
        </>
      ) : (
        <Empty>No mice in view have enough data for ultradian analysis.</Empty>
      )}
    </div>
  );
}

const periodAxis = (label: string) => ({
  type: "log" as const,
  domain: [U_MIN_H, U_MAX_H],
  ticks: PERIOD_TICKS,
  tickFormat: (v: number) => `${v} h`,
  label,
});

function GlobalSpectrum({ analyzed, phase }: { analyzed: Analyzed[]; phase: Search["uphase"] }) {
  const { rows, noise } = useMemo(() => {
    const rows: { group: string; genotype: string; p: number; mean: number; lo: number; hi: number; n: number }[] = [];
    for (const group of sortGroups(analyzed.map((a) => a.sub.group))) {
      const members = analyzed.filter((a) => a.sub.group === group);
      PERIODS.forEach((p, j) => {
        const v = members.map((a) => a.r.phases[phase].global[j]).filter(Number.isFinite);
        if (!v.length) return;
        const m = mean(v);
        const e = v.length > 1 ? sem(v) : 0;
        rows.push({ group, genotype: members[0].sub.genotype, p, mean: m, lo: m - e, hi: m + e, n: v.length });
      });
    }
    const noise = PERIODS.map((p, j) => ({
      p,
      background: mean(analyzed.map((a) => a.r.cwt.background[j])),
      threshold: mean(analyzed.map((a) => a.r.cwt.threshold[j])),
    }));
    return { rows, noise };
  }, [analyzed, phase]);

  const options = useMemo<Plot.PlotOptions>(
    () => ({
      height: 260,
      marginLeft: 48,
      x: periodAxis("period"),
      y: { type: "log", label: "wavelet power (time-averaged)", grid: true },
      marks: [
        Plot.ruleX([2, 4], { stroke: "#cbd5e1", strokeDasharray: "2,2" }),
        Plot.line(noise, { x: "p", y: "background", stroke: "#64748b", strokeDasharray: "1,2" }),
        Plot.line(noise, { x: "p", y: "threshold", stroke: "#64748b", strokeDasharray: "4,3" }),
        Plot.areaY(rows, { x: "p", y1: "lo", y2: "hi", z: "group", fill: (d) => genotypeColor(d.genotype), fillOpacity: 0.15 }),
        ...[false, true].map((female) =>
          Plot.line(
            rows.filter((d) => d.group.endsWith(" F") === female),
            { x: "p", y: "mean", z: "group", stroke: (d) => genotypeColor(d.genotype), strokeWidth: 1.5, strokeDasharray: female ? "4,2" : undefined },
          ),
        ),
        Plot.tip(rows, Plot.pointerX({ x: "p", y: "mean", title: (d) => `${d.group} (n=${d.n})\n${fmt(d.p)} h: ${fmt(d.mean, 3)}` })),
      ],
    }),
    [rows, noise],
  );

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Wavelet spectrum by group <MethodNote id="wavelet" />
        </span>
      }
      aside="Mean ± SEM across mice, outside the cone of influence."
    >
      <PlotFigure options={options} />
      <Legend
        className="mt-1"
        items={[
          ...groupLineItems(sortGroups(rows.map((r) => r.group))),
          { kind: "line", color: "#64748b", dashed: true, label: "95% red-noise threshold (pointwise)" },
          { kind: "line", color: "#94a3b8", label: "dotted: red-noise background" },
        ]}
      />
    </Panel>
  );
}

function PeriodHeatmap({ analyzed, phase, flags }: { analyzed: Analyzed[]; phase: Search["uphase"]; flags: View["flags"] }) {
  const [normalize, setNormalize] = useState(true);
  const options = useMemo<Plot.PlotOptions>(() => {
    const cells: { y: string; x1: number; x2: number; v: number; title: string }[] = [];
    const peaks: { y: string; p: number }[] = [];
    for (const a of analyzed) {
      const id = a.sub.mouse.Mouse_ID;
      const g = a.r.phases[phase].global;
      const max = Math.max(...g.filter(Number.isFinite));
      g.forEach((v, j) => {
        if (!Number.isFinite(v)) return;
        cells.push({
          y: id,
          x1: PERIOD_EDGES[j],
          x2: PERIOD_EDGES[j + 1],
          v: normalize ? v / max : v,
          title: `${id} (${a.sub.group})\n${fmt(PERIODS[j])} h: ${fmt(v, 3)}`,
        });
      });
      if (Number.isFinite(a.r.phases[phase].period)) peaks.push({ y: id, p: a.r.phases[phase].period });
    }
    const ids = analyzed.map((a) => a.sub.mouse.Mouse_ID);
    const firstOfGroup = new Map<string, string>();
    const seen = new Set<string>();
    analyzed.forEach((a) => {
      if (!seen.has(a.sub.group)) firstOfGroup.set(a.sub.mouse.Mouse_ID, a.sub.group);
      seen.add(a.sub.group);
    });
    const groupStarts = analyzed.filter((a, i) => i > 0 && analyzed[i - 1].sub.group !== a.sub.group).map((a) => a.sub.mouse.Mouse_ID);
    return {
      height: Math.max(160, 40 + ids.length * 5),
      marginLeft: 52,
      marginTop: 4,
      x: periodAxis("period"),
      y: { domain: ids, tickFormat: (id: string) => firstOfGroup.get(id) ?? "", tickSize: 0, label: null, padding: 0 },
      color: {
        scheme: "viridis",
        type: normalize ? "linear" : "log",
        legend: true,
        label: normalize ? "power / mouse max" : "wavelet power",
      },
      marks: [
        Plot.rect(cells, { y: "y", x1: "x1", x2: "x2", fill: "v", inset: 0 }),
        Plot.tickY(groupStarts, { y: (d) => d, stroke: "#ffffff", strokeWidth: 1.5, dy: -2.5 }),
        Plot.dot(peaks, { y: "y", x: "p", r: 1.2, fill: "white" }),
        Plot.dot(
          ids.filter((id) => flags.has(id)),
          { y: (d) => d, x: U_MIN_H, r: 1.8, fill: FLAG_COLOR, dx: -4 },
        ),
        Plot.tip(cells, Plot.pointer({ y: "y", x: (d) => Math.sqrt(d.x1 * d.x2), title: "title" })),
      ],
    };
  }, [analyzed, phase, normalize, flags]);

  return (
    <Panel
      title="Mouse × period power"
      aside={
        <label className="no-print flex items-center gap-1">
          <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
          Normalize each mouse
        </label>
      }
    >
      <PlotFigure options={options} />
      <Legend className="mt-1" items={[{ kind: "dot", color: "#cbd5e1", label: "white dot: mouse's dominant period" }]} />
    </Panel>
  );
}

function Scalogram({ analyzed, view }: { analyzed: Analyzed[]; view: View }) {
  const s = view.schedule!;
  const [picked, setPicked] = useState<string>();
  const a = analyzed.find((x) => x.sub.mouse.Mouse_ID === picked) ?? analyzed[0];
  const options = useMemo<Plot.PlotOptions>(() => {
    const { cwt: c, prep } = a.r;
    const dt = prep.dtH;
    const cells: { x1: number; x2: number; y1: number; y2: number; v: number; coi: boolean }[] = [];
    for (let j = 0; j < c.periods.length; j++) {
      for (let k = 0; k < c.n; k++) {
        const t = (prep.i0 + k) * dt;
        cells.push({
          x1: t,
          x2: t + dt,
          y1: PERIOD_EDGES[j],
          y2: PERIOD_EDGES[j + 1],
          v: Math.log2(c.power[j][k] / c.background[j]),
          coi: !outsideCoi(c, j, k),
        });
      }
    }
    const sigRuns: { x1: number; x2: number; y1: number; y2: number }[] = [];
    for (let j = 0; j < c.periods.length; j++) {
      let start = -1;
      for (let k = 0; k <= c.n; k++) {
        const on = k < c.n && outsideCoi(c, j, k) && c.power[j][k] > c.threshold[j];
        if (on && start < 0) start = k;
        if (!on && start >= 0) {
          sigRuns.push({ x1: (prep.i0 + start) * dt, x2: (prep.i0 + k) * dt, y1: PERIOD_EDGES[j], y2: PERIOD_EDGES[j + 1] });
          start = -1;
        }
      }
    }
    const dark: { x1: number; x2: number }[] = [];
    for (let i = 0; i < s.nSlots; i++) if (!isLightSlot(s, i)) dark.push({ x1: i * dt, x2: (i + 1) * dt });
    // Instantaneous power dips toward zero, so the lower tail is far longer than the upper; scale to the upper tail.
    const vs = cells.filter((d) => !d.coi && Number.isFinite(d.v)).map((d) => d.v).sort((p, q) => p - q);
    const lim = Math.max(2, Math.ceil(vs[Math.floor(0.99 * (vs.length - 1))] ?? 2));
    const span = (s.nSlots * s.binMin) / 60;
    return {
      height: 260,
      marginLeft: 48,
      marginTop: 8,
      x: { domain: [0, span], ticks: Array.from({ length: span / 6 + 1 }, (_, i) => i * 6), tickFormat: clockTick, label: null },
      y: { ...periodAxis("period"), domain: [U_MIN_H, U_MAX_H * 1.35] },
      color: { type: "diverging", scheme: "RdBu", reverse: true, domain: [-lim, lim], clamp: true, legend: true, label: "log\u2082(power / red-noise background)" },
      marks: [
        Plot.rect(dark, { x1: "x1", x2: "x2", y1: U_MAX_H * 1.1, y2: U_MAX_H * 1.35, fill: DARK_COLOR }),
        Plot.rect(cells.filter((d) => !d.coi), { x1: "x1", x2: "x2", y1: "y1", y2: "y2", fill: "v", inset: 0, shapeRendering: "crispEdges" }),
        Plot.rect(cells.filter((d) => d.coi), { x1: "x1", x2: "x2", y1: "y1", y2: "y2", fill: "v", fillOpacity: 0.25, inset: 0, shapeRendering: "crispEdges" }),
        Plot.rect(sigRuns, { x1: "x1", x2: "x2", y1: "y1", y2: "y2", stroke: "#0f172a", strokeWidth: 0.6, inset: 0 }),
      ],
    };
  }, [a, s]);

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Example scalogram <MethodNote id="wavelet" />
        </span>
      }
      aside={
        <select
          className="no-print rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-800"
          value={a.sub.mouse.Mouse_ID}
          onChange={(e) => setPicked(e.target.value)}
        >
          {analyzed.map((x) => (
            <option key={x.sub.mouse.Mouse_ID} value={x.sub.mouse.Mouse_ID}>
              {x.sub.mouse.Mouse_ID} ({x.sub.group})
            </option>
          ))}
        </select>
      }
    >
      <PlotFigure options={options} />
      <Legend
        className="mt-1"
        items={[
          { kind: "swatch", color: DARK_COLOR, label: "top strip: dark phase" },
          { kind: "swatch", color: "#ffffff", label: "outlined: significant (95%, red noise)" },
          { kind: "swatch", color: "#94a3b8", opacity: 0.25, label: "faded: cone of influence (edge-affected)" },
        ]}
      />
      <div className="mt-1 font-mono text-[10px] text-slate-500">
        dominant period {fmt(a.r.phases.all.period)} h (light {fmt(a.r.phases.light.period)}, dark {fmt(a.r.phases.dark.period)}); lag-1 r = {fmt(a.r.cwt.alpha)}
      </div>
    </Panel>
  );
}

function Autocorrelation({ analyzed }: { analyzed: Analyzed[] }) {
  const rows = useMemo(() => {
    const out: { group: string; genotype: string; lag: number; mean: number; lo: number; hi: number }[] = [];
    for (const group of sortGroups(analyzed.map((a) => a.sub.group))) {
      const members = analyzed.filter((a) => a.sub.group === group);
      const nLag = members[0].r.acf.length;
      for (let k = 1; k < nLag; k++) {
        const v = members.map((a) => a.r.acf[k]).filter(Number.isFinite);
        if (!v.length) continue;
        const m = mean(v);
        const e = v.length > 1 ? sem(v) : 0;
        out.push({ group, genotype: members[0].sub.genotype, lag: k * members[0].r.prep.dtH, mean: m, lo: m - e, hi: m + e });
      }
    }
    return out;
  }, [analyzed]);

  const options = useMemo<Plot.PlotOptions>(
    () => ({
      height: 260,
      marginLeft: 40,
      x: { domain: [0, ACF_MAX_H], ticks: [0, 2, 4, 6, 8, 10, 12], tickFormat: (v: number) => `${v} h`, label: "lag" },
      y: { label: "autocorrelation r", grid: true },
      marks: [
        Plot.ruleY([0], { stroke: "#64748b" }),
        Plot.areaY(rows, { x: "lag", y1: "lo", y2: "hi", z: "group", fill: (d) => genotypeColor(d.genotype), fillOpacity: 0.15 }),
        ...[false, true].map((female) =>
          Plot.line(
            rows.filter((d) => d.group.endsWith(" F") === female),
            { x: "lag", y: "mean", z: "group", stroke: (d) => genotypeColor(d.genotype), strokeWidth: 1.5, strokeDasharray: female ? "4,2" : undefined },
          ),
        ),
        Plot.tip(rows, Plot.pointerX({ x: "lag", y: "mean", title: (d) => `${d.group}\nlag ${fmt(d.lag)} h: r = ${fmt(d.mean)}` })),
      ],
    }),
    [rows],
  );

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Autocorrelation <MethodNote id="autocorr" />
        </span>
      }
      aside="Mean ± SEM across mice."
    >
      <PlotFigure options={options} />
      <Legend className="mt-1" items={groupLineItems(sortGroups(rows.map((r) => r.group)))} />
    </Panel>
  );
}

function IbiVsPeriod({ analyzed, view }: { analyzed: Analyzed[]; view: View }) {
  const options = useMemo<Plot.PlotOptions>(() => {
    const pts = analyzed
      .map((a) => ({
        id: a.sub.mouse.Mouse_ID,
        group: a.sub.group,
        genotype: a.sub.genotype,
        period: a.r.phases.all.period,
        ibi: view.metrics[a.index]?.ibi,
        flagged: view.flags.has(a.sub.mouse.Mouse_ID),
      }))
      .filter((d) => Number.isFinite(d.period) && Number.isFinite(d.ibi));
    const hi = Math.max(U_MAX_H, ...pts.map((d) => d.ibi));
    return {
      height: 260,
      marginLeft: 44,
      x: { type: "log", domain: [U_MIN_H, U_MAX_H], ticks: PERIOD_TICKS, tickFormat: (v: number) => `${v} h`, label: "dominant wavelet period (24 h)" },
      y: { type: "log", domain: [Math.min(U_MIN_H, ...pts.map((d) => d.ibi)), hi], ticks: PERIOD_TICKS, tickFormat: (v: number) => `${v} h`, label: "median inter-bout interval", grid: true },
      marks: [
        Plot.line([[U_MIN_H, U_MIN_H], [U_MAX_H, U_MAX_H]], { stroke: "#94a3b8", strokeDasharray: "4,3" }),
        Plot.dot(pts, {
          x: "period",
          y: "ibi",
          r: 2.6,
          fill: (d) => genotypeColor(d.genotype),
          fillOpacity: 0.75,
          stroke: (d) => (d.flagged ? FLAG_COLOR : "none"),
        }),
        Plot.tip(pts, Plot.pointer({ x: "period", y: "ibi", title: (d) => `${d.id} (${d.group})\nperiod ${fmt(d.period)} h, IBI ${fmt(d.ibi)} h` })),
      ],
    };
  }, [analyzed, view.metrics, view.flags]);

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Inter-bout interval vs wavelet period <MethodNote id="interbout" />
        </span>
      }
      aside="One dot per mouse. Uses the current state thresholds."
    >
      <div className="max-w-xl">
        <PlotFigure options={options} />
      </div>
      <Legend
        className="mt-1"
        items={[
          ...genotypeDotItems(analyzed.map((a) => a.sub.genotype)),
          { kind: "line", color: "#94a3b8", dashed: true, label: "identity (IBI = period)" },
        ]}
      />
    </Panel>
  );
}