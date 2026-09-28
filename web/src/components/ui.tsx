import type { ReactNode } from "react";

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel min-w-0 rounded-md border border-slate-200 bg-white p-3 ${className}`}>
      <header className="mb-2 flex items-center gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">{aside}</div>
      </header>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[11px] text-slate-500">{label}</span>}
      <div className="inline-flex overflow-hidden rounded border border-slate-300">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`px-2 py-0.5 text-[11px] ${
              o.value === value ? "bg-slate-800 text-white" : "bg-white text-slate-700 hover:bg-slate-100"
            } border-l border-slate-300 first:border-l-0`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "amber", title }: { children: ReactNode; tone?: "amber" | "red" | "slate"; title?: string }) {
  const tones = {
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    red: "bg-red-100 text-red-800 border-red-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <span title={title} className={`inline-block rounded border px-1 py-px text-[10px] font-medium leading-none ${tones[tone]}`}>
      {children}
    </span>
  );
}

export const fmt = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "\u2013");

export const fmtP = (p: number) => (!Number.isFinite(p) ? "\u2013" : p < 0.001 ? "<0.001" : p.toFixed(3));

/** "p=0.012" or "p<0.001". */
export const pText = (p: number) => (Number.isFinite(p) && p < 0.001 ? "p<0.001" : `p=${fmtP(p)}`);

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-[12px] text-slate-400">{children}</div>;
}
