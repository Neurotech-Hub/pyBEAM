import { useQueries, useQuery } from "@tanstack/react-query";
import type { CohortSeries, DataIndex, Mouse, QcRow } from "./types";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

const forever = { staleTime: Infinity, gcTime: Infinity } as const;

export const useIndex = () => useQuery({ queryKey: ["index"], queryFn: () => getJson<DataIndex>("index.json"), ...forever });
export const useMice = () => useQuery({ queryKey: ["mice"], queryFn: () => getJson<Mouse[]>("mice.json"), ...forever });
export const useQc = () => useQuery({ queryKey: ["qc"], queryFn: () => getJson<QcRow[]>("qc.json"), ...forever });

const seriesQuery = (cohort: string) => ({
  queryKey: ["series", cohort],
  queryFn: () => getJson<CohortSeries>(`series/${cohort}.json`),
  ...forever,
});

export const useCohortSeries = (cohort: string | undefined) =>
  useQuery({ ...seriesQuery(cohort ?? ""), enabled: !!cohort });

/** Load every cohort's series (for cross-cohort views). Returns undefined until all are loaded. */
export function useAllSeries(cohorts: string[]): Record<string, CohortSeries> | undefined {
  return useQueries({
    queries: cohorts.map(seriesQuery),
    combine: (results) =>
      results.some((r) => !r.data)
        ? undefined
        : Object.fromEntries(results.map((r) => [r.data!.cohort, r.data!])),
  });
}
