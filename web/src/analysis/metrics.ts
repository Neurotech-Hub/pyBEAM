import { circadianMetrics } from "./circadian";
import { classifySeries, stateMetrics } from "./states";
import { BANDS, ultradianAnalysis, type UltradianMode } from "./ultradian";
import type { MouseSeries } from "../data/types";
import type { Thresholds } from "../state/search";
import type { Schedule } from "./time";

export type MetricGroup = "states" | "circadian" | "ultradian";

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

const PHASES = ["light", "dark", "all"] as const;
const phaseLabel = (p: (typeof PHASES)[number]) => (p === "all" ? "24 h" : p);
const bandLabel = ([lo, hi]: [number, number]) => `${lo}-${hi} h`;

/** Ultradian band-power metric id, e.g. "up_b2_dark" for 2-4 h power in the dark phase. */
export const bandId = (b: number, phase: (typeof PHASES)[number]) => `up_b${b + 1}_${phase}`;
export const periodId = (phase: (typeof PHASES)[number]) => `up_period_${phase}`;

const ULTRADIAN_METRICS: MetricDef[] = [
  ...BANDS.flatMap((band, b) =>
    PHASES.map((p): MetricDef => ({
      id: bandId(b, p),
      label: `Power ${bandLabel(band)} (${phaseLabel(p)})`,
      short: `P${bandLabel(band)} ${p === "all" ? "24h" : p}`,
      unit: "norm. power",
      group: "ultradian",
      thresholded: false,
    })),
  ),
  ...PHASES.map((p): MetricDef => ({
    id: periodId(p),
    label: `Dominant ultradian period (${phaseLabel(p)})`,
    short: `\u03c4 ${p === "all" ? "24h" : p}`,
    unit: "h",
    group: "ultradian",
    thresholded: false,
  })),
  { id: "up_sig", label: "Time with significant 2-8 h power", short: "Sig 2-8 h", unit: "fraction", group: "ultradian", thresholded: false },
  { id: "acf_lag", label: "Autocorrelation peak lag", short: "ACF lag", unit: "h", group: "ultradian", thresholded: false },
  { id: "acf_r", label: "Autocorrelation peak r", short: "ACF r", unit: "", group: "ultradian", thresholded: false },
  { id: "ls_period", label: "Lomb-Scargle peak period", short: "LS period", unit: "h", group: "ultradian", thresholded: false },
  { id: "ls_power", label: "Lomb-Scargle peak power", short: "LS power", unit: "norm. power", group: "ultradian", thresholded: false },
];

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
  { id: "qa_rate", label: "Quiescent-to-awake transition rate", short: "Q\u2192A rate", unit: "per h quiescent", group: "states", thresholded: true },
  { id: "a_bout_len", label: "Mean awake bout", short: "A bout len", unit: "min", group: "states", thresholded: true },
  { id: "ibi", label: "Median inter-bout interval (awake onsets)", short: "IBI", unit: "h", group: "states", thresholded: true },
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
  ...ULTRADIAN_METRICS,
];

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export const METRIC_GROUP_LABELS: Record<MetricGroup, string> = {
  states: "Quiescence (thresholded)",
  circadian: "Circadian",
  ultradian: "Ultradian",
};

/**
 * Compute every metric for one mouse. States use the thresholds' basis; circadian and ultradian metrics always use activity.
 * Ultradian metrics use the full recording (the day mask does not apply) and are cached per series and mode.
 */
export function mouseMetrics(series: MouseSeries, mask: boolean[], s: Schedule, t: Thresholds, u: UltradianMode) {
  return {
    ...mouseStateMetrics(series, mask, s, t),
    ...mouseCircadianMetrics(series, mask, s),
    ...mouseUltradianMetrics(series, s, u),
  } as Record<string, number>;
}

export function mouseCircadianMetrics(series: MouseSeries, mask: boolean[], s: Schedule): Record<string, number> {
  const c = circadianMetrics(series.act, mask, s);
  return {
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
  };
}

export function mouseUltradianMetrics(series: MouseSeries, s: Schedule, u: UltradianMode): Record<string, number> {
  const r = ultradianAnalysis(series, s, u);
  const out: Record<string, number> = {};
  PHASES.forEach((p) => {
    BANDS.forEach((_, b) => (out[bandId(b, p)] = r ? r.phases[p].bands[b] : NaN));
    out[periodId(p)] = r ? r.phases[p].period : NaN;
  });
  out.up_sig = r ? r.phases.all.sig : NaN;
  out.acf_lag = r ? r.acfLagH : NaN;
  out.acf_r = r ? r.acfR : NaN;
  out.ls_period = r ? r.lsPeriod : NaN;
  out.ls_power = r ? r.lsPower : NaN;
  return out;
}

export function stateValues(st: ReturnType<typeof stateMetrics>): Record<string, number> {
  const out: Record<string, number> = {};
  PHASES.forEach((phase) => {
    ["q", "u", "a"].forEach((k, i) => (out[`${k}_${phase}`] = st.pct[phase][i]));
  });
  out.q_bouts = st.qBoutsPerDay;
  out.q_bout_len = st.qBoutMeanMin;
  out.qa_rate = st.qaPerQHour;
  out.a_bout_len = st.aBoutMeanMin;
  out.ibi = st.ibiMedianH;
  return out;
}

/** Only the threshold-dependent metrics (cheaper; used for the sensitivity sweep). */
export const mouseStateMetrics = (series: MouseSeries, mask: boolean[], s: Schedule, t: Thresholds) =>
  stateValues(stateMetrics(classifySeries(series[t.basis], t.q, t.w, t.basis), mask, s));

/** Only the metrics in one group (used where many mice are analyzed for a single metric). */
export function mouseGroupMetrics(
  group: MetricGroup,
  series: MouseSeries,
  mask: boolean[],
  s: Schedule,
  t: Thresholds,
  u: UltradianMode,
): Record<string, number> {
  if (group === "states") return mouseStateMetrics(series, mask, s, t);
  if (group === "circadian") return mouseCircadianMetrics(series, mask, s);
  return mouseUltradianMetrics(series, s, u);
}
