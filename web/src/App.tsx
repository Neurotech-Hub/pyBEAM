import { useEffect, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { MethodsPage } from "./components/MethodNote";
import { PrintHeader } from "./components/PrintHeader";
import { useSetSearch } from "./state/route";
import { TABS, type Tab } from "./state/search";
import { useView } from "./state/view";
import { AcrossTab } from "./tabs/AcrossTab";
import { CircadianTab } from "./tabs/CircadianTab";
import { DataTab } from "./tabs/DataTab";
import { QuiescenceTab } from "./tabs/QuiescenceTab";

const TAB_LABELS: Record<Tab, string> = {
  quiescence: "Quiescence",
  circadian: "Circadian",
  across: "Across cohorts",
  data: "Data & QC",
};

export default function App() {
  const view = useView();
  const setSearch = useSetSearch();
  const [copied, setCopied] = useState(false);
  const { search, index, cohort } = view;

  // Pin the resolved default cohort into the URL so shared links stay stable.
  useEffect(() => {
    if (!search.cohort && cohort) setSearch({ cohort });
  }, [search.cohort, cohort, setSearch]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const qcCount = view.qc.filter((r) => r.level !== "info").length;
  const isMethods = search.tab === "methods";
  const openMethods = () => {
    setSearch({ tab: "methods" }, { push: true });
    window.scrollTo(0, 0);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-[12px] text-slate-800">
      <header className="no-print flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="whitespace-nowrap text-[14px] font-semibold tracking-tight">
          BEAM <span className="font-normal text-slate-500">explorer</span>
        </h1>
        <nav className="flex gap-0.5">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSearch({ tab: t }, { push: true })}
              className={`whitespace-nowrap rounded px-2.5 py-1 text-[12px] ${
                search.tab === t ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {TAB_LABELS[t]}
              {t === "data" && qcCount > 0 && (
                <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">{qcCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 whitespace-nowrap text-[11px] text-slate-500">
          {index && <span title="Latest Box zip modification time">Last updated {index.box_updated.slice(0, 10)}</span>}
          <button type="button" onClick={copyLink} className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100">
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </header>
      {!isMethods && <FilterBar view={view} />}
      {!isMethods && <PrintHeader view={view} title={TAB_LABELS[search.tab as Tab]} />}
      <main className="flex-1 p-4">
        {isMethods ? (
          <MethodsPage />
        ) : view.error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{String(view.error)}</div>
        ) : view.loading || !view.schedule ? (
          <div className="py-10 text-center text-slate-400">Loading data&hellip;</div>
        ) : (
          <>
            {search.tab === "quiescence" && <QuiescenceTab view={view} />}
            {search.tab === "circadian" && <CircadianTab view={view} />}
            {search.tab === "across" && <AcrossTab view={view} />}
            {search.tab === "data" && <DataTab view={view} />}
          </>
        )}
      </main>
      <footer className="no-print px-4 pb-4 pt-2 text-center text-[11px] text-slate-400">
        by Matt Gaidica, PhD &bull;{" "}
        <a href="https://github.com/Neurotech-Hub/pyBEAM" target="_blank" rel="noreferrer" className="hover:text-slate-600 hover:underline">
          View GitHub Repo
        </a>{" "}
        &bull;{" "}
        <button type="button" onClick={openMethods} className="hover:text-slate-600 hover:underline">
          Methods
        </button>
      </footer>
    </div>
  );
}
