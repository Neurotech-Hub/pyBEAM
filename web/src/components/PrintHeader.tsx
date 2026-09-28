import type { View } from "../state/view";

/** Shown only when printing: the active filters so an exported page is self-describing. */
export function PrintHeader({ view, title }: { view: View; title: string }) {
  const { search, cohortInfo, index, subjects } = view;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const items = [
    search.tab !== "across" && cohortInfo && ["Cohort", `${cohortInfo.cohort} (${cohortInfo.gene})`],
    search.tab !== "across" && ["Genotypes", search.geno || "all"],
    ["Sex", search.sex],
    ["Hom/Hemi as KO", search.collapseKo ? "collapsed" : "separate"],
    ["Days", search.days],
    ["Key exclusions", search.excl ? "applied" : "not applied"],
    ["Quiescent", `\u2264 ${pct(search.q)}`],
    ["Awake", `\u2265 ${pct(search.w)}`],
    search.tab !== "across" && ["Mice", String(subjects.length)],
    index && ["Box data", index.box_updated],
  ].filter(Boolean) as [string, string][];
  return (
    <div className="print-only hidden border-b border-slate-300 px-4 py-2 text-[10px]">
      <div className="text-[13px] font-semibold">BEAM sleep &amp; circadian explorer: {title}</div>
      <div className="mt-0.5 flex flex-wrap gap-x-4">
        {items.map(([k, v]) => (
          <span key={k}>
            <span className="text-slate-500">{k}:</span> {v}
          </span>
        ))}
      </div>
      <div className="mt-0.5 break-all text-slate-500">{window.location.href}</div>
    </div>
  );
}
