/**
 * Ultradian analysis of one mouse's 10-min activity series: preprocessing, Morlet wavelet transform
 * (Torrence & Compo 1998, scale-rectified per Liu et al. 2007), AR(1) red-noise significance,
 * Lomb-Scargle periodogram, and autocorrelation. Periods are in hours.
 */
import type { MouseSeries } from "../data/types";
import { isLightSlot, type Schedule } from "./time";

export type UltradianMode = "detrended" | "raw";
export type UPhase = "all" | "light" | "dark";

export const U_MIN_H = 0.5;
export const U_MAX_H = 8;
export const N_PERIODS = 32;
export const BANDS: [number, number][] = [
  [0.5, 2],
  [2, 4],
  [4, 8],
];
/** Significant-power fraction is scored over this band. */
export const SIG_BAND: [number, number] = [2, 8];
/** Mice with more empty slots than this (the grid_gaps QC limit) are not analyzed. */
export const MAX_EMPTY = 12;
export const ACF_MAX_H = 12;
/** Lags shorter than this are never reported as the autocorrelation peak. */
const ACF_MIN_PEAK_H = 0.5;

const W0 = 6;
/** Fourier period / wavelet scale for the Morlet wavelet. */
const FOURIER_FACTOR = (4 * Math.PI) / (W0 + Math.sqrt(2 + W0 * W0));
const CHI2_95_DOF2 = 5.991;

export const PERIODS: number[] = Array.from(
  { length: N_PERIODS },
  (_, j) => U_MIN_H * (U_MAX_H / U_MIN_H) ** (j / (N_PERIODS - 1)),
);

// ---------- preprocessing ----------

export interface Prepared {
  /** Slot index of x[0] in the 48 h grid. */
  i0: number;
  dtH: number;
  /** Gap-filled (and, unless raw, block-detrended) activity as fractions. */
  x: number[];
  /** True where the slot had a real sample (not interpolated). */
  observed: boolean[];
  light: boolean[];
}

/** Remove each contiguous light or dark block's least-squares line (fit on observed points only). */
export function detrendBlocks(x: number[], light: boolean[], observed: boolean[] = x.map(() => true)): number[] {
  const out = x.slice();
  let start = 0;
  for (let k = 1; k <= x.length; k++) {
    if (k < x.length && light[k] === light[start]) continue;
    let n = 0, st = 0, sx = 0, stt = 0, stx = 0;
    for (let i = start; i < k; i++) {
      if (!observed[i]) continue;
      n++;
      st += i;
      sx += x[i];
      stt += i * i;
      stx += i * x[i];
    }
    const den = n * stt - st * st;
    const b = n >= 2 && den !== 0 ? (n * stx - st * sx) / den : 0;
    const a = n ? (sx - b * st) / n : 0;
    for (let i = start; i < k; i++) out[i] = x[i] - (a + b * i);
    start = k;
  }
  return out;
}

/** Gap-fill and detrend one mouse's activity, or null if it has too many empty slots. */
export function prepSeries(act: (number | null)[], s: Schedule, mode: UltradianMode): Prepared | null {
  const v = act.map((a) => (a == null ? null : a / 1000));
  if (v.filter((a) => a == null).length > MAX_EMPTY) return null;
  const i0 = v.findIndex((a) => a != null);
  if (i0 < 0) return null;
  let i1 = v.length - 1;
  while (v[i1] == null) i1--;
  const seg = v.slice(i0, i1 + 1);
  const observed = seg.map((a) => a != null);
  const x = seg.map((a) => a ?? NaN);
  for (let k = 0; k < x.length; k++) {
    if (observed[k]) continue;
    let lo = k - 1;
    while (!observed[lo]) lo--;
    let hi = k + 1;
    while (!observed[hi]) hi++;
    x[k] = x[lo] + ((x[hi] - x[lo]) * (k - lo)) / (hi - lo);
  }
  const light = seg.map((_, k) => isLightSlot(s, i0 + k));
  let y: number[];
  if (mode === "detrended") y = detrendBlocks(x, light, observed);
  else {
    const m = x.reduce((a, b) => a + b, 0) / x.length;
    y = x.map((a) => a - m);
  }
  return { i0, dtH: s.binMin / 60, x: y, observed, light };
}

// ---------- FFT ----------

/** In-place iterative radix-2 FFT. Length must be a power of two; the inverse is scaled by 1/n. */
export function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

// ---------- wavelet ----------

export interface Cwt {
  periods: number[];
  n: number;
  dtH: number;
  /** power[j][k]: |W|^2 / (variance * scale in h) at period j and time k. White noise has expected value 1 / scale. */
  power: Float64Array[];
  /** Expected AR(1) red-noise power at each period, on the same scale as power. */
  background: number[];
  /** Pointwise 95% significance threshold at each period. */
  threshold: number[];
  /** Lag-1 autocorrelation used for the red-noise model. */
  alpha: number;
}

/** Morlet (w0 = 6) continuous wavelet transform over PERIODS, computed by FFT with zero padding. */
export function cwt(x: number[], dtH: number, periods: number[] = PERIODS): Cwt {
  const n = x.length;
  const N = nextPow2(2 * n);
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const variance = x.reduce((a, b) => a + (b - mean) ** 2, 0) / n || 1;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let k = 0; k < n; k++) re[k] = x[k] - mean;
  fft(re, im);
  const omega = Array.from({ length: N }, (_, k) => ((k <= N / 2 ? k : 0) * 2 * Math.PI) / (N * dtH));

  const power: Float64Array[] = [];
  for (const p of periods) {
    const s = p / FOURIER_FACTOR;
    const norm = Math.sqrt((2 * Math.PI * s) / dtH) * Math.PI ** -0.25;
    const wr = new Float64Array(N);
    const wi = new Float64Array(N);
    for (let k = 1; k <= N / 2; k++) {
      const psi = norm * Math.exp(-((s * omega[k] - W0) ** 2) / 2);
      wr[k] = re[k] * psi;
      wi[k] = im[k] * psi;
    }
    fft(wr, wi, true);
    const pw = new Float64Array(n);
    for (let k = 0; k < n; k++) pw[k] = (wr[k] ** 2 + wi[k] ** 2) / variance / s;
    power.push(pw);
  }

  let num = 0;
  let den = 0;
  for (let k = 0; k < n; k++) {
    den += (x[k] - mean) ** 2;
    if (k > 0) num += (x[k] - mean) * (x[k - 1] - mean);
  }
  const alpha = den > 0 ? Math.max(0, num / den) : 0;
  const background = periods.map((p) => {
    const s = p / FOURIER_FACTOR;
    return (1 - alpha ** 2) / (1 + alpha ** 2 - 2 * alpha * Math.cos((2 * Math.PI * dtH) / p)) / s;
  });
  return { periods, n, dtH, power, background, threshold: background.map((b) => (b * CHI2_95_DOF2) / 2), alpha };
}

/** True when time index k is outside the cone of influence for period index j (not edge-affected). */
export function outsideCoi(c: Cwt, j: number, k: number): boolean {
  const s = c.periods[j] / FOURIER_FACTOR;
  return Math.min(k, c.n - 1 - k) * c.dtH >= Math.SQRT2 * s;
}

const inPhase = (light: boolean, phase: UPhase) => phase === "all" || (phase === "light") === light;

export interface PhaseSummary {
  /** Time-averaged power per period (outside the cone of influence, within the phase); NaN if no valid time. */
  global: number[];
  /** Mean of global over the periods in each of BANDS. */
  bands: number[];
  /** Period of the largest time-averaged power. */
  period: number;
  /** Fraction of phase time points with significant power somewhere in SIG_BAND. */
  sig: number;
}

export function summarizeCwt(c: Cwt, light: boolean[], phase: UPhase): PhaseSummary {
  const global = c.periods.map((_, j) => {
    let sum = 0;
    let n = 0;
    for (let k = 0; k < c.n; k++) {
      if (!inPhase(light[k], phase) || !outsideCoi(c, j, k)) continue;
      sum += c.power[j][k];
      n++;
    }
    return n ? sum / n : NaN;
  });
  const bands = BANDS.map(([lo, hi]) => {
    const v = global.filter((g, j) => Number.isFinite(g) && c.periods[j] >= lo - 1e-9 && c.periods[j] <= hi + 1e-9);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
  });
  let best = -1;
  global.forEach((g, j) => {
    if (Number.isFinite(g) && (best < 0 || g > global[best])) best = j;
  });
  let considered = 0;
  let significant = 0;
  for (let k = 0; k < c.n; k++) {
    if (!inPhase(light[k], phase)) continue;
    let any = false;
    let sig = false;
    c.periods.forEach((p, j) => {
      if (p < SIG_BAND[0] - 1e-9 || p > SIG_BAND[1] + 1e-9 || !outsideCoi(c, j, k)) return;
      any = true;
      if (c.power[j][k] > c.threshold[j]) sig = true;
    });
    if (any) considered++;
    if (sig) significant++;
  }
  return { global, bands, period: best >= 0 ? c.periods[best] : NaN, sig: considered ? significant / considered : NaN };
}

// ---------- autocorrelation ----------

/** Autocorrelation at lags 0..maxLag, using only pairs where both samples were observed. */
export function acf(x: number[], observed: boolean[], maxLag: number): number[] {
  const idx = x.map((_, k) => k).filter((k) => observed[k]);
  const m = idx.reduce((a, k) => a + x[k], 0) / idx.length;
  const v = idx.reduce((a, k) => a + (x[k] - m) ** 2, 0) / idx.length;
  const out: number[] = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    let n = 0;
    for (let k = 0; k + lag < x.length; k++) {
      if (!observed[k] || !observed[k + lag]) continue;
      sum += (x[k] - m) * (x[k + lag] - m);
      n++;
    }
    out.push(n && v > 0 ? sum / n / v : NaN);
  }
  return out;
}

/** First local maximum after the first zero crossing (and at least minLag); NaNs if none. */
export function acfPeak(r: number[], minLag: number): { lag: number; r: number } {
  const z = r.findIndex((v) => v <= 0);
  if (z < 0) return { lag: NaN, r: NaN };
  for (let k = Math.max(z, minLag, 1); k < r.length - 1; k++) {
    if (r[k] > r[k - 1] && r[k] >= r[k + 1]) return { lag: k, r: r[k] };
  }
  return { lag: NaN, r: NaN };
}

// ---------- Lomb-Scargle ----------

/**
 * Normalized Lomb-Scargle periodogram over minP..maxP (hours); returns the peak period and power.
 * Samples sit on a regular grid with gaps: k are integer slot indices and dtH the slot length.
 */
export function lombScargle(k: number[], y: number[], dtH: number, minP = U_MIN_H, maxP = U_MAX_H) {
  const n = y.length;
  if (n < 4) return { period: NaN, power: NaN };
  const m = y.reduce((a, b) => a + b, 0) / n;
  const yc = y.map((v) => v - m);
  const variance = yc.reduce((a, b) => a + b * b, 0) / (n - 1);
  if (!(variance > 0)) return { period: NaN, power: NaN };
  const K = 2 * k[n - 1] + 1;
  const cosT = new Float64Array(K);
  const sinT = new Float64Array(K);
  const df = 1 / (5 * (k[n - 1] - k[0]) * dtH);
  let bestP = NaN;
  let bestPow = -Infinity;
  for (let f = 1 / maxP; f <= 1 / minP + 1e-12; f += df) {
    const w = 2 * Math.PI * f;
    // cos/sin(w * j * dtH) for j = 0..K-1 by angle-addition recurrence.
    const c1 = Math.cos(w * dtH);
    const s1 = Math.sin(w * dtH);
    cosT[0] = 1;
    sinT[0] = 0;
    for (let j = 1; j < K; j++) {
      cosT[j] = cosT[j - 1] * c1 - sinT[j - 1] * s1;
      sinT[j] = sinT[j - 1] * c1 + cosT[j - 1] * s1;
    }
    let s2 = 0;
    let c2 = 0;
    for (const ki of k) {
      s2 += sinT[2 * ki];
      c2 += cosT[2 * ki];
    }
    const wtau = Math.atan2(s2, c2) / 2;
    const ct = Math.cos(wtau);
    const st = Math.sin(wtau);
    let yc_ = 0, ys_ = 0, cc = 0, ss = 0;
    for (let i = 0; i < n; i++) {
      const c = cosT[k[i]] * ct + sinT[k[i]] * st;
      const s = sinT[k[i]] * ct - cosT[k[i]] * st;
      yc_ += yc[i] * c;
      ys_ += yc[i] * s;
      cc += c * c;
      ss += s * s;
    }
    const pow = (yc_ ** 2 / cc + ys_ ** 2 / ss) / (2 * variance);
    if (pow > bestPow) {
      bestPow = pow;
      bestP = 1 / f;
    }
  }
  return { period: bestP, power: bestPow };
}

// ---------- per-mouse analysis (cached) ----------

export interface UltradianResult {
  prep: Prepared;
  cwt: Cwt;
  phases: Record<UPhase, PhaseSummary>;
  acf: number[];
  acfLagH: number;
  acfR: number;
  lsPeriod: number;
  lsPower: number;
}

const cache = new WeakMap<MouseSeries, Partial<Record<UltradianMode, UltradianResult | null>>>();

/** Full ultradian analysis of one mouse's activity (cached per series and mode); null if not analyzable. */
export function ultradianAnalysis(series: MouseSeries, s: Schedule, mode: UltradianMode): UltradianResult | null {
  const entry = cache.get(series) ?? {};
  if (mode in entry) return entry[mode]!;
  const prep = prepSeries(series.act, s, mode);
  let result: UltradianResult | null = null;
  if (prep) {
    const c = cwt(prep.x, prep.dtH);
    const r = acf(prep.x, prep.observed, Math.round(ACF_MAX_H / prep.dtH));
    const pk = acfPeak(r, Math.round(ACF_MIN_PEAK_H / prep.dtH));
    const obs = prep.x.map((_, k) => k).filter((k) => prep.observed[k]);
    const ls = lombScargle(obs, obs.map((k) => prep.x[k]), prep.dtH);
    result = {
      prep,
      cwt: c,
      phases: { all: summarizeCwt(c, prep.light, "all"), light: summarizeCwt(c, prep.light, "light"), dark: summarizeCwt(c, prep.light, "dark") },
      acf: r,
      acfLagH: pk.lag * prep.dtH,
      acfR: pk.r,
      lsPeriod: ls.period,
      lsPower: ls.power,
    };
  }
  entry[mode] = result;
  cache.set(series, entry);
  return result;
}
