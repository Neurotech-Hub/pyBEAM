import re
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import pandas as pd

MEMBER_RE = re.compile(r"^(?P<mouse_id>.+)_BEAM_(?P<date>\d{8})\.csv$", re.IGNORECASE)

MANIFEST_COLUMNS = [
    "cohort", "cohort_number", "gene", "zip_file", "member", "mouse_id", "file_date",
    "n_rows", "zip_size", "zip_mtime",
]


@dataclass
class Cohort:
    number: str
    gene: str
    path: Path

    @property
    def name(self):
        return self.path.name


def discover_cohorts(cfg):
    pattern = re.compile(cfg.cohort_pattern)
    cohorts = []
    for p in sorted(cfg.box_root.iterdir()):
        m = pattern.match(p.name)
        if p.is_dir() and m and int(m.group(1)) >= cfg.min_cohort:
            cohorts.append(Cohort(number=m.group(1), gene=m.group(2), path=p))
    return cohorts


def find_l1_zips(cohort, cfg, qc):
    l1 = cohort.path / cfg.l1_subdir
    if not l1.is_dir():
        qc.add("error", "l1_missing", cohort.name, detail=f"{cfg.l1_subdir} not found")
        return []

    skips = [re.compile(s, re.IGNORECASE) for s in cfg.skip_zip_patterns]
    zips = []
    for p in sorted(l1.iterdir()):
        if not p.is_file() or p.name.startswith("."):
            continue
        if p.suffix.lower() != ".zip":
            qc.add("info", "l1_non_zip_ignored", cohort.name, source=p.name)
        elif any(s.search(p.name) for s in skips):
            qc.add("info", "zip_skipped", cohort.name, source=p.name, detail="matches skip_zip_patterns")
        else:
            zips.append(p)

    if not zips:
        qc.add("warning", "l1_empty", cohort.name, detail="no usable L1 zip")
    return zips


def _count_rows(zf, member):
    with zf.open(member) as f:
        return max(sum(1 for line in f if line.strip()) - 1, 0)


def build_manifest(cfg, qc):
    """Crawl Box and return (cohorts, manifest DataFrame) with one row per CSV inside the L1 zips."""
    cohorts = discover_cohorts(cfg)
    rows = []
    for cohort in cohorts:
        for zp in find_l1_zips(cohort, cfg, qc):
            stat = zp.stat()
            try:
                zf = zipfile.ZipFile(zp)
            except zipfile.BadZipFile as e:
                qc.add("error", "zip_unreadable", cohort.name, source=zp.name, detail=str(e))
                continue
            with zf:
                for member in sorted(zf.namelist()):
                    base = Path(member).name
                    if member.endswith("/") or base.startswith(".") or member.startswith("__MACOSX"):
                        continue
                    m = MEMBER_RE.match(base)
                    if not m:
                        qc.add("warning", "member_unrecognized", cohort.name, source=f"{zp.name}:{member}",
                               detail="name does not match <Mouse_ID>_BEAM_<YYYYMMDD>.csv")
                        continue
                    rows.append(dict(
                        cohort=cohort.name,
                        cohort_number=cohort.number,
                        gene=cohort.gene,
                        zip_file=zp.name,
                        member=member,
                        mouse_id=m.group("mouse_id"),
                        file_date=datetime.strptime(m.group("date"), "%Y%m%d").date().isoformat(),
                        n_rows=_count_rows(zf, member),
                        zip_size=stat.st_size,
                        zip_mtime=datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
                    ))

    manifest = pd.DataFrame(rows, columns=MANIFEST_COLUMNS)
    manifest = manifest.sort_values(["cohort", "mouse_id", "file_date", "member"]).reset_index(drop=True)
    return cohorts, manifest


def diff_manifest(old, new):
    """Summarize changes between a previous and current manifest."""
    key = ["cohort", "zip_file", "member"]
    old_keys = set(map(tuple, old[key].astype(str).values))
    new_keys = set(map(tuple, new[key].astype(str).values))
    old_zips = old.drop_duplicates(["cohort", "zip_file"]).set_index(["cohort", "zip_file"])
    new_zips = new.drop_duplicates(["cohort", "zip_file"]).set_index(["cohort", "zip_file"])
    common = old_zips.index.intersection(new_zips.index)
    changed = [
        idx for idx in common
        if (str(old_zips.loc[idx, "zip_mtime"]), int(old_zips.loc[idx, "zip_size"]))
        != (str(new_zips.loc[idx, "zip_mtime"]), int(new_zips.loc[idx, "zip_size"]))
    ]
    return dict(
        added_files=sorted(new_keys - old_keys),
        removed_files=sorted(old_keys - new_keys),
        changed_zips=sorted(changed),
    )
