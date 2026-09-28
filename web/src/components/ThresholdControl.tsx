import * as Slider from "@radix-ui/react-slider";
import { useEffect, useState } from "react";
import { useSearch, useSetSearch } from "../state/route";
import { searchDefaults } from "../state/search";
import { STATE_COLORS } from "../theme";

const MAX = 0.5;
const STEP = 0.005;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Dual-handle slider for the quiescent (q) and awake (w) thresholds on activity_percent. */
export function ThresholdControl() {
  const { q, w } = useSearch();
  const setSearch = useSetSearch();
  const [local, setLocal] = useState<[number, number]>([q, w]);
  useEffect(() => setLocal([q, w]), [q, w]);

  const commit = ([nq, nw]: number[]) => {
    const round = (v: number) => Math.round(v / STEP) * STEP;
    setSearch({ q: +round(nq).toFixed(3), w: +round(nw).toFixed(3) });
  };

  const [lq, lw] = local;
  const isDefault = q === searchDefaults.q && w === searchDefaults.w;
  return (
    <div className="flex items-center gap-2" title="Quiescent: activity ≤ q. Awake: activity ≥ w. Undefined: between.">
      <span className="text-[11px] text-slate-500">States</span>
      <span className="w-9 text-right font-mono text-[11px]" style={{ color: STATE_COLORS[0] }}>
        {pct(lq)}
      </span>
      <Slider.Root
        className="relative flex h-4 w-44 touch-none select-none items-center"
        min={0}
        max={MAX}
        step={STEP}
        minStepsBetweenThumbs={1}
        value={local}
        onValueChange={(v) => {
          setLocal([v[0], v[1]]);
          commit(v);
        }}
      >
        <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full" style={{ background: "#e2e8f0" }}>
          <span className="absolute inset-y-0 left-0" style={{ width: `${(lq / MAX) * 100}%`, background: STATE_COLORS[0] }} />
          <Slider.Range className="absolute h-full" style={{ background: STATE_COLORS[1] }} />
        </Slider.Track>
        {["Quiescent threshold", "Awake threshold"].map((label) => (
          <Slider.Thumb
            key={label}
            aria-label={label}
            className="block h-3.5 w-3.5 rounded-full border border-slate-500 bg-white shadow focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        ))}
      </Slider.Root>
      <span className="w-9 font-mono text-[11px] text-slate-600">{pct(lw)}</span>
      <span className="text-[10px] text-slate-400" title="Center and width of the undefined band">
        U {pct((lq + lw) / 2)} &plusmn; {pct((lw - lq) / 2)}
      </span>
      {!isDefault && (
        <button
          type="button"
          className="no-print text-[10px] text-slate-500 underline"
          onClick={() => setSearch({ q: searchDefaults.q, w: searchDefaults.w })}
        >
          reset
        </button>
      )}
    </div>
  );
}
