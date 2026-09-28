"""Build compact JSON for the web explorer (data/web/) from the committed data/*.csv outputs."""
import json

import numpy as np
import pandas as pd

from .qc import QC_COLUMNS

EXPORT_CHECKS = {"light_schedule_deviation", "grid_gaps"}


def _hhmm_to_min(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def _min_to_hhmm(m):
    if m is None or np.isnan(m):
        return ""
    m = int(round(m))
    return f"{m // 60:02d}:{m % 60:02d}"


def _write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), allow_nan=False)
        f.write("\n")


def _permille(values):
    return [None if pd.isna(v) else int(round(v * 1000)) for v in values]


def grid_mouse(df, cfg):
    """Align one mouse's samples to a fixed grid of web_bin_min slots starting at its first midnight."""
    bin_s = cfg.web_bin_min * 60
    n_slots = 48 * 60 // cfg.web_bin_min
    start = df["datetime"].min().normalize()
    slot = ((df["datetime"] - start).dt.total_seconds() // bin_s).astype(int)
    inside = (slot >= 0) & (slot < n_slots)
    g = df[inside].assign(slot=slot[inside], lit=(df.loc[inside, "lux"] > 0).astype(float))
    agg = g.groupby("slot")[["activity_percent", "inactivity_percent", "lit"]].mean().reindex(range(n_slots))
    light = [None if pd.isna(v) else int(v >= 0.5) for v in agg["lit"]]
    return dict(
        start=start.strftime("%Y-%m-%dT%H:%M"),
        act=_permille(agg["activity_percent"]),
        inact=_permille(agg["inactivity_percent"]),
        light=light,
    ), int(agg["activity_percent"].isna().sum()), int((~inside).sum())


def detect_lights(df):
    """Median (across days) clock minute of the first and last lit sample (lux > 0)."""
    lit = df[df["lux"] > 0]
    if lit.empty:
        return np.nan, np.nan
    tod = lit["datetime"].dt.hour * 60 + lit["datetime"].dt.minute + lit["datetime"].dt.second / 60
    by_day = tod.groupby(lit["datetime"].dt.date)
    return float(by_day.min().median()), float(by_day.max().median())


def export(cfg, log=print):
    out = cfg.output_dir
    web = out / "web"
    mice = pd.read_csv(out / "mice.csv", dtype=str, keep_default_na=False)
    manifest = pd.read_csv(out / "manifest.csv", dtype=str, keep_default_na=False)
    qc_path = out / "qc_report.csv"
    qc = pd.read_csv(qc_path, dtype=str, keep_default_na=False)
    qc = qc[~qc["check"].isin(EXPORT_CHECKS)]
    new_qc = []

    on_cfg, off_cfg = _hhmm_to_min(cfg.lights_on), _hhmm_to_min(cfg.lights_off)
    lights = {}
    gaps = {}
    written = set()
    for cohort in sorted(mice["cohort"].unique()):
        path = out / "beam_l1" / f"{cohort}.csv"
        if not path.exists():
            continue
        df = pd.read_csv(path, dtype={"Mouse_ID": str, "BEAM": str})
        df["datetime"] = pd.to_datetime(df["datetime"], errors="coerce", format="%Y-%m-%d %H:%M:%S")
        df = df.dropna(subset=["datetime"])
        series = {}
        for mid, m in df.groupby("Mouse_ID", sort=True):
            series[mid], n_gap, n_outside = grid_mouse(m, cfg)
            gaps[mid] = n_gap
            if n_gap > cfg.grid_gap_threshold or n_outside:
                new_qc.append(dict(level="warning", check="grid_gaps", cohort=cohort, mouse_id=mid, source="",
                                   detail=f"{n_gap} empty {cfg.web_bin_min}-min slots; {n_outside} samples outside 48 h"))
            on, off = detect_lights(m)
            lights[mid] = (on, off)
            # last lit sample precedes lights-off by up to one bin
            if (np.isnan(on) or abs(on - on_cfg) > cfg.light_tolerance_min
                    or abs(off - off_cfg) > cfg.light_tolerance_min + cfg.web_bin_min):
                new_qc.append(dict(level="warning", check="light_schedule_deviation", cohort=cohort, mouse_id=mid,
                                   source="", detail=f"detected on={_min_to_hhmm(on)} off={_min_to_hhmm(off)}; "
                                                     f"expected {cfg.lights_on}-{cfg.lights_off}"))
        target = web / "series" / f"{cohort}.json"
        _write_json(target, dict(cohort=cohort, bin_min=cfg.web_bin_min, mice=series))
        written.add(target.name)

    for stale in (web / "series").glob("*.json"):
        if stale.name not in written:
            stale.unlink()

    records = []
    for row in mice.to_dict("records"):
        rec = dict(row)
        rec["in_key"] = row["in_key"] == "True"
        rec["has_data"] = row["has_data"] == "True"
        rec["n_files"] = int(row["n_files"])
        rec["n_rows"] = int(row["n_rows"])
        on, off = lights.get(row["Mouse_ID"], (np.nan, np.nan))
        rec["lights_on_detected"] = _min_to_hhmm(on)
        rec["lights_off_detected"] = _min_to_hhmm(off)
        rec["grid_gaps"] = gaps.get(row["Mouse_ID"])
        records.append(rec)
    _write_json(web / "mice.json", records)

    cohorts = []
    for cohort, g in mice.groupby("cohort", sort=True):
        with_data = g[g["has_data"] == "True"]
        cohorts.append(dict(
            cohort=cohort,
            number=g["cohort_number"].iloc[0],
            gene=g["gene_dir"].iloc[0],
            n_mice=len(g),
            n_with_data=len(with_data),
            genotypes={k: int(v) for k, v in with_data["Genotype"].value_counts().sort_index().items()},
            has_series=f"{cohort}.json" in written,
        ))
    ends = mice.loc[mice["end_time"] != "", "end_time"]
    _write_json(web / "index.json", dict(
        lights_on=cfg.lights_on,
        lights_off=cfg.lights_off,
        bin_min=cfg.web_bin_min,
        n_slots=48 * 60 // cfg.web_bin_min,
        box_updated=manifest["zip_mtime"].max() if len(manifest) else "",
        data_through=ends.max() if len(ends) else "",
        cohorts=cohorts,
    ))

    qc = pd.concat([qc, pd.DataFrame(new_qc, columns=QC_COLUMNS)], ignore_index=True)
    qc = qc.sort_values(["cohort", "level", "check", "mouse_id", "source"], kind="stable").reset_index(drop=True)
    qc.to_csv(qc_path, index=False)
    _write_json(web / "qc.json", qc.to_dict("records"))

    log(f"Exported {len(written)} cohort series, {len(records)} mice, {len(qc)} QC rows "
        f"({len(new_qc)} from export checks) to {web}")
