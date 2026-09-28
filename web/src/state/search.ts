import { z } from "zod";

export const TABS = ["quiescence", "circadian", "across", "data"] as const;
export type Tab = (typeof TABS)[number];

// TanStack Router JSON-parses search values, so "1" arrives as a number; coerce to strings where needed.
const str = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v == null ? v : String(v)), schema);

export const searchSchema = z.object({
  tab: z.enum(TABS).catch("quiescence"),
  cohort: str(z.string()).catch(""),
  /** Comma-separated genotypes to include; empty = all. */
  geno: str(z.string()).catch(""),
  sex: z.enum(["all", "M", "F", "split"]).catch("all"),
  /** Drop mice whose key Autoexcluder starts with "Exclude". */
  excl: z.boolean().catch(true),
  days: str(z.enum(["1", "2", "both"])).catch("both"),
  /** Quiescent if activity_percent <= q; awake if >= w (fractions). */
  q: z.number().min(0).max(1).catch(0.05),
  w: z.number().min(0).max(1).catch(0.15),
  metric: z.string().catch("q_dark"),
  dist: z.enum(["hist", "ecdf"]).catch("hist"),
  fold: z.boolean().catch(false),
});

export type Search = z.infer<typeof searchSchema>;

export const searchDefaults: Search = searchSchema.parse({});

export const parseGeno = (s: string): string[] => (s ? s.split(",").filter(Boolean) : []);
