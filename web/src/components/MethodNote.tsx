import * as Popover from "@radix-ui/react-popover";
import { METHOD_NOTES, METHODS_ORDER, REFERENCES } from "../methods";

function RefList({ ids }: { ids: string[] }) {
  return (
    <ol className="mt-1.5 space-y-1 text-[10.5px] text-slate-500">
      {ids.map((id) => {
        const r = REFERENCES[id];
        return (
          <li key={id}>
            {r.cite}{" "}
            <a className="text-slate-700 underline" href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">
              doi:{r.doi}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** Small "i" button that opens a short methods note with references. */
export function MethodNote({ id }: { id: keyof typeof METHOD_NOTES }) {
  const note = METHOD_NOTES[id];
  return (
    <Popover.Root>
      <Popover.Trigger
        className="no-print inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold normal-case text-slate-500 hover:bg-slate-100"
        aria-label={`Method: ${note.title}`}
      >
        i
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-50 w-80 rounded-md border border-slate-200 bg-white p-3 text-[11.5px] leading-snug text-slate-700 shadow-lg"
        >
          <div className="mb-1 font-semibold">{note.title}</div>
          <p>{note.text}</p>
          <RefList ids={note.refs} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Full-page list of every method note, each with its references, followed by all references. */
export function MethodsPage() {
  return (
    <article className="mx-auto max-w-3xl rounded-md border border-slate-200 bg-white p-6 text-[13px] leading-relaxed text-slate-700">
      <h2 className="mb-4 text-[16px] font-semibold text-slate-800">Methods</h2>
      {METHODS_ORDER.map((id) => {
        const n = METHOD_NOTES[id];
        return (
          <section key={id} className="mb-5">
            <h3 className="mb-1 text-[13px] font-semibold text-slate-800">{n.title}</h3>
            <p>{n.text}</p>
            {n.refs.length > 0 && <RefList ids={n.refs} />}
          </section>
        );
      })}
      <h3 className="mb-1 border-t border-slate-200 pt-4 text-[13px] font-semibold text-slate-800">References</h3>
      <RefList ids={Object.keys(REFERENCES)} />
    </article>
  );
}
