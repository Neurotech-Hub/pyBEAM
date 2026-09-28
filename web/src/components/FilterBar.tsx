import { displayGenotypeCounts } from "../analysis/select";
import { parseGeno, type Search } from "../state/search";
import { useSetSearch } from "../state/route";
import type { View } from "../state/view";
import { genotypeColor, sortGenotypes } from "../theme";
import { Segmented } from "./ui";
import { ThresholdControl } from "./ThresholdControl";

export function FilterBar({ view }: { view: View }) {
  const { search, index, cohort, cohortInfo } = view;
  const setSearch = useSetSearch();
  const genotypeChips = displayGenotypeCounts(cohortInfo?.genotypes ?? {}, search.collapseKo);
  const genotypes = genotypeChips.map((c) => c.genotype);
  const selected = parseGeno(search.geno);
  const isOn = (g: string) => !selected.length || selected.includes(g);

  const toggleGeno = (g: string) => {
    const current = selected.length ? selected : genotypes;
    const next = current.includes(g) ? current.filter((x) => x !== g) : [...current, g];
    setSearch({ geno: next.length === genotypes.length || !next.length ? "" : sortGenotypes(next).join(",") });
  };

  const showCohort = search.tab !== "across";
  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur">
      {showCohort && (
        <label className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Cohort</span>
          <select
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[12px]"
            value={cohort}
            onChange={(e) => setSearch({ cohort: e.target.value, geno: "" }, { push: true })}
          >
            {index?.cohorts.map((c) => (
              <option key={c.cohort} value={c.cohort} disabled={!c.has_series}>
                {c.number} {c.gene} ({c.n_with_data}){c.has_series ? "" : " \u2013 no L1"}
              </option>
            ))}
          </select>
        </label>
      )}
      {showCohort && genotypes.length > 0 && (
        <div className="flex items-center gap-1">
          {genotypeChips.map(({ genotype: g, n }) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGeno(g)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                isOn(g) ? "border-slate-400 bg-white text-slate-800" : "border-slate-200 bg-slate-100 text-slate-400"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: isOn(g) ? genotypeColor(g) : "#cbd5e1" }} />
              {g} <span className="text-slate-400">{n}</span>
            </button>
          ))}
        </div>
      )}
      <Segmented<Search["sex"]>
        label="Sex"
        value={search.sex}
        onChange={(sex) => setSearch({ sex })}
        options={[
          { value: "all", label: "All" },
          { value: "M", label: "M" },
          { value: "F", label: "F" },
          { value: "split", label: "Split", title: "Compare within sex" },
        ]}
      />
      <label
        className="flex items-center gap-1 text-[11px] text-slate-600"
        title="Pool Hom and Hemi as full knockouts (KO) for plots and comparisons"
      >
        <input
          type="checkbox"
          checked={search.collapseKo}
          onChange={(e) => setSearch({ collapseKo: e.target.checked, geno: "" })}
        />
        Collapse Hom/Hemi as KO
      </label>
      <label className="flex items-center gap-1 text-[11px] text-slate-600" title="Drop mice whose key Autoexcluder starts with 'Exclude'">
        <input type="checkbox" checked={search.excl} onChange={(e) => setSearch({ excl: e.target.checked })} />
        Apply key exclusions
      </label>
      <div className="ml-auto">
        <ThresholdControl />
      </div>
    </div>
  );
}
