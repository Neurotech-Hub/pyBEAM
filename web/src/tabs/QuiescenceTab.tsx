import * as Plot from "@observablehq/plot";
import { useCallback, useMemo, useState } from "react";
import { METRIC_BY_ID, METRICS, mouseStateMetrics } from "../analysis/metrics";
import { compareToWt, sortGroups } from "../analysis/select";
import { classify, STATE_LABELS, UNDEFINED } from "../analysis/states";
import { MethodNote } from "../components/MethodNote";
import { Legend, groupLineItems, type LegendItem } from "../components/Legend";
import { MetricLegend, MetricPanel } from "../components/MetricPanel";
import { PlotFigure } from "../components/PlotFigure";
import { Empty, Panel, Segmented, fmt, pText } from "../components/ui";
import { useSetSearch } from "../state/route";
import { thresholds, type Basis } from "../state/search";
import type { View } from "../state/view";
import { DARK_COLOR, FLAG_COLOR, LIGHT_COLOR, STATE_COLORS, genotypeColor } from "../theme";
import { FlagNote, clockTick } from "./shared";

const STATE_ROWS = ["q", "u", "a"].map((k) => [`${k}_light`, `${k}_dark`, `${k}_all`]);
const BOUT_IDS = ["q_bouts", "q_bout_len", "qa_rate"];

export function QuiescenceTab({ view }: { view: View }) {
  if (!view.subjects.length) return <Empty>No mice match the current filters.</Empty>;
  return (
    <div className="space-y-3">
      <FlagNote view={view} />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Distribution view={view} />
        <StateRaster view={view} />
      </div>
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            Time in state <MethodNote id="states" /> <MethodNote id="stats" />
          </span>
        }
        aside="Click a metric title to select it."
      >
        <MetricLegend view={view} />
        <div className="space-y-1">
          {STATE_ROWS.filter((ids) => !view.search.noU || !ids[0].startsWith("u_")).map((ids) => (
            <MetricPanel key={ids[0]} view={view} ids={ids} cols="grid-cols-1 sm:grid-cols-3" />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Quiescent bouts <MethodNote id="bouts" />
        </div>
        <MetricPanel view={view} ids={BOUT_IDS} cols="grid-cols-1 sm:grid-cols-3" />
      </Panel>
      <Sensitivity view={view} />
    </div>
  );
}

const BIN = 0.005;
const X_DOMAIN: Record<Basis, [number, number]> = { act: [0, 0.5], inact: [0.5, 1] };
const BASIS_LABEL: Record<Basis, string> = { act: "activity_percent", inact: "inactivity_percent" };

function Distribution({ view }: { view: View }) {
  const { subjects, mask, search } = view;
  const setSearch = useSetSearch();
  const { basis, q, w } = thresholds(search);
  const [xmin, xmax] = X_DOMAIN[basis];

  const curves = useMemo(() => {
    const nb = Math.round(1 / BIN) + 1;
    const byGroup = new Map<string, number[]>();
    for (const s of subjects) {
      const h = byGroup.get(s.group) ?? new Array(nb).fill(0);
      s.series[basis].forEach((a, i) => {
        if (a != null && mask[i]) h[Math.min(nb - 1, Math.round(a / 1000 / BIN))]++;
      });
      byGroup.set(s.group, h);
    }
    const rows: { group: string; genotype: string; x: number; y: number }[] = [];
    for (const group of sortGroups([...byGroup.keys()])) {
      const h = byGroup.get(group)!;
      const total = h.reduce((a, b) => a + b, 0);
      let cum = 0;
      h.forEach((c, i) => {
        cum += c;
        const x = i * BIN;
        if (x >= xmin - 1e-9 && x <= xmax + 1e-9) {
          rows.push({ group, genotype: group.split(" ")[0], x, y: search.dist === "ecdf" ? cum / total : c / total });
        }
      });
    }
    return rows;
  }, [subjects, mask, search.dist, basis, xmin, xmax]);

  const options = useMemo<Plot.PlotOptions>(() => {
    const ecdf = search.dist === "ecdf";
    const bands =
      basis === "inact"
        ? [
            { x1: xmin, x2: w, fill: STATE_COLORS[2], label: "A" },
            { x1: w, x2: q, fill: STATE_COLORS[1], label: "U" },
            { x1: q, x2: xmax, fill: STATE_COLORS[0], label: "Q" },
          ]
        : [
            { x1: xmin, x2: q, fill: STATE_COLORS[0], label: "Q" },
            { x1: q, x2: w, fill: STATE_COLORS[1], label: "U" },
            { x1: w, x2: xmax, fill: STATE_COLORS[2], label: "A" },
          ];
    return {
      height: 240,
      marginLeft: 40,
      x: { domain: [xmin, xmax], label: BASIS_LABEL[basis], tickFormat: (v: number) => `${Math.round(v * 100)}%`, ticks: 10 },
      y: ecdf
        ? { domain: [0, 1], label: "cumulative share of bins", grid: true, tickFormat: "%" }
        : { type: "sqrt", label: "share of bins (sqrt)", grid: true, tickFormat: ".0%" },
      marks: [
        Plot.rect(bands, { x1: "x1", x2: "x2", fill: "fill", fillOpacity: 0.18 }),
        Plot.ruleX([q, w], { stroke: "#334155", strokeDasharray: "3,2" }),
        ...[false, true].map((female) =>
          Plot.line(
            curves.filter((d) => d.group.endsWith(" F") === female),
            {
              x: "x",
              y: "y",
              z: "group",
              stroke: (d) => genotypeColor(d.genotype),
              strokeWidth: 1.4,
              strokeDasharray: female ? "4,2" : undefined,
              curve: ecdf ? "step-after" : "linear",
            },
          ),
        ),
        Plot.tip(curves, Plot.pointerX({ x: "x", y: "y", title: (d) => `${d.group}\n${(d.x * 100).toFixed(1)}%: ${(d.y * 100).toFixed(1)}%` })),
      ],
    };
  }, [curves, basis, q, w, xmin, xmax, search.dist]);

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {basis === "inact" ? "Inactivity" : "Activity"} distribution <MethodNote id="states" />
        </span>
      }
      aside={
        <Segmented
          value={search.dist}
          onChange={(dist) => setSearch({ dist })}
          options={[
            { value: "hist", label: "Density" },
            { value: "ecdf", label: "Cumulative" },
          ]}
        />
      }
    >
      <PlotFigure options={options} />
      <Legend
        className="mt-1"
        items={[
          ...groupLineItems(sortGroups(curves.map((c) => c.group))),
          ...STATE_LABELS.map((l, i): LegendItem => ({ kind: "swatch", color: STATE_COLORS[i], opacity: 0.18, label: `${l} band` })).filter(
            (_, i) => !search.noU || i !== UNDEFINED,
          ),
          { kind: "line", color: "#334155", dashed: true, label: search.noU ? "threshold" : "thresholds" },
        ]}
      />
    </Panel>
  );
}

function StateRaster({ view }: { view: View }) {
  const { subjects, schedule, mask, search, flags } = view;
  const s = schedule!;
  const { basis, q, w } = thresholds(search);
  const options = useMemo<Plot.PlotOptions>(() => {
    const binH = s.binMin / 60;
    const lightRow = "Lights";
    const cells: { y: string; x1: number; x2: number; fill: string; title: string }[] = [];
    for (let i = 0; i < s.nSlots; i++) {
      const votes = subjects.map((sub) => sub.series.light[i]).filter((v) => v != null) as number[];
      const lit = votes.length ? votes.filter((v) => v === 1).length / votes.length >= 0.5 : null;
      if (lit != null) cells.push({ y: lightRow, x1: i * binH, x2: (i + 1) * binH, fill: lit ? LIGHT_COLOR : DARK_COLOR, title: lit ? "lux > 0" : "lux = 0" });
    }
    for (const sub of subjects) {
      const id = sub.mouse.Mouse_ID;
      sub.series[basis].forEach((a, i) => {
        const st = mask[i] ? classify(a, q, w, basis) : null;
        if (st == null) return;
        cells.push({
          y: id,
          x1: i * binH,
          x2: (i + 1) * binH,
          fill: STATE_COLORS[st],
          title: `${id} (${sub.group})\n${STATE_LABELS[st]}, ${basis === "inact" ? "inactivity" : "activity"} ${((a ?? 0) / 10).toFixed(1)}%`,
        });
      });
    }
    const ids = subjects.map((x) => x.mouse.Mouse_ID);
    const firstOfGroup = new Map<string, string>();
    const seen = new Set<string>();
    subjects.forEach((x) => {
      if (!seen.has(x.group)) firstOfGroup.set(x.mouse.Mouse_ID, x.group);
      seen.add(x.group);
    });
    const groupStarts = subjects.filter((x, i) => i > 0 && subjects[i - 1].group !== x.group).map((x) => x.mouse.Mouse_ID);
    return {
      height: Math.max(140, 34 + (ids.length + 1) * 5),
      marginLeft: 52,
      marginTop: 4,
      x: { domain: [0, (s.nSlots * s.binMin) / 60], ticks: d3Ticks(s), tickFormat: clockTick, label: null },
      y: {
        domain: [lightRow, ...ids],
        tickFormat: (id: string) => (id === lightRow ? "" : firstOfGroup.get(id) ?? ""),
        tickSize: 0,
        label: null,
        padding: 0,
      },
      marks: [
        Plot.barX(cells, { y: "y", x1: "x1", x2: "x2", fill: "fill", inset: 0 }),
        Plot.tickY(groupStarts, { y: (d) => d, stroke: "#ffffff", strokeWidth: 1.5, dy: -2.5 }),
        Plot.dot(
          ids.filter((id) => flags.has(id)),
          { y: (d) => d, x: 0, r: 1.8, fill: FLAG_COLOR, dx: -4 },
        ),
        Plot.tip(cells, Plot.pointer({ y: "y", x: (d) => (d.x1 + d.x2) / 2, title: "title" })),
      ],
    };
  }, [subjects, s, mask, basis, q, w, flags]);

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          State raster <MethodNote id="states" />
        </span>
      }
    >
      <PlotFigure options={options} />
      <Legend
        className="mt-1"
        items={[
          ...STATE_LABELS.map((l, i): LegendItem => ({ kind: "swatch", color: STATE_COLORS[i], label: l })).filter(
            (_, i) => !search.noU || i !== UNDEFINED,
          ),
          { kind: "swatch", color: LIGHT_COLOR, label: "top row: lights on (lux > 0)" },
          { kind: "swatch", color: DARK_COLOR, label: "lights off" },
          ...(subjects.some((x) => flags.has(x.mouse.Mouse_ID)) ? [{ kind: "dot", color: FLAG_COLOR, label: "QC-flagged mouse" } as LegendItem] : []),
        ]}
      />
    </Panel>
  );
}

const d3Ticks = (s: NonNullable<View["schedule"]>) => {
  const hours = (s.nSlots * s.binMin) / 60;
  return Array.from({ length: Math.floor(hours / 6) + 1 }, (_, i) => i * 6);
};

const Q_GRID = Array.from({ length: 20 }, (_, i) => +(0.01 * (i + 1)).toFixed(3));
const W_GRID = Array.from({ length: 16 }, (_, i) => +(0.05 + 0.025 * i).toFixed(3));
const T_GRID = Array.from({ length: 40 }, (_, i) => +(0.01 * (i + 1)).toFixed(3));

function Sensitivity({ view }: { view: View }) {
  const [open, setOpen] = useState(false);
  const setSearch = useSetSearch();
  const { subjects, mask, schedule, search, split } = view;
  const t = thresholds(search);
  const inact = t.basis === "inact";
  const single = search.noU;
  const available = METRICS.filter((m) => m.thresholded && !(single && m.id.startsWith("u_")));
  const metricId = available.some((m) => m.id === search.metric) ? search.metric : "q_dark";
  const def = METRIC_BY_ID[metricId];

  const cells = useMemo(() => {
    if (!open || !schedule) return [];
    const mirror = (grid: number[]) => (inact ? grid.map((v) => +(1 - v).toFixed(3)) : grid);
    const pairs: [number, number][] = single
      ? mirror(T_GRID).map((v) => [v, v])
      : mirror(Q_GRID).flatMap((q) => mirror(W_GRID).map((w): [number, number] => [q, w]));
    const out: { q: number; w: number; group: string; genotype: string; g: number; p: number }[] = [];
    for (const [q, w] of pairs) {
      if (!single && (inact ? w >= q : w <= q)) continue;
      const rows = subjects.map((s) => ({
        group: s.group,
        genotype: s.genotype,
        sex: s.sex,
        value: mouseStateMetrics(s.series, mask, schedule, { basis: t.basis, q, w })[metricId],
      }));
      for (const c of compareToWt(rows, split)) out.push({ q, w, group: c.group, genotype: c.genotype, g: c.g, p: c.p });
    }
    return out;
  }, [open, subjects, mask, schedule, metricId, split, inact, single, t.basis]);

  const options = useMemo<Plot.PlotOptions>(() => {
    const m = Math.max(0.5, ...cells.map((c) => Math.abs(c.g)).filter(Number.isFinite));
    const color = { type: "diverging", scheme: "PuOr", domain: [-m, m], legend: true, label: `Hedges' g vs Wt (${def.short})` } as const;
    if (single) {
      const dt = 0.005;
      return {
        height: 110,
        marginLeft: 44,
        marginBottom: 32,
        fx: { label: null, domain: sortGroups(cells.map((c) => c.group)) },
        x: { label: `threshold (${inact ? "inactivity" : "activity"})`, tickFormat: (v: number) => `${Math.round(v * 100)}%`, ticks: 5 },
        y: { axis: null, domain: [0, 1] },
        color,
        marks: [
          Plot.rect(cells, { fx: "group", x1: (d) => d.q - dt, x2: (d) => d.q + dt, y1: 0, y2: 1, fill: "g" }),
          Plot.dot(
            [...new Set(cells.map((c) => c.group))].map((group) => ({ group })),
            { fx: "group", x: () => t.q, y: 0.5, r: 4, stroke: "#0f172a", strokeWidth: 1.5 },
          ),
          Plot.tip(
            cells,
            Plot.pointerX({
              fx: "group",
              x: "q",
              y: 0.5,
              title: (d) => `${d.group}: threshold ${(d.q * 100).toFixed(0)}%\ng = ${fmt(d.g)}, ${pText(d.p)}`,
            }),
          ),
        ],
      };
    }
    const dq = 0.005;
    const dw = 0.0125;
    return {
      height: 260,
      marginLeft: 44,
      marginBottom: 32,
      fx: { label: null, domain: sortGroups(cells.map((c) => c.group)) },
      x: { label: `quiescent threshold q (${inact ? "inactivity" : "activity"})`, tickFormat: (v: number) => `${Math.round(v * 100)}%`, ticks: 5 },
      y: { label: `awake threshold w (${inact ? "inactivity" : "activity"})`, tickFormat: (v: number) => `${Math.round(v * 100)}%`, ticks: 5 },
      color,
      marks: [
        Plot.rect(cells, { fx: "group", x1: (d) => d.q - dq, x2: (d) => d.q + dq, y1: (d) => d.w - dw, y2: (d) => d.w + dw, fill: "g" }),
        Plot.dot(
          [...new Set(cells.map((c) => c.group))].map((group) => ({ group })),
          { fx: "group", x: () => t.q, y: () => t.w, r: 4, stroke: "#0f172a", strokeWidth: 1.5 },
        ),
        Plot.tip(
          cells,
          Plot.pointer({
            fx: "group",
            x: "q",
            y: "w",
            title: (d) => `${d.group}: q ${(d.q * 100).toFixed(0)}%, w ${(d.w * 100).toFixed(1)}%\ng = ${fmt(d.g)}, ${pText(d.p)}`,
          }),
        ),
      ],
    };
  }, [cells, t.q, t.w, inact, single, def.short]);

  const onPick = useCallback((v: unknown) => {
    const d = v as { q: number; w: number };
    if (d?.q == null) return;
    if (single) setSearch(inact ? { ti: d.q } : { t: d.q });
    else setSearch(inact ? { qi: d.q, wi: d.w } : { q: d.q, w: d.w });
  }, [setSearch, inact, single]);

  return (
    <details className="panel rounded-md border border-slate-200 bg-white p-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-600">
        <span className="text-slate-400">{open ? "\u25be" : "\u25b8"}</span> Threshold sensitivity
        <MethodNote id="sensitivity" />
        <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
          {def.label}
          {!METRIC_BY_ID[search.metric]?.thresholded && " (select a state metric above to change)"}
        </span>
        <select
          className="no-print ml-auto rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] font-normal normal-case"
          value={metricId}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setSearch({ metric: e.target.value })}
        >
          {available.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </summary>
      {open &&
        (cells.length ? (
          <>
            <PlotFigure options={options} onPick={onPick} className="mt-2" />
            <Legend
              className="mt-1"
              items={[{ kind: "ring", color: "#0f172a", label: `current ${single ? "threshold" : "thresholds"} (click a cell to apply)` }]}
            />
          </>
        ) : (
          <Empty>Needs Wt and at least one other genotype.</Empty>
        ))}
    </details>
  );
}
