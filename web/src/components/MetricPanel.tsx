import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { METRIC_BY_ID } from "../analysis/metrics";
import { compareToWt, groupStats, sortGroups, type Valued } from "../analysis/select";
import { useSetSearch } from "../state/route";
import type { View } from "../state/view";
import { FLAG_COLOR, genotypeColor } from "../theme";
import { Legend, genotypeDotItems, type LegendItem } from "./Legend";
import { PlotFigure } from "./PlotFigure";
import { fmt, pText } from "./ui";

/** Deterministic jitter in [-0.18, 0.18] from a string. */
function jitter(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 0.36;
}

const digitsFor = (unit: string) => (unit === "fraction" ? 3 : unit === "% time" ? 1 : 2);

function MetricCell({ view, id, domain }: { view: View; id: string; domain?: [number, number] }) {
  const def = METRIC_BY_ID[id];
  const setSearch = useSetSearch();
  const { subjects, metrics, split, flags, search } = view;

  const rows = useMemo(
    () =>
      subjects.map((s, i) => ({
        group: s.group,
        genotype: s.genotype,
        sex: s.sex,
        value: metrics[i][id],
        mouse: s.mouse.Mouse_ID,
        flagged: flags.has(s.mouse.Mouse_ID),
      })),
    [subjects, metrics, id, flags],
  );
  const groups = useMemo(() => sortGroups(rows.map((r) => r.group)), [rows]);
  const stats = useMemo(() => groupStats(rows as Valued[]), [rows]);
  const comps = useMemo(() => compareToWt(rows as Valued[], split), [rows, split]);

  const options = useMemo<Plot.PlotOptions>(() => {
    const gi = (g: string) => groups.indexOf(g);
    const pts = rows.filter((r) => Number.isFinite(r.value)).map((r) => ({ ...r, x: gi(r.group) + jitter(r.mouse) - 0.12 }));
    const summary = stats.map((s) => ({ ...s, x: gi(s.group) + 0.22 }));
    return {
      height: 150,
      marginLeft: 36,
      marginBottom: split ? 32 : 22,
      marginTop: 6,
      x: {
        domain: [-0.5, groups.length - 0.5],
        ticks: groups.map((_, i) => i),
        tickFormat: (i: number) => (groups[i] ?? "").replace(" ", "\n"),
        label: null,
        tickSize: 0,
      },
      y: { label: null, grid: true, nice: true, ticks: 4, ...(domain ? { domain } : {}) },
      marks: [
        Plot.dot(pts, {
          x: "x",
          y: "value",
          r: 2.2,
          fill: (d) => genotypeColor(d.genotype),
          fillOpacity: 0.75,
          stroke: (d) => (d.flagged ? FLAG_COLOR : "none"),
          strokeWidth: 1,
        }),
        Plot.ruleX(summary, { x: "x", y1: (d) => d.mean - d.sem, y2: (d) => d.mean + d.sem, stroke: "#0f172a" }),
        Plot.ruleY(summary, { x1: (d) => d.x - 0.08, x2: (d) => d.x + 0.08, y: "mean", stroke: "#0f172a", strokeWidth: 2 }),
        Plot.tip(
          pts,
          Plot.pointer({
            x: "x",
            y: "value",
            title: (d) => `${d.mouse}\n${d.group}: ${fmt(d.value, digitsFor(def.unit))}${d.flagged ? "\nQC flag" : ""}`,
          }),
        ),
      ],
    };
  }, [rows, groups, stats, def.unit, split]);

  const active = search.metric === id;
  return (
    <div className={`rounded border p-1.5 ${active ? "border-slate-500 bg-slate-50" : "border-transparent"}`}>
      <button
        type="button"
        onClick={() => setSearch({ metric: id })}
        className="mb-0.5 block w-full truncate text-left text-[11px] font-medium text-slate-700 hover:underline"
        title="Use this metric for the sensitivity map and across-cohort view"
      >
        {def.label} <span className="font-normal text-slate-400">{def.unit}</span>
      </button>
      <PlotFigure options={options} />
      <div className="mt-0.5 space-y-px font-mono text-[10px] leading-tight">
        {comps.length === 0 && <div className="text-slate-400">no Wt comparison</div>}
        {comps.map((c) => (
          <div key={c.group} title={`${c.group} (n=${c.n}) vs ${c.ref} (n=${c.nRef}); Hedges' g with 95% CI, Mann-Whitney p`}>
            <span style={{ color: genotypeColor(c.genotype) }}>{c.group}</span>{" "}
            <span className="text-slate-600">
              g={fmt(c.g)} {pText(c.p)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricLegend({ view }: { view: View }) {
  const anyFlagged = view.subjects.some((s) => view.flags.has(s.mouse.Mouse_ID));
  const items: LegendItem[] = [
    ...genotypeDotItems(view.subjects.map((s) => s.genotype)).map((it) => ({ ...it, label: <>{it.label} mouse</> })),
    ...(anyFlagged ? [{ kind: "dot", color: "#cbd5e1", stroke: FLAG_COLOR, label: "QC-flagged mouse" } as LegendItem] : []),
    { kind: "meanSem", label: "group mean ± SEM" },
  ];
  return <Legend items={items} className="mb-1" />;
}

export function MetricPanel({ view, ids, domain }: { view: View; ids: string[]; domain?: [number, number] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-1">
      {ids.map((id) => (
        <MetricCell key={id} view={view} id={id} domain={domain} />
      ))}
    </div>
  );
}
