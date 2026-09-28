/** Descriptive and two-group statistics. Values that are NaN are dropped. Intended for exploration, not inference. */

const clean = (x: number[]) => x.filter((v) => Number.isFinite(v));

export function mean(x: number[]): number {
  const v = clean(x);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

export function sd(x: number[]): number {
  const v = clean(x);
  if (v.length < 2) return NaN;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

export const sem = (x: number[]) => sd(x) / Math.sqrt(clean(x).length);

/** Hedges' g (a minus b) with small-sample correction, and its approximate 95% CI. */
export function hedgesG(a: number[], b: number[]) {
  const x = clean(a);
  const y = clean(b);
  const na = x.length;
  const nb = y.length;
  if (na < 2 || nb < 2) return { g: NaN, lo: NaN, hi: NaN };
  const sp = Math.sqrt(((na - 1) * sd(x) ** 2 + (nb - 1) * sd(y) ** 2) / (na + nb - 2));
  const j = 1 - 3 / (4 * (na + nb) - 9);
  const g = sp > 0 ? ((mean(x) - mean(y)) / sp) * j : NaN;
  const se = Math.sqrt((na + nb) / (na * nb) + (g * g) / (2 * (na + nb)));
  return { g, lo: g - 1.96 * se, hi: g + 1.96 * se };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf). */
export function normCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Two-sided Mann-Whitney U test, normal approximation with tie and continuity correction. */
export function mannWhitney(a: number[], b: number[]) {
  const x = clean(a);
  const y = clean(b);
  const n1 = x.length;
  const n2 = y.length;
  if (!n1 || !n2) return { u: NaN, p: NaN };
  const all = [...x.map((v) => ({ v, g: 0 })), ...y.map((v) => ({ v, g: 1 }))].sort((p, q) => p.v - q.v);
  const ranks = new Array(all.length);
  let tieTerm = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = r;
    const t = j - i + 1;
    tieTerm += t ** 3 - t;
    i = j + 1;
  }
  let r1 = 0;
  all.forEach((d, i) => {
    if (d.g === 0) r1 += ranks[i];
  });
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const n = n1 + n2;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1))));
  if (sigma === 0) return { u: u1, p: 1 };
  const z = (Math.abs(u1 - mu) - 0.5) / sigma;
  return { u: u1, p: Math.min(1, 2 * (1 - normCdf(Math.max(z, 0)))) };
}
