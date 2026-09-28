/** Time helpers for the 48 h grid. Slot 0 starts at local midnight of the first recording day. */

export interface Schedule {
  binMin: number;
  nSlots: number;
  lightsOnMin: number;
  lightsOffMin: number;
}

export const hhmmToMin = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export const makeSchedule = (binMin: number, nSlots: number, lightsOn: string, lightsOff: string): Schedule => ({
  binMin,
  nSlots,
  lightsOnMin: hhmmToMin(lightsOn),
  lightsOffMin: hhmmToMin(lightsOff),
});

/** Clock minute of day at the start of slot i. */
export const clockMin = (s: Schedule, i: number) => (i * s.binMin) % 1440;

/** Calendar day (0-based) of slot i. */
export const dayOf = (s: Schedule, i: number) => Math.floor((i * s.binMin) / 1440);

/** Zeitgeber time in hours (0 = lights on) at the midpoint of slot i. */
export const ztOf = (s: Schedule, i: number) => {
  const mid = clockMin(s, i) + s.binMin / 2;
  return ((((mid - s.lightsOnMin) % 1440) + 1440) % 1440) / 60;
};

/** True if slot i falls in the scheduled light phase. */
export const isLightSlot = (s: Schedule, i: number) => {
  const zt = ztOf(s, i);
  const lightLen = (((s.lightsOffMin - s.lightsOnMin) % 1440) + 1440) % 1440 / 60;
  return zt < lightLen;
};

export type DaysSel = "1" | "2" | "both";

/** Boolean mask of slots included by the day selection. */
export const dayMask = (s: Schedule, days: DaysSel): boolean[] =>
  Array.from({ length: s.nSlots }, (_, i) => days === "both" || dayOf(s, i) === Number(days) - 1);
