import { z } from "zod";

export const TABS = ["quiescence", "circadian", "across", "data"] as const;
export type Tab = (typeof TABS)[number];
/** Every page: the nav tabs plus the Methods page (linked from the footer). */
export const PAGES = [...TABS, "methods"] as const;
export type Page = (typeof PAGES)[number];

// TanStack Router JSON-parses search values, so "1" arrives as a number; coerce to strings where needed.
const str = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v == null ? v : String(v)), schema);

export const searchSchema = z.object({
  tab: z.enum(PAGES).catch("quiescence"),
  cohort: str(z.string()).catch(""),
  /** Comma-separated genotypes to include; empty = all. */
  geno: str(z.string()).catch(""),
  sex: z.enum(["all", "M", "F", "split"]).catch("all"),
  /** Drop mice whose key Autoexcluder starts with "Exclude". */
  excl: z.boolean().catch(true),
  /** Pool Hom and Hemi as full knockouts (KO) for analysis and filters. */
  collapseKo: z.boolean().catch(true),
  days: str(z.enum(["1", "2", "both"])).catch("both"),
  /** Series used to score states: activity_percent ("act") or inactivity_percent ("inact"). */
  basis: z.enum(["act", "inact"]).catch("act"),
  /** Quiescent if activity_percent <= q; awake if >= w (fractions). */
  q: z.number().min(0).max(1).catch(0.05),
  w: z.number().min(0).max(1).catch(0.15),
  /** Quiescent if inactivity_percent >= qi; awake if <= wi (fractions). */
  qi: z.number().min(0).max(1).catch(0.95),
  wi: z.number().min(0).max(1).catch(0.85),
  /** Remove the undefined state: one threshold per basis splits bins into quiescent and awake. */
  noU: z.boolean().catch(false),
  /** Single threshold on activity_percent (quiescent if <= t) and inactivity_percent (quiescent if >= ti). */
  t: z.number().min(0).max(1).catch(0.1),
  ti: z.number().min(0).max(1).catch(0.9),
  metric: z.string().catch("q_dark"),
  dist: z.enum(["hist", "ecdf"]).catch("hist"),
  /** Row order on the Across cohorts tab: cohort/genotype, Hedges' g (descending), or p (ascending). */
  sort: z.enum(["subject", "g", "p"]).catch("subject"),
  fold: z.boolean().catch(false),
});

export type Search = z.infer<typeof searchSchema>;

export const searchDefaults: Search = searchSchema.parse({});

export type Basis = Search["basis"];
export interface Thresholds {
  basis: Basis;
  q: number;
  w: number;
}

/**
 * The active state basis and its quiescent (q) and awake (w) thresholds.
 * With the undefined state removed, q = w = the single threshold, so every bin is quiescent or awake.
 */
export const thresholds = (s: Search): Thresholds => {
  const inact = s.basis === "inact";
  if (s.noU) {
    const t = inact ? s.ti : s.t;
    return { basis: s.basis, q: t, w: t };
  }
  return inact ? { basis: "inact", q: s.qi, w: s.wi } : { basis: "act", q: s.q, w: s.w };
};

export const parseGeno = (s: string): string[] => (s ? s.split(",").filter(Boolean) : []);
