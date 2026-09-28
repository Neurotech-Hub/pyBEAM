import { isLightSlot, type Schedule } from "./time";

export const QUIESCENT = 0;
export const UNDEFINED = 1;
export const AWAKE = 2;
export type State = typeof QUIESCENT | typeof UNDEFINED | typeof AWAKE;
export const STATE_LABELS = ["Quiescent", "Undefined", "Awake"] as const;

/** Classify one bin. act is permille; q and w are fractions (quiescent if act <= q, awake if act >= w). */
export function classify(act: number | null, q: number, w: number): State | null {
  if (act == null) return null;
  const x = act / 1000;
  if (x <= q) return QUIESCENT;
  if (x >= w) return AWAKE;
  return UNDEFINED;
}

export const classifySeries = (act: (number | null)[], q: number, w: number) => act.map((a) => classify(a, q, w));

export type Phase = "light" | "dark" | "all";

export interface StateMetrics {
  /** Percent of valid bins in each state, by phase. */
  pct: Record<Phase, [number, number, number]>;
  /** Quiescent bouts (runs of consecutive quiescent bins) per 24 h of valid data. */
  qBoutsPerDay: number;
  /** Mean quiescent bout duration in minutes. */
  qBoutMeanMin: number;
}

/** State percentages and quiescent bouts over the slots where mask is true. Empty slots break bouts. */
export function stateMetrics(states: (State | null)[], mask: boolean[], s: Schedule): StateMetrics {
  const counts: Record<Phase, [number, number, number]> = { light: [0, 0, 0], dark: [0, 0, 0], all: [0, 0, 0] };
  const bouts: number[] = [];
  let run = 0;
  let valid = 0;
  for (let i = 0; i < states.length; i++) {
    const st = mask[i] ? states[i] : null;
    if (st == null) {
      if (run) bouts.push(run);
      run = 0;
      continue;
    }
    valid++;
    counts.all[st]++;
    counts[isLightSlot(s, i) ? "light" : "dark"][st]++;
    if (st === QUIESCENT) run++;
    else if (run) {
      bouts.push(run);
      run = 0;
    }
  }
  if (run) bouts.push(run);

  const toPct = (c: [number, number, number]): [number, number, number] => {
    const n = c[0] + c[1] + c[2];
    return n ? [(100 * c[0]) / n, (100 * c[1]) / n, (100 * c[2]) / n] : [NaN, NaN, NaN];
  };
  const days = (valid * s.binMin) / 1440;
  return {
    pct: { light: toPct(counts.light), dark: toPct(counts.dark), all: toPct(counts.all) },
    qBoutsPerDay: days ? bouts.length / days : NaN,
    qBoutMeanMin: bouts.length ? (bouts.reduce((a, b) => a + b, 0) / bouts.length) * s.binMin : NaN,
  };
}
