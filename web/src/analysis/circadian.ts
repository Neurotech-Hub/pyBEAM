import { isLightSlot, ztOf, type Schedule } from "./time";

export interface Cosinor {
  mesor: number;
  amplitude: number;
  /** Time of the fitted peak, in ZT hours (0-24). */
  acrophase: number;
  r2: number;
}

/** Least-squares 24 h cosinor fit: y = M + b cos(2 pi t / 24) + c sin(2 pi t / 24). */
export function cosinor(t: number[], y: number[], period = 24): Cosinor {
  const n = y.length;
  const nan = { mesor: NaN, amplitude: NaN, acrophase: NaN, r2: NaN };
  if (n < 3) return nan;
  // Normal equations for [M, b, c].
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const r = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const w = (2 * Math.PI * t[i]) / period;
    const x = [1, Math.cos(w), Math.sin(w)];
    for (let j = 0; j < 3; j++) {
      r[j] += x[j] * y[i];
      for (let k = 0; k < 3; k++) A[j][k] += x[j] * x[k];
    }
  }
  const sol = solve3(A, r);
  if (!sol) return nan;
  const [M, b, c] = sol;
  const mean = y.reduce((a, v) => a + v, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const w = (2 * Math.PI * t[i]) / period;
    const fit = M + b * Math.cos(w) + c * Math.sin(w);
    ssRes += (y[i] - fit) ** 2;
    ssTot += (y[i] - mean) ** 2;
  }
  const phase = Math.atan2(c, b); // peak where cos(w - phase) = 1
  return {
    mesor: M,
    amplitude: Math.hypot(b, c),
    acrophase: ((((phase * period) / (2 * Math.PI)) % period) + period) % period,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : NaN,
  };
}

function solve3(A: number[][], b: number[]): number[] | null {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k < 4; k++) m[r][k] -= f * m[col][k];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

/** Hourly means of a series (values as fractions), in order of recording hours; null where an hour has no data. */
export function hourlyMeans(values: (number | null)[], mask: boolean[], s: Schedule): (number | null)[] {
  const perHour = 60 / s.binMin;
  const out: (number | null)[] = [];
  for (let h = 0; h < values.length / perHour; h++) {
    let sum = 0;
    let n = 0;
    for (let i = h * perHour; i < (h + 1) * perHour; i++) {
      const v = values[i];
      if (mask[i] && v != null) {
        sum += v;
        n++;
      }
    }
    out.push(n ? sum / n : null);
  }
  return out;
}

/** Average 24 h profile (hour of day 0-23, clock time) from hourly means. */
export function dailyProfile(hourly: (number | null)[]): (number | null)[] {
  const sum = new Array(24).fill(0);
  const n = new Array(24).fill(0);
  hourly.forEach((v, h) => {
    if (v != null) {
      sum[h % 24] += v;
      n[h % 24]++;
    }
  });
  return sum.map((v, h) => (n[h] ? v / n[h] : null));
}

/** Most active 10 h (M10), least active 5 h (L5), and relative amplitude, from a circular 24 h profile. */
export function m10l5(profile: (number | null)[]) {
  const window = (len: number, pick: (a: number, b: number) => boolean) => {
    let best = NaN;
    for (let start = 0; start < 24; start++) {
      let sum = 0;
      let n = 0;
      for (let k = 0; k < len; k++) {
        const v = profile[(start + k) % 24];
        if (v != null) {
          sum += v;
          n++;
        }
      }
      if (n === len && (Number.isNaN(best) || pick(sum / n, best))) best = sum / n;
    }
    return best;
  };
  const m10 = window(10, (a, b) => a > b);
  const l5 = window(5, (a, b) => a < b);
  return { m10, l5, ra: m10 + l5 > 0 ? (m10 - l5) / (m10 + l5) : NaN };
}

/** Intradaily variability on hourly data (Van Someren et al. 1999). Hours without data are skipped. */
export function intradailyVariability(hourly: (number | null)[]): number {
  const x = hourly.filter((v): v is number => v != null);
  const n = x.length;
  if (n < 3) return NaN;
  const mean = x.reduce((a, v) => a + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    den += (x[i] - mean) ** 2;
    if (i > 0) num += (x[i] - x[i - 1]) ** 2;
  }
  return den > 0 ? (n * num) / ((n - 1) * den) : NaN;
}

export interface CircadianMetrics extends Cosinor {
  meanAct: number;
  darkFrac: number;
  m10: number;
  l5: number;
  ra: number;
  iv: number;
}

/** Circadian metrics for one mouse. act is permille. */
export function circadianMetrics(act: (number | null)[], mask: boolean[], s: Schedule): CircadianMetrics {
  const t: number[] = [];
  const y: number[] = [];
  let dark = 0;
  let total = 0;
  const values = act.map((a) => (a == null ? null : a / 1000));
  values.forEach((v, i) => {
    if (!mask[i] || v == null) return;
    t.push(ztOf(s, i));
    y.push(v);
    total += v;
    if (!isLightSlot(s, i)) dark += v;
  });
  const hourly = hourlyMeans(values, mask, s);
  return {
    ...cosinor(t, y),
    meanAct: y.length ? total / y.length : NaN,
    darkFrac: total > 0 ? dark / total : NaN,
    ...m10l5(dailyProfile(hourly)),
    iv: intradailyVariability(hourly),
  };
}
