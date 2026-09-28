import * as Plot from "@observablehq/plot";
import { memo, useMemo } from "react";
import { dailyProfile, hourlyMeans } from "../analysis/circadian";
import { sortGroups, type Subject } from "../analysis/select";
import { mean, sem } from "../analysis/stats";
import { isLightSlot, type Schedule } from "../analysis/time";
import { MethodNote } from "../components/MethodNote";
import { Legend, groupLineItems, type LegendItem } from "../components/Legend";
import { MetricLegend, MetricPanel } from "../components/MetricPanel";
import { PlotFigure } from "../components/PlotFigure";
import { Badge, Empty, Panel, Segmented } from "../components/ui";
import { useSetSearch } from "../state/route";
import type { View } from "../state/view";
import { DARK_SHADE, genotypeColor, sortGenotypes } from "../theme";
import { FlagNote, clockTick } from "./shared";

const COSINOR_IDS = ["mean_act", "dark_frac", "mesor", "amplitude", "acrophase", "r2"];
const NONPARAM_IDS = ["m10", "l5", "ra", "iv"];

export function CircadianTab({ view }: { view: View }) {
  if (!view.subjects.length) return <Empty>No mice match the current filters.</Empty>;
  return (
    <div className="space-y-3">
      <FlagNote view={view} />
      <GroupTrace view={view} />
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            Rhythm metrics <MethodNote id="cosinor" /> <MethodNote id="stats" />
          </span>
        }
      >
        <MetricLegend view={view} />
        <MetricPanel view={view} ids={COSINOR_IDS} />
        <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Non-parametric <MethodNote id="nonparametric" />
        </div>
        <MetricPanel view={view} ids={NONPARAM_IDS} />
      </Panel>
      <Actograms view={view} />
    </div>
  );
}

/** Dark-phase intervals, in hours from the first recording midnight (or ZT when folded). */
function darkIntervals(s: Schedule, fold: boolean): [number, number][] {
  if (fold) return [[(s.lightsOffMin - s.lightsOnMin + 1440) % 1440 / 60, 24]];
  const out: [number, number][] = [];
  let start: number | null = null;
  for (let i = 0; i <= s.nSlots; i++) {
    const dark = i < s.nSlots && !isLightSlot(s, i);
    const h = (i * s.binMin) / 60;
    if (dark && start == null) start = h;
    if (!dark && start != null) {
      out.push([start, h]);
      start = null;
    }
  }
  return out;
}

function GroupTrace({ view }: { view: View }) {
  const { subjects, schedule, mask, search } = view;
  const setSearch = useSetSearch();
  const s = schedule!;
  const fold = search.fold;

  const rows = useMemo(() => {
    const lightsOnH = s.lightsOnMin / 60;
    const perMouse = subjects.map((sub) => {
      const hourly = hourlyMeans(sub.series.act.map((a) => (a == null ? null : a / 1000)), mask, s);
      if (!fold) return hourly.map((v, h) => ({ x: h + 0.5, v }));
      return dailyProfile(hourly).map((v, h) => ({ x: ((h - lightsOnH + 24) % 24) + 0.5, v }));
    });
    const out: { group: string; genotype: string; x: number; mean: number; lo: number; hi: number; n: number }[] = [];
    for (const group of sortGroups(subjects.map((x) => x.group))) {
      const idx = subjects.map((x, i) => (x.group === group ? i : -1)).filter((i) => i >= 0);
      const xs = [...new Set(perMouse[idx[0]].map((p) => p.x))].sort((a, b) => a - b);
      for (const x of xs) {
        const vals = idx.map((i) => perMouse[i].find((p) => p.x === x)?.v).filter((v): v is number => v != null);
        if (!vals.length) continue;
        const m = mean(vals);
        const e = vals.length > 1 ? sem(vals) : 0;
        out.push({ group, genotype: group.split(" ")[0], x, mean: m, lo: m - e, hi: m + e, n: vals.length });
      }
    }
    return out;
  }, [subjects, mask, s, fold]);

  const options = useMemo<Plot.PlotOptions>(() => {
    const span = fold ? 24 : (s.nSlots * s.binMin) / 60;
    const dark = darkIntervals(s, fold).map(([x1, x2]) => ({ x1, x2 }));
    return {
      height: 240,
      marginLeft: 44,
      x: {
        domain: [0, span],
        ticks: Array.from({ length: span / 3 + 1 }, (_, i) => i * 3),
        tickFormat: fold ? (h: number) => `ZT${h}` : clockTick,
        label: fold ? "Zeitgeber time (ZT0 = lights on)" : "clock time",
      },
      y: { label: "activity_percent (hourly mean)", grid: true, tickFormat: ".0%" },
      marks: [
        Plot.rect(dark, { x1: "x1", x2: "x2", fill: DARK_SHADE, fillOpacity: 0.7 }),
        Plot.areaY(rows, { x: "x", y1: "lo", y2: "hi", z: "group", fill: (d) => genotypeColor(d.genotype), fillOpacity: 0.15 }),
        ...[false, true].map((female) =>
          Plot.lineY(
            rows.filter((d) => d.group.endsWith(" F") === female),
            {
              x: "x",
              y: "mean",
              z: "group",
              stroke: (d) => genotypeColor(d.genotype),
              strokeWidth: 1.5,
              strokeDasharray: female ? "4,2" : undefined,
            },
          ),
        ),
        Plot.tip(rows, Plot.pointerX({ x: "x", y: "mean", title: (d) => `${d.group} (n=${d.n})\n${(d.mean * 100).toFixed(1)}% \u00b1 ${((d.hi - d.mean) * 100).toFixed(1)}` })),
      ],
    };
  }, [rows, s, fold]);

  return (
    <Panel
      title="Mean activity by group"
      aside={
        <>
          <span>Hourly means across mice.</span>
          <Segmented
            value={fold ? "fold" : "48"}
            onChange={(v) => setSearch({ fold: v === "fold" })}
            options={[
              { value: "48", label: "48 h" },
              { value: "fold", label: "24 h (ZT)" },
            ]}
          />
        </>
      }
    >
      <PlotFigure options={options} />
      <Legend
        className="mt-1"
        items={[
          ...groupLineItems(sortGroups(rows.map((r) => r.group))).map((it) => ({ ...it, label: <>{it.label} mean</> })),
          { kind: "swatch", color: "#94a3b8", opacity: 0.3, label: "± SEM" },
          { kind: "swatch", color: DARK_SHADE, opacity: 0.7, label: "dark phase" },
        ]}
      />
    </Panel>
  );
}

const Actogram = memo(function Actogram({ sub, s, flagged }: { sub: Subject; s: Schedule; flagged: boolean }) {
  const options = useMemo<Plot.PlotOptions>(() => {
    const binH = s.binMin / 60;
    const perDay = 1440 / s.binMin;
    const nDays = Math.ceil(s.nSlots / perDay);
    const bars: { row: number; x1: number; x2: number; y: number }[] = [];
    const shade: { row: number; x1: number; x2: number }[] = [];
    for (let row = 0; row < nDays; row++) {
      for (let k = 0; k < 2 * perDay; k++) {
        const i = row * perDay + k;
        if (i >= s.nSlots) break;
        const x1 = k * binH;
        if (!isLightSlot(s, i)) shade.push({ row, x1, x2: x1 + binH });
        const a = sub.series.act[i];
        if (a != null && a > 0) bars.push({ row, x1, x2: x1 + binH, y: a / 1000 });
      }
    }
    return {
      height: 26 + nDays * 26,
      marginLeft: 4,
      marginRight: 4,
      marginTop: 2,
      marginBottom: 16,
      fy: { axis: null, padding: 0.12 },
      x: { domain: [0, 48], ticks: [0, 12, 24, 36, 48], tickFormat: clockTick, label: null, tickSize: 2 },
      y: { axis: null, domain: [0, 1] },
      marks: [
        Plot.rect(shade, { fy: "row", x1: "x1", x2: "x2", y1: 0, y2: 1, fill: DARK_SHADE }),
        Plot.rectY(bars, { fy: "row", x1: "x1", x2: "x2", y: "y", fill: genotypeColor(sub.genotype) }),
        Plot.frame({ stroke: "#e2e8f0" }),
      ],
    };
  }, [sub, s]);
  return (
    <div className="rounded border border-slate-100 p-1">
      <div className="flex items-center gap-1 truncate font-mono text-[10px] text-slate-600">
        {sub.mouse.Mouse_ID} <span className="text-slate-400">{sub.sex}</span>
        {flagged && <Badge tone="red">QC</Badge>}
      </div>
      <PlotFigure options={options} />
    </div>
  );
});

function Actograms({ view }: { view: View }) {
  const { subjects, schedule, flags } = view;
  const groups = sortGroups(subjects.map((s) => s.group));
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Double-plotted actograms <MethodNote id="actogram" />
        </span>
      }
      aside="Full recording shown regardless of the day filter."
    >
      <Legend
        className="mb-1.5"
        items={[
          ...sortGenotypes([...new Set(subjects.map((s) => s.genotype))]).map((g): LegendItem => ({ kind: "swatch", color: genotypeColor(g), label: `${g} activity` })),
          { kind: "swatch", color: DARK_SHADE, label: "dark phase" },
        ]}
      />
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1 text-[11px] font-semibold" style={{ color: genotypeColor(g.split(" ")[0]) }}>
              {g} <span className="font-normal text-slate-400">n={subjects.filter((s) => s.group === g).length}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-1">
              {subjects
                .filter((s) => s.group === g)
                .map((s) => (
                  <Actogram key={s.mouse.Mouse_ID} sub={s} s={schedule!} flagged={flags.has(s.mouse.Mouse_ID)} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
