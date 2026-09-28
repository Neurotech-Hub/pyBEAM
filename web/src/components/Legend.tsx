import type { ReactNode } from "react";
import { genotypeColor, sortGenotypes } from "../theme";

export type LegendItem =
  | { kind: "line"; color: string; dashed?: boolean; label: ReactNode }
  | { kind: "swatch"; color: string; opacity?: number; label: ReactNode }
  | { kind: "dot"; color: string; stroke?: string; label: ReactNode }
  | { kind: "ring"; color: string; label: ReactNode }
  | { kind: "meanSem"; label: ReactNode };

function Glyph({ item }: { item: LegendItem }) {
  switch (item.kind) {
    case "line":
      return <span className="inline-block w-4" style={{ borderTop: `1.5px ${item.dashed ? "dashed" : "solid"} ${item.color}` }} />;
    case "swatch":
      return (
        <span className="relative inline-block h-2.5 w-3 border border-slate-300">
          <span className="absolute inset-0" style={{ background: item.color, opacity: item.opacity ?? 1 }} />
        </span>
      );
    case "dot":
      return (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: item.color, boxShadow: item.stroke ? `0 0 0 1px ${item.stroke}` : undefined }}
        />
      );
    case "ring":
      return <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: item.color }} />;
    case "meanSem":
      return (
        <svg width="10" height="12" className="inline-block" aria-hidden>
          <line x1="5" x2="5" y1="1" y2="11" stroke="#0f172a" />
          <line x1="2" x2="8" y1="6" y2="6" stroke="#0f172a" strokeWidth="2" />
        </svg>
      );
  }
}

/** Compact HTML legend rendered under or above a plot (also printed). */
export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-600 ${className ?? ""}`}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <Glyph item={item} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Line items for group traces: color = genotype, dashed = female (only distinct when sex is split). */
export const groupLineItems = (groups: string[]): LegendItem[] =>
  groups.map((g) => ({ kind: "line", color: genotypeColor(g.split(" ")[0]), dashed: g.endsWith(" F"), label: g }));

/** Dot items for the genotypes present. */
export const genotypeDotItems = (genotypes: string[]): LegendItem[] =>
  sortGenotypes([...new Set(genotypes)]).map((g) => ({ kind: "dot", color: genotypeColor(g), label: g }));
