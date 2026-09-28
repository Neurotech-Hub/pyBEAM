import { describe, expect, it } from "vitest";
import { circadianMetrics, cosinor, intradailyVariability, m10l5 } from "./circadian";
import { AWAKE, QUIESCENT, UNDEFINED, classify, classifySeries, stateMetrics } from "./states";
import { hedgesG, mannWhitney, mean, sem } from "./stats";
import { dayMask, isLightSlot, makeSchedule, ztOf } from "./time";

const s = makeSchedule(10, 288, "06:00", "18:00");

describe("time", () => {
  it("maps slots to ZT with lights on at 06:00", () => {
    expect(ztOf(s, 36)).toBeCloseTo(5 / 60); // 06:00-06:10 slot midpoint
    expect(ztOf(s, 0)).toBeCloseTo(18 + 5 / 60); // 00:00 is ZT18
    expect(isLightSlot(s, 36)).toBe(true);
    expect(isLightSlot(s, 107)).toBe(true); // 17:50
    expect(isLightSlot(s, 108)).toBe(false); // 18:00
    expect(isLightSlot(s, 35)).toBe(false); // 05:50
  });
  it("masks days", () => {
    const m = dayMask(s, "2");
    expect(m.filter(Boolean).length).toBe(144);
    expect(m[143]).toBe(false);
    expect(m[144]).toBe(true);
  });
});

describe("states", () => {
  it("classifies with inclusive thresholds", () => {
    expect(classify(50, 0.05, 0.15)).toBe(QUIESCENT);
    expect(classify(51, 0.05, 0.15)).toBe(UNDEFINED);
    expect(classify(150, 0.05, 0.15)).toBe(AWAKE);
    expect(classify(null, 0.05, 0.15)).toBeNull();
  });
  it("computes percentages by phase and bouts", () => {
    // Light slots (06:00-18:00) quiescent, dark slots awake, one empty slot at 00:00.
    const act = Array.from({ length: 288 }, (_, i) => (i === 0 ? null : isLightSlot(s, i) ? 0 : 500));
    const m = stateMetrics(classifySeries(act, 0.05, 0.15), dayMask(s, "both"), s);
    expect(m.pct.light).toEqual([100, 0, 0]);
    expect(m.pct.dark).toEqual([0, 0, 100]);
    expect(m.pct.all[0]).toBeCloseTo((100 * 144) / 287);
    expect(m.qBoutMeanMin).toBe(720);
    expect(m.qBoutsPerDay).toBeCloseTo(2 / ((287 * 10) / 1440));
  });
});

describe("circadian", () => {
  it("recovers cosinor parameters", () => {
    const t = Array.from({ length: 96 }, (_, i) => i / 4);
    const y = t.map((h) => 0.2 + 0.1 * Math.cos((2 * Math.PI * (h - 16)) / 24));
    const c = cosinor(t, y);
    expect(c.mesor).toBeCloseTo(0.2);
    expect(c.amplitude).toBeCloseTo(0.1);
    expect(c.acrophase).toBeCloseTo(16);
    expect(c.r2).toBeCloseTo(1);
  });
  it("computes M10/L5/RA and IV", () => {
    const profile = Array.from({ length: 24 }, (_, h) => (h < 12 ? 0 : 1));
    expect(m10l5(profile)).toEqual({ m10: 1, l5: 0, ra: 1 });
    const smooth = Array.from({ length: 48 }, (_, h) => Math.sin((2 * Math.PI * h) / 24));
    const noisy = Array.from({ length: 48 }, (_, h) => (h % 2 ? 1 : -1));
    expect(intradailyVariability(smooth)).toBeLessThan(0.2);
    expect(intradailyVariability(noisy)).toBeGreaterThan(1.9);
  });
  it("puts all activity in the dark for a nocturnal square wave", () => {
    const act = Array.from({ length: 288 }, (_, i) => (isLightSlot(s, i) ? 0 : 400));
    const c = circadianMetrics(act, dayMask(s, "both"), s);
    expect(c.darkFrac).toBe(1);
    expect(c.meanAct).toBeCloseTo(0.2);
    expect(c.acrophase).toBeCloseTo(18, 0);
  });
});

describe("stats", () => {
  it("computes mean and SEM", () => {
    expect(mean([1, 2, 3, NaN])).toBe(2);
    expect(sem([1, 2, 3])).toBeCloseTo(1 / Math.sqrt(3));
  });
  it("computes Hedges' g", () => {
    const { g } = hedgesG([2, 3, 4], [1, 2, 3]);
    expect(g).toBeCloseTo(1 * (1 - 3 / 15));
  });
  it("matches scipy mannwhitneyu (asymptotic, continuity)", () => {
    expect(mannWhitney([1, 2, 3], [4, 5, 6]).p).toBeCloseTo(0.0809, 3);
    // ties: U = 2.5, tie-corrected sigma = 3.3594, z = 1.4884
    expect(mannWhitney([1, 2, 2, 3], [2, 3, 4, 5]).p).toBeCloseTo(0.1366, 3);
  });
});
