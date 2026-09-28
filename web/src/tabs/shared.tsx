import { Badge } from "../components/ui";
import type { View } from "../state/view";

/** Hours since the first recording midnight, labeled as clock time. */
export const clockTick = (h: number) => `${String(Math.round(h) % 24).padStart(2, "0")}:00`;

/** Lists mice in view that carry QC warnings. */
export function FlagNote({ view }: { view: View }) {
  const flagged = view.subjects.filter((s) => view.flags.has(s.mouse.Mouse_ID));
  if (!flagged.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
      <Badge tone="red">QC</Badge>
      {flagged.length} {flagged.length > 1 ? "mice" : "mouse"} in view with QC flags (outlined red):
      {flagged.map((s) => (
        <span
          key={s.mouse.Mouse_ID}
          className="rounded bg-red-50 px-1 font-mono text-[10px] text-red-800"
          title={view.flags.get(s.mouse.Mouse_ID)!.map((r) => `${r.check}: ${r.detail}`).join("\n")}
        >
          {s.mouse.Mouse_ID}
        </span>
      ))}
    </div>
  );
}
