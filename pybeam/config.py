import os
from dataclasses import dataclass
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = REPO_ROOT / "config.yaml"


@dataclass
class Config:
    box_root: Path
    output_dir: Path
    cohort_pattern: str
    min_cohort: int
    l1_subdir: str
    skip_zip_patterns: list
    expected_l1_columns: list
    series_columns: list
    key_columns: list
    lights_on: str = "06:00"
    lights_off: str = "18:00"
    light_tolerance_min: int = 30
    web_bin_min: int = 10
    grid_gap_threshold: int = 12


def load_config(path=None):
    path = Path(path) if path else DEFAULT_CONFIG
    with open(path) as f:
        raw = yaml.safe_load(f)

    box_root = os.environ.get("PYBEAM_BOX_ROOT", raw["box_root"])
    output_dir = Path(raw.get("output_dir", "data"))
    if not output_dir.is_absolute():
        output_dir = REPO_ROOT / output_dir

    return Config(
        box_root=Path(box_root),
        output_dir=output_dir,
        cohort_pattern=raw["cohort_pattern"],
        min_cohort=int(raw.get("min_cohort", 1)),
        l1_subdir=raw["l1_subdir"],
        skip_zip_patterns=raw.get("skip_zip_patterns", []),
        expected_l1_columns=raw["expected_l1_columns"],
        series_columns=raw["series_columns"],
        key_columns=raw["key_columns"],
        lights_on=str(raw.get("lights_on", "06:00")),
        lights_off=str(raw.get("lights_off", "18:00")),
        light_tolerance_min=int(raw.get("light_tolerance_min", 30)),
        web_bin_min=int(raw.get("web_bin_min", 10)),
        grid_gap_threshold=int(raw.get("grid_gap_threshold", 12)),
    )
