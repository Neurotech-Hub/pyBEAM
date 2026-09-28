import type { CohortSeries, Mouse, MouseSeries, QcRow } from "../data/types";
import type { Search } from "../state/search";
import { parseGeno } from "../state/search";
import { sortGenotypes } from "../theme";
import { hedgesG, mannWhitney, mean, sem } from "./stats";

export interface Subject {
  mouse: Mouse;
  series: MouseSeries;
  genotype: string;
  sex: string;
  /** Genotype, or "Genotype Sex" when sex is split. */
  group: string;
}

export const isExcluded = (m: Mouse) => /^exclude/i.test(m.Autoexcluder ?? "");

/** Mice in a cohort that pass the global filters and have series data. */
export function selectSubjects(
  mice: Mouse[],
  series: CohortSeries | undefined,
  search: Pick<Search, "geno" | "sex" | "excl">,
  cohort: string,
  opts: { ignoreGeno?: boolean } = {},
): Subject[] {
  if (!series) return [];
  const geno = opts.ignoreGeno ? [] : parseGeno(search.geno);
  const split = search.sex === "split";
  return mice
    .filter((m) => m.cohort === cohort && m.has_data && series.mice[m.Mouse_ID])
    .filter((m) => !geno.length || geno.includes(m.Genotype))
    .filter((m) => search.sex === "all" || split || m.Sex === search.sex)
    .filter((m) => !search.excl || !isExcluded(m))
    .map((m) => ({
      mouse: m,
      series: series.mice[m.Mouse_ID],
      genotype: m.Genotype,
      sex: m.Sex,
      group: split ? `${m.Genotype} ${m.Sex}` : m.Genotype,
    }))
    .sort((a, b) => groupOrder(a.group, b.group) || a.mouse.Mouse_ID.localeCompare(b.mouse.Mouse_ID));
}

export function groupOrder(a: string, b: string) {
  const [ga, sa = ""] = a.split(" ");
  const [gb, sb = ""] = b.split(" ");
  const order = sortGenotypes([ga, gb]);
  if (ga !== gb) return order[0] === ga ? -1 : 1;
  return sa.localeCompare(sb);
}

export const sortGroups = (groups: string[]) => [...new Set(groups)].sort(groupOrder);

export interface GroupStat {
  group: string;
  genotype: string;
  sex: string;
  n: number;
  mean: number;
  sem: number;
}

export interface Comparison extends GroupStat {
  ref: string;
  nRef: number;
  delta: number;
  g: number;
  lo: number;
  hi: number;
  p: number;
}

export interface Valued {
  group: string;
  genotype: string;
  sex: string;
  value: number;
}

export function groupStats(rows: Valued[]): GroupStat[] {
  return sortGroups(rows.map((r) => r.group)).map((group) => {
    const rs = rows.filter((r) => r.group === group);
    const v = rs.map((r) => r.value);
    return { group, genotype: rs[0].genotype, sex: rs[0].sex, n: v.filter(Number.isFinite).length, mean: mean(v), sem: sem(v) };
  });
}

/** Compare every non-Wt group to Wt (sex-matched when groups include sex). */
export function compareToWt(rows: Valued[], split: boolean): Comparison[] {
  const stats = groupStats(rows);
  const out: Comparison[] = [];
  for (const s of stats) {
    if (s.genotype === "Wt") continue;
    const refRows = rows.filter((r) => r.genotype === "Wt" && (!split || r.sex === s.sex));
    if (!refRows.length) continue;
    const a = rows.filter((r) => r.group === s.group).map((r) => r.value);
    const b = refRows.map((r) => r.value);
    const { g, lo, hi } = hedgesG(a, b);
    out.push({
      ...s,
      ref: split ? `Wt ${s.sex}` : "Wt",
      nRef: b.filter(Number.isFinite).length,
      delta: s.mean - mean(b),
      g,
      lo,
      hi,
      p: mannWhitney(a, b).p,
    });
  }
  return out;
}

/** Mouse ids with warning/error QC rows, mapped to their checks. */
export function qcFlags(qc: QcRow[]): Map<string, QcRow[]> {
  const map = new Map<string, QcRow[]>();
  for (const r of qc) {
    if (!r.mouse_id || r.level === "info" || r.check === "mouse_no_data") continue;
    map.set(r.mouse_id, [...(map.get(r.mouse_id) ?? []), r]);
  }
  return map;
}
