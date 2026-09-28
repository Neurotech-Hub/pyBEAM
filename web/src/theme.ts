export const GENOTYPE_ORDER = ["Wt", "Het", "Hemi", "Hom"];

export const GENOTYPE_COLORS: Record<string, string> = {
  Wt: "#6b7280",
  Het: "#2563eb",
  Hemi: "#1e3a8a",
  Hom: "#ea580c",
};

export const genotypeColor = (g: string) => GENOTYPE_COLORS[g] ?? "#a855f7";

export const sortGenotypes = (gs: string[]) =>
  [...gs].sort((a, b) => {
    const ia = GENOTYPE_ORDER.indexOf(a);
    const ib = GENOTYPE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

/** Quiescent, undefined, awake. Deliberately distinct from the genotype palette. */
export const STATE_COLORS = ["#1e293b", "#94a3b8", "#f1f5f9"];
export const LIGHT_COLOR = "#fde68a";
export const DARK_COLOR = "#1f2937";
export const DARK_SHADE = "#e5e7eb";
export const FLAG_COLOR = "#b91c1c";

/** Plot scale for genotype colors limited to the genotypes present. */
export const genotypeScale = (present: string[]) => {
  const domain = sortGenotypes(present);
  return { domain, range: domain.map(genotypeColor) };
};
