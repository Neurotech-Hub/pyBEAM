import * as Slider from "@radix-ui/react-slider";
import { useEffect, useState } from "react";
import { useSearch, useSetSearch } from "../state/route";
import { searchDefaults, thresholds, type Basis, type Search } from "../state/search";
import { STATE_COLORS } from "../theme";
import { Segmented } from "./ui";

const RANGE: Record<Basis, [number, number]> = { act: [0, 0.5], inact: [0.5, 1] };
const STEP = 0.005;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const round = (v: number) => +(Math.round(v / STEP) * STEP).toFixed(3);

/**
 * State basis toggle, "Remove Undefined" checkbox, and threshold slider.
 * Activity: quiescent if activity <= q, awake if >= w (thumbs [q, w]).
 * Inactivity: quiescent if inactivity >= q, awake if <= w (thumbs [w, q]).
 * With Undefined removed there is one thumb (t): quiescent at or past it, awake otherwise.
 */
export function ThresholdControl() {
  const search = useSearch();
  const setSearch = useSetSearch();
  const { basis, q, w } = thresholds(search);
  const inact = basis === "inact";
  const single = search.noU;
  const [min, max] = RANGE[basis];
  const target = (): number[] => (single ? [q] : inact ? [w, q] : [q, w]);
  const [local, setLocal] = useState<number[]>(target());
  useEffect(() => setLocal(target()), [q, w, basis, single]);

  const commit = (v: number[]) => {
    if (single) setSearch(inact ? { ti: round(v[0]) } : { t: round(v[0]) });
    else if (inact) setSearch({ wi: round(v[0]), qi: round(v[1]) });
    else setSearch({ q: round(v[0]), w: round(v[1]) });
  };

  const defaults: Partial<Search> = single
    ? inact
      ? { ti: searchDefaults.ti }
      : { t: searchDefaults.t }
    : inact
      ? { qi: searchDefaults.qi, wi: searchDefaults.wi }
      : { q: searchDefaults.q, w: searchDefaults.w };
  const isDefault = Object.entries(defaults).every(([k, v]) => search[k as keyof Search] === v);

  const lo = local[0];
  const hi = local[local.length - 1];
  const frac = (v: number) => ((v - min) / (max - min)) * 100;
  const title = single
    ? inact
      ? "Quiescent: inactivity ≥ threshold. Awake: below it."
      : "Quiescent: activity ≤ threshold. Awake: above it."
    : inact
      ? "Quiescent: inactivity ≥ q. Awake: inactivity ≤ w. Undefined: between."
      : "Quiescent: activity ≤ q. Awake: activity ≥ w. Undefined: between.";
  const thumbLabels = single ? ["Threshold"] : inact ? ["Awake threshold", "Quiescent threshold"] : ["Quiescent threshold", "Awake threshold"];
  return (
    <div className="flex flex-wrap items-center gap-2" title={title}>
      <Segmented<Basis>
        label="States"
        value={basis}
        onChange={(b) => setSearch({ basis: b })}
        options={[
          { value: "act", label: "By Activity %", title: "Score states from activity_percent" },
          { value: "inact", label: "By Inactivity %", title: "Score states from inactivity_percent" },
        ]}
      />
      <label className="flex items-center gap-1 text-[11px] text-slate-600" title="Split bins into quiescent and awake with a single threshold">
        <input type="checkbox" checked={single} onChange={(e) => setSearch({ noU: e.target.checked })} />
        Remove Undefined
      </label>
      {!single && (
        <span className="w-9 text-right font-mono text-[11px] text-slate-600" style={{ color: inact ? undefined : STATE_COLORS[0] }}>
          {pct(lo)}
        </span>
      )}
      <Slider.Root
        className="relative flex h-4 w-44 touch-none select-none items-center"
        min={min}
        max={max}
        step={STEP}
        minStepsBetweenThumbs={1}
        value={local}
        onValueChange={(v) => {
          setLocal(v);
          commit(v);
        }}
      >
        <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full" style={{ background: "#e2e8f0" }}>
          {inact ? (
            <span className="absolute inset-y-0 right-0" style={{ width: `${100 - frac(hi)}%`, background: STATE_COLORS[0] }} />
          ) : (
            <span className="absolute inset-y-0 left-0" style={{ width: `${frac(lo)}%`, background: STATE_COLORS[0] }} />
          )}
          {!single && <Slider.Range className="absolute h-full" style={{ background: STATE_COLORS[1] }} />}
        </Slider.Track>
        {thumbLabels.map((label) => (
          <Slider.Thumb
            key={label}
            aria-label={label}
            className="block h-3.5 w-3.5 rounded-full border border-slate-500 bg-white shadow focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        ))}
      </Slider.Root>
      {single ? (
        <span className="font-mono text-[11px] text-slate-600">Thresh {pct(lo)}</span>
      ) : (
        <>
          <span className="w-9 font-mono text-[11px] text-slate-600" style={{ color: inact ? STATE_COLORS[0] : undefined }}>
            {pct(hi)}
          </span>
          <span className="text-[10px] text-slate-400" title="Center and width of the undefined band">
            U {pct((lo + hi) / 2)} &plusmn; {pct((hi - lo) / 2)}
          </span>
        </>
      )}
      {!isDefault && (
        <button type="button" className="no-print text-[10px] text-slate-500 underline" onClick={() => setSearch(defaults)}>
          reset
        </button>
      )}
    </div>
  );
}
