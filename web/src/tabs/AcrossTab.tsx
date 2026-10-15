import * as Plot from "@observablehq/plot";
import { useCallback, useMemo } from "react";
import {
  METRIC_BY_ID,
  METRIC_GROUP_LABELS,
  METRICS,
  mouseGroupMetrics,
  type MetricDef,
  type MetricGroup,
} from "../analysis/metrics";
import { compareToWt, selectSubjects, type Comparison } from "../analysis/select";
import { useAllSeries } from "../data/load";
import { Legend, genotypeDotItems } from "../components/Legend";
import { MethodNote } from "../components/MethodNote";
import { PlotFigure } from "../components/PlotFigure";
import { Empty, Panel, Segmented, fmt, pText } from "../components/ui";
import { useSetSearch } from "../state/route";
import { thresholds, type Search, type Tab } from "../state/search";
import type { View } from "../state/view";
import { genotypeColor, sortGenotypes } from "../theme";

interface Row extends Comparison {
  cohort: string;
  metric: MetricDef;
  /** Cohort-genotype comparison label, e.g. "004 SHANK3B · KO". */
  comparison: string;
  /** Y-axis label within its plot: the comparison, or the metric label when grouped by comparison. */
  label: string;
}

interface Sub {
  key: string;
  title: string;
  rows: Row[];
}

const GROUPS: MetricGroup[] = ["states", "circadian", "ultradian"];
const SET_LABELS: Record<MetricGroup, string> = {
  states: "All quiescence metrics",
  circadian: "All circadian metrics",
  ultradian: "All ultradian metrics",
};
const TAB_FOR_GROUP: Record<MetricGroup, Tab> = { states: "quiescence", circadian: "circadian", ultradian: "ultradian" };
const TAB_NAMES: Record<MetricGroup, string> = { states: "Quiescence", circadian: "Circadian", ultradian: "Ultradian" };
const SET_PREFIX = "set:";

const last = (v: number) => (Number.isFinite(v) ? v : Infinity);

function forestOptions(rows: Row[], xLabel: string, lim: number, marginLeft: number): Plot.PlotOptions {
  return {
    height: 30 + rows.length * 15,
    marginLeft,
    marginRight: 150,
    x: { domain: [-lim, lim], label: xLabel, grid: true, nice: true },
    y: { domain: rows.map((r) => r.label), label: null, tickSize: 0 },
    marks: [
      Plot.ruleX([0], { stroke: "#64748b" }),
      Plot.ruleY(rows, { y: "label", x1: "lo", x2: "hi", stroke: (d) => genotypeColor(d.genotype), strokeWidth: 1.2 }),
      Plot.dot(rows, { y: "label", x: "g", r: 3.2, fill: (d) => genotypeColor(d.genotype), stroke: "white" }),
      Plot.text(rows, {
        y: "label",
        x: lim,
        dx: 8,
        textAnchor: "start",
        text: (d) => `n=${d.n}/${d.nRef}  g=${fmt(d.g)}  ${pText(d.p)}`,
        fill: "#475569",
        fontFamily: "ui-monospace, monospace",
      }),
      Plot.tip(
        rows,
        Plot.pointerY({
          y: "label",
          x: "g",
          title: (d: Row) =>
            `${d.comparison}\n${d.metric.label}\n${d.group} ${fmt(d.mean, 3)} (n=${d.n}) vs ${d.ref} ${fmt(d.mean - d.delta, 3)} (n=${d.nRef})\ng = ${fmt(d.g)} [${fmt(d.lo)}, ${fmt(d.hi)}], ${pText(d.p)}\nClick to open in ${TAB_NAMES[d.metric.group]}`,
        }),
      ),
    ],
  };
}

export function AcrossTab({ view }: { view: View }) {
  const { index, mice, search, schedule, mask, split } = view;
  const setSearch = useSetSearch();
  const cohorts = useMemo(() => (index?.cohorts ?? []).filter((c) => c.has_series), [index]);
  const all = useAllSeries(cohorts.map((c) => c.cohort));
  const def = METRIC_BY_ID[search.metric] ?? METRIC_BY_ID.q_dark;
  const multi = search.metricSet !== "one";
  const byComparison = multi && search.groupBy === "comparison";

  const shown = useMemo<MetricDef[]>(() => {
    if (search.metricSet === "one") return [def];
    if (search.metricSet === "all") return METRICS;
    return METRICS.filter((m) => m.group === search.metricSet);
  }, [search.metricSet, def]);

  const rows = useMemo<Row[]>(() => {
    if (!all || !schedule) return [];
    const groups = GROUPS.filter((g) => shown.some((m) => m.group === g));
    const out: Row[] = [];
    for (const c of cohorts) {
      const subjects = selectSubjects(mice, all[c.cohort], search, c.cohort, { ignoreGeno: true });
      const values = subjects.map((s) =>
        Object.assign({}, ...groups.map((g) => mouseGroupMetrics(g, s.series, mask, schedule, thresholds(search), search.udt))),
      ) as Record<string, number>[];
      for (const m of shown) {
        const valued = subjects.map((s, i) => ({ group: s.group, genotype: s.genotype, sex: s.sex, value: values[i][m.id] }));
        for (const cmp of compareToWt(valued, split)) {
          const comparison = `${c.number} ${c.gene} \u00b7 ${cmp.group}`;
          out.push({ ...cmp, cohort: c.cohort, metric: m, comparison, label: byComparison ? m.label : comparison });
        }
      }
    }
    return out;
  }, [all, cohorts, mice, search, schedule, mask, split, shown, byComparison]);

  const subs = useMemo<Sub[]>(() => {
    const map = new Map<string, Sub>();
    const keyed = byComparison
      ? rows.map((r) => [`${r.cohort}|${r.group}`, r.comparison, r] as const)
      : shown.flatMap((m) =>
          rows.filter((r) => r.metric === m).map((r) => [m.id, m.unit ? `${m.label} (${m.unit})` : m.label, r] as const),
        );
    for (const [key, title, r] of keyed) {
      if (!map.has(key)) map.set(key, { key, title, rows: [] });
      map.get(key)!.rows.push(r);
    }
    const out = [...map.values()];
    for (const s of out) {
      if (search.sort === "g") s.rows.sort((a, b) => last(-a.g) - last(-b.g));
      else if (search.sort === "p") s.rows.sort((a, b) => last(a.p) - last(b.p));
    }
    return out;
  }, [rows, shown, byComparison, search.sort]);

  const lim = useMemo(
    () => Math.max(1, ...rows.flatMap((r) => [Math.abs(r.lo), Math.abs(r.hi)]).filter(Number.isFinite)),
    [rows],
  );
  const xLabel = multi ? "Hedges' g vs Wt" : `Hedges' g vs Wt: ${def.label}`;
  const marginLeft = byComparison ? 240 : 170;
  const plots = useMemo(
    () => subs.map((s) => ({ ...s, options: forestOptions(s.rows, xLabel, lim, marginLeft) })),
    [subs, xLabel, lim, marginLeft],
  );

  const openRow = useCallback(
    (v: unknown) => {
      const r = v as Row;
      setSearch(
        {
          tab: TAB_FOR_GROUP[r.metric.group],
          cohort: r.cohort,
          geno: sortGenotypes(["Wt", r.genotype]).join(","),
          metric: r.metric.id,
        },
        { push: true },
      );
      window.scrollTo(0, 0);
    },
    [setSearch],
  );

  const selectValue = multi ? SET_PREFIX + search.metricSet : def.id;
  const onSelect = (value: string) => {
    if (value.startsWith(SET_PREFIX)) setSearch({ metricSet: value.slice(SET_PREFIX.length) as Search["metricSet"] });
    else setSearch({ metric: value, metricSet: "one" });
  };

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Segmented<Search["sort"]>
          label="Sort by"
          value={search.sort}
          onChange={(sort) => setSearch({ sort })}
          options={[
            { value: "subject", label: "Subject", title: "Cohort, then genotype" },
            { value: "g", label: "Hedges", title: "Hedges' g, largest first" },
            { value: "p", label: "P-value", title: "p, smallest first" },
          ]}
        />
        {multi && (
          <Segmented<Search["groupBy"]>
            label="Group by"
            value={search.groupBy}
            onChange={(groupBy) => setSearch({ groupBy })}
            options={[
              { value: "metric", label: "Metric", title: "One plot per metric; rows are cohort-genotype comparisons" },
              { value: "comparison", label: "Comparison", title: "One plot per cohort-genotype comparison; rows are metrics" },
            ]}
          />
        )}
        <select
          className="ml-auto rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[12px] text-slate-800"
          value={selectValue}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value={`${SET_PREFIX}all`}>All metrics</option>
          {GROUPS.map((g) => (
            <optgroup key={g} label={METRIC_GROUP_LABELS[g]}>
              <option value={SET_PREFIX + g}>{SET_LABELS[g]}</option>
              {METRICS.filter((m) => m.group === g).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            Genotype effects across cohorts <MethodNote id="stats" />
          </span>
        }
      >
        <p className="mb-2 text-[11px] text-slate-500">
          Each row compares one genotype with Wt littermates in the same cohort (95% CI on g).
          {shown.some((m) => m.thresholded) && " Updates with the state thresholds."}
          {shown.some((m) => m.group === "ultradian") &&
            ` Uses ${search.udt === "raw" ? "raw" : "block-detrended"} activity (set on the Ultradian tab).`}{" "}
          Sex, exclusion, and Hom/Hemi→KO collapse filters apply; the genotype filter does not. Click a row to open it on
          its tab.
        </p>
        {!all ? (
          <Empty>Loading all cohorts&hellip;</Empty>
        ) : rows.length ? (
          <>
            <Legend
              className="mb-1"
              items={[
                ...genotypeDotItems(rows.map((r) => r.genotype)).map((it) => ({ ...it, label: <>{it.label}: g</> })),
                { kind: "line", color: "#64748b", label: "95% CI" },
              ]}
            />
            <div className="space-y-3">
              {plots.map((p) => (
                <div key={p.key}>
                  <h3 className="text-[11px] font-semibold text-slate-600">{p.title}</h3>
                  <PlotFigure options={p.options} onPick={openRow} className="cursor-pointer" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty>No comparisons available.</Empty>
        )}
      </Panel>
    </div>
  );
}
