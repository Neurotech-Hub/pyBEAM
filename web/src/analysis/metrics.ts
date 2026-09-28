import { circadianMetrics } from "./circadian";
import { classifySeries, stateMetrics } from "./states";
import type { Schedule } from "./time";

export type MetricGroup = "states" | "circadian";

export interface MetricDef {
  id: string;
  label: string;
  short: string;
  unit: string;
  group: MetricGroup;
  /** Whether the metric depends on the q/w thresholds. */
  thresholded: boolean;
}

const statePhase = (state: string, phase: string, short: string): MetricDef => ({
  id: `${state[0].toLowerCase()}_${phase}`,
  label: `${state} (${phase === "all" ? "24 h" : phase})`,
  short,
  unit: "% time",
  group: "states",
  thresholded: true,
});

export const METRICS: MetricDef[] = [
  statePhase("Quiescent", "light", "Q light"),
  statePhase("Quiescent", "dark", "Q dark"),
  statePhase("Quiescent", "all", "Q 24h"),
  statePhase("Undefined", "light", "U light"),
  statePhase("Undefined", "dark", "U dark"),
  statePhase("Undefined", "all", "U 24h"),
  statePhase("Awake", "light", "A light"),
  statePhase("Awake", "dark", "A dark"),
  statePhase("Awake", "all", "A 24h"),
  { id: "q_bouts", label: "Quiescent bouts per day", short: "Q bouts/d", unit: "bouts/24 h", group: "states", thresholded: true },
  { id: "q_bout_len", label: "Mean quiescent bout", short: "Q bout len", unit: "min", group: "states", thresholded: true },
  { id: "mean_act", label: "Mean activity", short: "Mean act", unit: "fraction", group: "circadian", thresholded: false },
  { id: "dark_frac", label: "Activity in dark phase", short: "Dark frac", unit: "fraction", group: "circadian", thresholded: false },
  { id: "mesor", label: "Cosinor MESOR", short: "MESOR", unit: "fraction", group: "circadian", thresholded: false },
  { id: "amplitude", label: "Cosinor amplitude", short: "Amplitude", unit: "fraction", group: "circadian", thresholded: false },
  { id: "acrophase", label: "Cosinor acrophase", short: "Acrophase", unit: "ZT h", group: "circadian", thresholded: false },
  { id: "r2", label: "Cosinor R\u00b2", short: "R\u00b2", unit: "", group: "circadian", thresholded: false },
  { id: "m10", label: "M10 (most active 10 h)", short: "M10", unit: "fraction", group: "circadian", thresholded: false },
  { id: "l5", label: "L5 (least active 5 h)", short: "L5", unit: "fraction", group: "circadian", thresholded: false },
  { id: "ra", label: "Relative amplitude", short: "RA", unit: "", group: "circadian", thresholded: false },
  { id: "iv", label: "Intradaily variability", short: "IV", unit: "", group: "circadian", thresholded: false },
];

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]));

/** Compute every metric for one mouse. */
export function mouseMetrics(act: (number | null)[], mask: boolean[], s: Schedule, q: number, w: number) {
  const st = stateMetrics(classifySeries(act, q, w), mask, s);
  const c = circadianMetrics(act, mask, s);
  return {
    ...stateValues(st),
    mean_act: c.meanAct,
    dark_frac: c.darkFrac,
    mesor: c.mesor,
    amplitude: c.amplitude,
    acrophase: c.acrophase,
    r2: c.r2,
    m10: c.m10,
    l5: c.l5,
    ra: c.ra,
    iv: c.iv,
  } as Record<string, number>;
}

export function stateValues(st: ReturnType<typeof stateMetrics>): Record<string, number> {
  const out: Record<string, number> = {};
  (["light", "dark", "all"] as const).forEach((phase) => {
    ["q", "u", "a"].forEach((k, i) => (out[`${k}_${phase}`] = st.pct[phase][i]));
  });
  out.q_bouts = st.qBoutsPerDay;
  out.q_bout_len = st.qBoutMeanMin;
  return out;
}

/** Only the threshold-dependent metrics (cheaper; used for the sensitivity sweep). */
export const mouseStateMetrics = (act: (number | null)[], mask: boolean[], s: Schedule, q: number, w: number) =>
  stateValues(stateMetrics(classifySeries(act, q, w), mask, s));
