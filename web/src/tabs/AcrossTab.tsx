import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { METRIC_BY_ID, METRICS, mouseMetrics, mouseStateMetrics } from "../analysis/metrics";
import { compareToWt, selectSubjects, type Comparison } from "../analysis/select";
import { useAllSeries } from "../data/load";
import { Legend, genotypeDotItems } from "../components/Legend";
import { MethodNote } from "../components/MethodNote";
import { PlotFigure } from "../components/PlotFigure";
import { Empty, Panel, fmt, pText } from "../components/ui";
import { useSetSearch } from "../state/route";
import type { View } from "../state/view";
import { genotypeColor } from "../theme";

interface Row extends Comparison {
  cohort: string;
  label: string;
}

export function AcrossTab({ view }: { view: View }) {
  const { index, mice, search, schedule, mask, split } = view;
  const setSearch = useSetSearch();
  const cohorts = useMemo(() => (index?.cohorts ?? []).filter((c) => c.has_series), [index]);
  const all = useAllSeries(cohorts.map((c) => c.cohort));
  const def = METRIC_BY_ID[search.metric] ?? METRIC_BY_ID.q_dark;

  const rows = useMemo<Row[]>(() => {
    if (!all || !schedule) return [];
    const out: Row[] = [];
    for (const c of cohorts) {
      const subjects = selectSubjects(mice, all[c.cohort], search, c.cohort, { ignoreGeno: true });
      const values = subjects.map((s) => ({
        group: s.group,
        genotype: s.genotype,
        sex: s.sex,
        value: (def.thresholded ? mouseStateMetrics : mouseMetrics)(s.series.act, mask, schedule, search.q, search.w)[def.id],
      }));
      for (const cmp of compareToWt(values, split)) {
        out.push({ ...cmp, cohort: c.cohort, label: `${c.number} ${c.gene} \u00b7 ${cmp.group}` });
      }
    }
    return out;
  }, [all, cohorts, mice, search, schedule, mask, split, def]);

  const options = useMemo<Plot.PlotOptions>(() => {
    const lim = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.lo), Math.abs(r.hi)]).filter(Number.isFinite));
    return {
      height: 30 + rows.length * 15,
      marginLeft: 170,
      marginRight: 150,
      x: { domain: [-lim, lim], label: `Hedges' g vs Wt: ${def.label}`, grid: true, nice: true },
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
            title: (d) =>
              `${d.label}\n${d.group} ${fmt(d.mean, 3)} (n=${d.n}) vs ${d.ref} ${fmt(d.mean - d.delta, 3)} (n=${d.nRef})\ng = ${fmt(d.g)} [${fmt(d.lo)}, ${fmt(d.hi)}], ${pText(d.p)}`,
          }),
        ),
      ],
    };
  }, [rows, def]);

  return (
    <div className="space-y-3">
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            Genotype effects across cohorts <MethodNote id="stats" />
          </span>
        }
        aside={
          <select
            className="no-print rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[12px] text-slate-800"
            value={def.id}
            onChange={(e) => setSearch({ metric: e.target.value })}
          >
            {(["states", "circadian"] as const).map((g) => (
              <optgroup key={g} label={g === "states" ? "Quiescence (thresholded)" : "Circadian"}>
                {METRICS.filter((m) => m.group === g).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        }
      >
        <p className="mb-2 text-[11px] text-slate-500">
          Each row compares one genotype with Wt littermates in the same cohort (95% CI on g).
          {def.thresholded && " Updates with the state thresholds."} Sex, day, and exclusion filters apply; the genotype filter does not.
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
            <PlotFigure options={options} />
          </>
        ) : (
          <Empty>No comparisons available.</Empty>
        )}
      </Panel>
    </div>
  );
}
