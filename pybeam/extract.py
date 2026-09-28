import datetime as dt
import zipfile

import pandas as pd

from .crawl import build_manifest, diff_manifest
from .export import export
from .keys import find_key, load_key
from .qc import QCLog

FILE_STAT_COLUMNS = ["mouse_id", "n_files", "n_rows", "start_time", "end_time", "beam_file", "source_files"]


def _to_int_str(value):
    """Normalize BEAM ids like '054', 54, 54.0 to '54' for comparison."""
    try:
        return str(int(float(value)))
    except (TypeError, ValueError):
        return None


def _format_key_value(value):
    if isinstance(value, (pd.Timestamp, dt.datetime)):
        return value.strftime("%Y-%m-%d")
    return value


def read_member(zf, member, mouse_id, cohort, cfg, qc):
    """Read one L1 CSV (all values kept as raw strings) and return (trimmed frame, stats dict) or None."""
    source = f"{zf.filename.rsplit('/', 1)[-1]}:{member}"
    with zf.open(member) as f:
        df = pd.read_csv(f, dtype=str, keep_default_na=False)

    missing = [c for c in cfg.expected_l1_columns if c not in df.columns]
    extra = [c for c in df.columns if c not in cfg.expected_l1_columns]
    if missing:
        qc.add("warning", "schema_missing_columns", cohort.name, mouse_id, source, ", ".join(missing))
    if extra:
        qc.add("info", "schema_extra_columns", cohort.name, mouse_id, source, ", ".join(extra))

    if df.empty:
        qc.add("warning", "file_empty", cohort.name, mouse_id, source)
        return None

    if "Mouse_ID" in df.columns:
        ids = sorted(set(df["Mouse_ID"]) - {""})
        if ids != [mouse_id]:
            qc.add("warning", "mouse_id_mismatch", cohort.name, mouse_id, source,
                   f"filename={mouse_id}; column={ids}")

    times = pd.to_datetime(df.get("datetime", pd.Series(dtype=str)), errors="coerce", format="%Y-%m-%d %H:%M:%S")
    n_bad = int(times.isna().sum())
    if n_bad:
        qc.add("warning", "datetime_unparseable", cohort.name, mouse_id, source, f"{n_bad} rows")
    n_dup = int(times.dropna().duplicated().sum())
    if n_dup:
        qc.add("warning", "datetime_duplicates", cohort.name, mouse_id, source, f"{n_dup} rows")

    beams = sorted(set(df["BEAM"]) - {""}) if "BEAM" in df.columns else []
    if len(beams) > 1:
        qc.add("warning", "beam_multiple", cohort.name, mouse_id, source, ", ".join(beams))

    trimmed = df.reindex(columns=cfg.series_columns, fill_value="")
    stats = dict(
        mouse_id=mouse_id,
        n_rows=len(df),
        start_time=times.min(),
        end_time=times.max(),
        beam_file=";".join(beams),
        source=member,
    )
    return trimmed, stats


def aggregate_file_stats(stats):
    if not stats:
        return pd.DataFrame(columns=FILE_STAT_COLUMNS)
    df = pd.DataFrame(stats)
    agg = df.groupby("mouse_id").agg(
        n_files=("source", "count"),
        n_rows=("n_rows", "sum"),
        start_time=("start_time", "min"),
        end_time=("end_time", "max"),
        beam_file=("beam_file", lambda s: ";".join(sorted(set(";".join(s).split(";")) - {""}))),
        source_files=("source", lambda s: ";".join(sorted(s))),
    ).reset_index()
    for c in ("start_time", "end_time"):
        agg[c] = agg[c].dt.strftime("%Y-%m-%d %H:%M:%S")
    return agg[FILE_STAT_COLUMNS]


def build_mice_table(cohort, key, file_stats, cfg, qc):
    if key is not None:
        k = key.reindex(columns=cfg.key_columns).copy()
        for c in k.columns:
            k[c] = k[c].map(_format_key_value)
        k["mouse_id"] = k["Mouse_ID"]
    else:
        k = pd.DataFrame(columns=cfg.key_columns + ["mouse_id"])

    mice = k.merge(file_stats, on="mouse_id", how="outer", indicator=True)
    mice["in_key"] = mice["_merge"] != "right_only"
    mice["has_data"] = mice["_merge"] != "left_only"
    mice["Mouse_ID"] = mice["Mouse_ID"].fillna(mice["mouse_id"])

    for _, row in mice[mice["_merge"] == "left_only"].iterrows():
        qc.add("warning", "mouse_no_data", cohort.name, row["Mouse_ID"], detail="in key but no L1 file")
    for _, row in mice[mice["_merge"] == "right_only"].iterrows():
        qc.add("warning", "file_not_in_key", cohort.name, row["Mouse_ID"], row["source_files"],
               "L1 file has no matching Mouse_ID in key")
    if "BEAM" in mice.columns:
        both = mice[mice["_merge"] == "both"]
        for _, row in both.iterrows():
            file_beams = {_to_int_str(b) for b in str(row["beam_file"]).split(";") if b}
            key_beam = _to_int_str(row["BEAM"])
            if key_beam is not None and file_beams and file_beams != {key_beam}:
                qc.add("warning", "beam_mismatch", cohort.name, row["Mouse_ID"], row["source_files"],
                       f"key BEAM={row['BEAM']}; file BEAM={row['beam_file']}")

    mice.insert(0, "gene_dir", cohort.gene)
    mice.insert(0, "cohort_number", cohort.number)
    mice.insert(0, "cohort", cohort.name)
    mice["n_files"] = mice["n_files"].fillna(0).astype(int)
    mice["n_rows"] = mice["n_rows"].fillna(0).astype(int)
    cols = ["cohort", "cohort_number", "gene_dir"] + cfg.key_columns + [
        "in_key", "has_data", "n_files", "n_rows", "start_time", "end_time", "beam_file", "source_files"]
    return mice[cols]


def run(cfg, log=print):
    qc = QCLog()
    out = cfg.output_dir
    series_dir = out / "beam_l1"
    series_dir.mkdir(parents=True, exist_ok=True)

    log(f"Crawling {cfg.box_root}")
    cohorts, manifest = build_manifest(cfg, qc)
    log(f"Found {len(cohorts)} cohorts, {manifest['zip_file'].nunique()} zips, {len(manifest)} L1 CSVs")

    mice_tables = []
    written = set()
    for cohort in cohorts:
        key_path = find_key(cohort, qc)
        key = load_key(key_path, cohort, qc) if key_path else None

        sub = manifest[manifest["cohort"] == cohort.name]
        frames, stats = [], []
        for zip_name, group in sub.groupby("zip_file", sort=True):
            with zipfile.ZipFile(cohort.path / cfg.l1_subdir / zip_name) as zf:
                for _, row in group.iterrows():
                    result = read_member(zf, row["member"], row["mouse_id"], cohort, cfg, qc)
                    if result is not None:
                        frames.append(result[0])
                        stats.append(result[1])

        if frames:
            series = pd.concat(frames, ignore_index=True)
            series = series.sort_values(["Mouse_ID", "datetime"], kind="stable")
            path = series_dir / f"{cohort.name}.csv"
            series.to_csv(path, index=False)
            written.add(path.name)

        file_stats = aggregate_file_stats(stats)
        mice_tables.append(build_mice_table(cohort, key, file_stats, cfg, qc))
        log(f"  {cohort.name}: key={'yes' if key is not None else 'NO'}, "
            f"files={len(sub)}, mice_with_data={len(file_stats)}")

    for stale in series_dir.glob("*.csv"):
        if stale.name not in written:
            stale.unlink()
            log(f"  removed stale {stale.name}")

    mice = pd.concat(mice_tables, ignore_index=True)
    mice.to_csv(out / "mice.csv", index=False)
    write_manifest(manifest, out, log)
    qc_df = qc.to_frame()
    qc_df.to_csv(out / "qc_report.csv", index=False)

    log(f"Wrote {len(mice)} mice, {len(written)} cohort series files, {len(qc_df)} QC rows")
    log(qc_df.groupby(["level", "check"]).size().to_string())

    export(cfg, log)
    return manifest, mice, qc_df


def write_manifest(manifest, out, log=print):
    path = out / "manifest.csv"
    if path.exists():
        old = pd.read_csv(path, dtype=str)
        changes = diff_manifest(old, manifest)
        log(f"Changes since last run: {len(changes['added_files'])} added files, "
            f"{len(changes['removed_files'])} removed files, {len(changes['changed_zips'])} changed zips")
        for label in ("added_files", "removed_files", "changed_zips"):
            for item in changes[label]:
                log(f"  {label}: {' / '.join(item)}")
    out.mkdir(parents=True, exist_ok=True)
    manifest.to_csv(path, index=False)
