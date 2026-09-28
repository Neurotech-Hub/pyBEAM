import { useMemo } from "react";
import { mouseMetrics } from "../analysis/metrics";
import { qcFlags, selectSubjects } from "../analysis/select";
import { dayMask, makeSchedule } from "../analysis/time";
import { useCohortSeries, useIndex, useMice, useQc } from "../data/load";
import { useSearch } from "./route";

/** Everything a tab needs for the currently selected cohort and filters. */
export function useView() {
  const search = useSearch();
  const index = useIndex();
  const mice = useMice();
  const qc = useQc();

  const cohortList = index.data?.cohorts ?? [];
  const cohort = search.cohort || cohortList.find((c) => c.has_series)?.cohort || "";
  const cohortInfo = cohortList.find((c) => c.cohort === cohort);
  const series = useCohortSeries(cohortInfo?.has_series ? cohort : undefined);

  const schedule = useMemo(
    () => (index.data ? makeSchedule(index.data.bin_min, index.data.n_slots, index.data.lights_on, index.data.lights_off) : undefined),
    [index.data],
  );
  const mask = useMemo(() => (schedule ? dayMask(schedule, search.days) : []), [schedule, search.days]);
  const flags = useMemo(() => qcFlags(qc.data ?? []), [qc.data]);

  const subjects = useMemo(
    () => selectSubjects(mice.data ?? [], series.data, search, cohort),
    [mice.data, series.data, search.geno, search.sex, search.excl, cohort],
  );

  const metrics = useMemo(
    () => (schedule ? subjects.map((s) => mouseMetrics(s.series.act, mask, schedule, search.q, search.w)) : []),
    [subjects, mask, schedule, search.q, search.w],
  );

  const loading = index.isLoading || mice.isLoading || qc.isLoading || series.isLoading;
  const error = index.error || mice.error || qc.error || series.error;

  return {
    search,
    index: index.data,
    mice: mice.data ?? [],
    qc: qc.data ?? [],
    cohort,
    cohortInfo,
    schedule,
    mask,
    flags,
    subjects,
    metrics,
    loading,
    error,
    split: search.sex === "split",
  };
}

export type View = ReturnType<typeof useView>;
