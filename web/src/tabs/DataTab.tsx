import { useMemo, useState } from "react";
import { isExcluded } from "../analysis/select";
import { Badge, Panel } from "../components/ui";
import type { QcRow } from "../data/types";
import { useSetSearch } from "../state/route";
import type { View } from "../state/view";
import { GENOTYPE_ORDER, genotypeColor } from "../theme";

const th = "border-b border-slate-200 px-1.5 py-1 text-left font-medium text-slate-500 whitespace-nowrap";
const td = "border-b border-slate-100 px-1.5 py-0.5 whitespace-nowrap";

export function DataTab({ view }: { view: View }) {
  return (
    <div className="space-y-3">
      <CohortSummary view={view} />
      <MouseTable view={view} />
      <QcTable view={view} />
    </div>
  );
}

function CohortSummary({ view }: { view: View }) {
  const { index, mice, qc, cohort } = view;
  const setSearch = useSetSearch();
  const genotypes = GENOTYPE_ORDER.filter((g) => mice.some((m) => m.Genotype === g));
  const rows = (index?.cohorts ?? []).map((c) => {
    const ms = mice.filter((m) => m.cohort === c.cohort);
    const warn = qc.filter((r) => r.cohort === c.cohort && r.level !== "info").length;
    return { c, ms, warn, excluded: ms.filter(isExcluded).length };
  });
  return (
    <Panel title="Cohorts" aside="Counts are mice with L1 data. Click a row to select the cohort.">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className={th}>Cohort</th>
            <th className={th}>Gene</th>
            <th className={th}>In key</th>
            <th className={th}>With data</th>
            {genotypes.map((g) => (
              <th key={g} className={th} style={{ color: genotypeColor(g) }}>
                {g} (M/F)
              </th>
            ))}
            <th className={th}>Key excluded</th>
            <th className={th}>QC warnings</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, ms, warn, excluded }) => (
            <tr
              key={c.cohort}
              onClick={() => c.has_series && setSearch({ cohort: c.cohort, geno: "" })}
              className={`${c.has_series ? "cursor-pointer hover:bg-slate-50" : "text-slate-400"} ${c.cohort === cohort ? "bg-slate-100" : ""}`}
            >
              <td className={`${td} font-mono`}>{c.cohort}</td>
              <td className={td}>{c.gene}</td>
              <td className={td}>{c.n_mice}</td>
              <td className={td}>{c.n_with_data}</td>
              {genotypes.map((g) => {
                const d = ms.filter((m) => m.has_data && m.Genotype === g);
                return (
                  <td key={g} className={td}>
                    {d.length ? `${d.length} (${d.filter((m) => m.Sex === "M").length}/${d.filter((m) => m.Sex === "F").length})` : ""}
                  </td>
                );
              })}
              <td className={td}>{excluded || ""}</td>
              <td className={td}>{warn ? <Badge>{warn}</Badge> : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function MouseTable({ view }: { view: View }) {
  const { mice, cohort, flags } = view;
  const [text, setText] = useState("");
  const rows = mice
    .filter((m) => m.cohort === cohort)
    .filter((m) => !text || Object.values(m).some((v) => String(v).toLowerCase().includes(text.toLowerCase())));
  const cols: [string, (m: (typeof mice)[number]) => React.ReactNode][] = [
    ["Mouse_ID", (m) => <span className="font-mono">{m.Mouse_ID}</span>],
    ["Genotype", (m) => <span style={{ color: genotypeColor(m.Genotype) }}>{m.Genotype}</span>],
    ["Sex", (m) => m.Sex],
    ["BEAM", (m) => m.BEAM],
    ["DOB", (m) => m.DOB],
    ["Autoexcluder", (m) => (isExcluded(m) ? <Badge>{m.Autoexcluder}</Badge> : m.Autoexcluder)],
    ["Data", (m) => (m.has_data ? `${m.n_rows} rows` : <Badge tone="slate">none</Badge>)],
    ["Start", (m) => m.start_time],
    ["End", (m) => m.end_time],
    ["Lights on/off", (m) => (m.lights_on_detected ? `${m.lights_on_detected}\u2013${m.lights_off_detected}` : "")],
    [
      "QC",
      (m) =>
        flags.has(m.Mouse_ID) ? (
          <Badge tone="red" title={flags.get(m.Mouse_ID)!.map((r) => `${r.check}: ${r.detail}`).join("\n")}>
            {flags.get(m.Mouse_ID)!.map((r) => r.check).join(", ")}
          </Badge>
        ) : (
          ""
        ),
    ],
  ];
  return (
    <Panel
      title={`Mice: ${cohort}`}
      aside={
        <input
          className="no-print rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
          placeholder="Filter"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      }
    >
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-white">
            <tr>
              {cols.map(([h]) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.Mouse_ID} className={m.has_data ? "" : "text-slate-400"}>
                {cols.map(([h, f]) => (
                  <td key={h} className={td}>
                    {f(m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function QcTable({ view }: { view: View }) {
  const { qc, cohort } = view;
  const [level, setLevel] = useState<"" | QcRow["level"]>("");
  const [check, setCheck] = useState("");
  const [onlyCohort, setOnlyCohort] = useState(false);
  const checks = useMemo(() => [...new Set(qc.map((r) => r.check))].sort(), [qc]);
  const rows = qc.filter((r) => (!level || r.level === level) && (!check || r.check === check) && (!onlyCohort || r.cohort === cohort));
  const counts = useMemo(() => {
    const m = new Map<string, { level: string; n: number }>();
    qc.forEach((r) => m.set(r.check, { level: r.level, n: (m.get(r.check)?.n ?? 0) + 1 }));
    return [...m.entries()].sort((a, b) => a[1].level.localeCompare(b[1].level) || b[1].n - a[1].n);
  }, [qc]);
  const tone = (l: string) => (l === "error" ? "red" : l === "warning" ? "amber" : "slate") as "red" | "amber" | "slate";

  return (
    <Panel
      title="Pipeline QC report"
      aside={
        <span className="no-print flex items-center gap-2">
          <select className="rounded border border-slate-300 px-1 py-0.5" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="">all levels</option>
            <option value="error">error</option>
            <option value="warning">warning</option>
            <option value="info">info</option>
          </select>
          <select className="rounded border border-slate-300 px-1 py-0.5" value={check} onChange={(e) => setCheck(e.target.value)}>
            <option value="">all checks</option>
            {checks.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={onlyCohort} onChange={(e) => setOnlyCohort(e.target.checked)} />
            {cohort} only
          </label>
        </span>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        {counts.map(([c, { level: l, n }]) => (
          <button key={c} type="button" onClick={() => setCheck(check === c ? "" : c)} className="no-print">
            <Badge tone={tone(l)}>
              {c} {n}
            </Badge>
          </button>
        ))}
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-white">
            <tr>
              {["Level", "Check", "Cohort", "Mouse", "Source", "Detail"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={td}>
                  <Badge tone={tone(r.level)}>{r.level}</Badge>
                </td>
                <td className={td}>{r.check}</td>
                <td className={`${td} font-mono`}>{r.cohort}</td>
                <td className={`${td} font-mono`}>{r.mouse_id}</td>
                <td className={`${td} max-w-[260px] truncate`} title={r.source}>
                  {r.source}
                </td>
                <td className={`${td} whitespace-normal`}>{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
