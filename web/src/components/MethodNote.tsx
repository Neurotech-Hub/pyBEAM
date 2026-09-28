import * as Popover from "@radix-ui/react-popover";
import { METHOD_NOTES, REFERENCES } from "../methods";

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

/** Header button listing all method notes and references in one place. */
export function MethodsDrawer() {
  return (
    <Popover.Root>
      <Popover.Trigger className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100">Methods</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-50 max-h-[80vh] w-[28rem] overflow-y-auto rounded-md border border-slate-200 bg-white p-4 text-[11.5px] leading-snug text-slate-700 shadow-lg"
        >
          {Object.entries(METHOD_NOTES).map(([id, n]) => (
            <div key={id} className="mb-3">
              <div className="font-semibold">{n.title}</div>
              <p>{n.text}</p>
            </div>
          ))}
          <div className="border-t border-slate-200 pt-2 font-semibold">References</div>
          <RefList ids={Object.keys(REFERENCES)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
