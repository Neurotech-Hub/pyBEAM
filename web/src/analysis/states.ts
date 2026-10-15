import type { Basis } from "../state/search";
import { isLightSlot, type Schedule } from "./time";

export const QUIESCENT = 0;
export const UNDEFINED = 1;
export const AWAKE = 2;
export type State = typeof QUIESCENT | typeof UNDEFINED | typeof AWAKE;
export const STATE_LABELS = ["Quiescent", "Undefined", "Awake"] as const;

/**
 * Classify one bin. v is permille; q and w are fractions.
 * basis "act": quiescent if v <= q, awake if v >= w. basis "inact": quiescent if v >= q, awake if v <= w.
 */
export function classify(v: number | null, q: number, w: number, basis: Basis = "act"): State | null {
  if (v == null) return null;
  const x = v / 1000;
  if (basis === "inact") {
    if (x >= q) return QUIESCENT;
    if (x <= w) return AWAKE;
    return UNDEFINED;
  }
  if (x <= q) return QUIESCENT;
  if (x >= w) return AWAKE;
  return UNDEFINED;
}

export const classifySeries = (values: (number | null)[], q: number, w: number, basis: Basis = "act") =>
  values.map((v) => classify(v, q, w, basis));

export type Phase = "light" | "dark" | "all";

export interface StateMetrics {
  /** Percent of valid bins in each state, by phase. */
  pct: Record<Phase, [number, number, number]>;
  /** Quiescent bouts (runs of consecutive quiescent bins) per 24 h of valid data. */
  qBoutsPerDay: number;
  /** Mean quiescent bout duration in minutes. */
  qBoutMeanMin: number;
  /** Quiescent-to-awake transitions (undefined bins skipped) per hour of quiescence. */
  qaPerQHour: number;
  /** Mean awake bout (run of consecutive awake bins) duration in minutes. */
  aBoutMeanMin: number;
  /** Median onset-to-onset interval between consecutive awake bouts, in hours. */
  ibiMedianH: number;
}

const median = (x: number[]) => {
  if (!x.length) return NaN;
  const v = [...x].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * State percentages, quiescent and awake bouts, inter-bout intervals, and quiescent-to-awake transitions
 * over the slots where mask is true. Empty slots break bouts and reset transition and interval tracking.
 */
export function stateMetrics(states: (State | null)[], mask: boolean[], s: Schedule): StateMetrics {
  const counts: Record<Phase, [number, number, number]> = { light: [0, 0, 0], dark: [0, 0, 0], all: [0, 0, 0] };
  const bouts: number[] = [];
  const awakeBouts: number[] = [];
  const ibis: number[] = [];
  let run = 0;
  let aRun = 0;
  let lastOnset: number | null = null;
  let valid = 0;
  let transitions = 0;
  let lastDefined: State | null = null;
  for (let i = 0; i < states.length; i++) {
    const st = mask[i] ? states[i] : null;
    if (st !== AWAKE && aRun) {
      awakeBouts.push(aRun);
      aRun = 0;
    }
    if (st == null) {
      if (run) bouts.push(run);
      run = 0;
      lastDefined = null;
      lastOnset = null;
      continue;
    }
    if (st === AWAKE) {
      if (!aRun) {
        if (lastOnset != null) ibis.push(((i - lastOnset) * s.binMin) / 60);
        lastOnset = i;
      }
      aRun++;
    }
    valid++;
    counts.all[st]++;
    counts[isLightSlot(s, i) ? "light" : "dark"][st]++;
    if (st === AWAKE && lastDefined === QUIESCENT) transitions++;
    if (st !== UNDEFINED) lastDefined = st;
    if (st === QUIESCENT) run++;
    else if (run) {
      bouts.push(run);
      run = 0;
    }
  }
  if (run) bouts.push(run);
  if (aRun) awakeBouts.push(aRun);

  const toPct = (c: [number, number, number]): [number, number, number] => {
    const n = c[0] + c[1] + c[2];
    return n ? [(100 * c[0]) / n, (100 * c[1]) / n, (100 * c[2]) / n] : [NaN, NaN, NaN];
  };
  const days = (valid * s.binMin) / 1440;
  const qHours = (counts.all[QUIESCENT] * s.binMin) / 60;
  return {
    qaPerQHour: qHours ? transitions / qHours : NaN,
    pct: { light: toPct(counts.light), dark: toPct(counts.dark), all: toPct(counts.all) },
    qBoutsPerDay: days ? bouts.length / days : NaN,
    qBoutMeanMin: bouts.length ? (bouts.reduce((a, b) => a + b, 0) / bouts.length) * s.binMin : NaN,
    aBoutMeanMin: awakeBouts.length ? (awakeBouts.reduce((a, b) => a + b, 0) / awakeBouts.length) * s.binMin : NaN,
    ibiMedianH: median(ibis),
  };
}
