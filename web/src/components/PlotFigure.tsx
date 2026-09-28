import * as Plot from "@observablehq/plot";
import { useEffect, useRef, useState } from "react";

interface Props {
  options: Plot.PlotOptions;
  /** Called with the datum under the pointer when the plot is clicked (requires a pointer/tip mark). */
  onPick?: (value: unknown) => void;
  className?: string;
}

/** Renders an Observable Plot SVG at the full width of its container; options.width is ignored. */
export function PlotFigure({ options, onPick, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !containerWidth) return;
    const plot = Plot.plot({
      style: { fontSize: "10px", fontFamily: "inherit", background: "transparent", overflow: "visible" },
      ...options,
      width: containerWidth,
    });
    el.replaceChildren(plot);
    if (!onPick) return;
    const click = () => {
      const v = (plot as unknown as { value?: unknown }).value;
      if (v != null) onPick(v);
    };
    plot.addEventListener("click", click);
    return () => plot.removeEventListener("click", click);
  }, [options, onPick, containerWidth]);

  return <div ref={ref} className={`w-full min-w-0 ${className ?? ""}`} />;
}
