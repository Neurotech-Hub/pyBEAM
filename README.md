# pyBEAM

Data pipeline that crawls the WU-SMAC Box `Behavior` folder, reads the BEAM **L1** CSVs directly from their zips, joins them to each cohort's key file, and writes a small set of intermediate data to `data/`. `data/` is the only data tracked in git; downstream apps and analyses read from it.

Box is never modified: CSVs are read in place from the zips.

## Setup

```bash
/opt/homebrew/bin/python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

The Box path is set in `config.yaml` (`box_root`) and can be overridden with the environment variable:

```bash
export PYBEAM_BOX_ROOT="/path/to/Box/SSPsyGene - WashU Mouse Assay Center/Behavior"
```

## Run

```bash
.venv/bin/python -m pybeam crawl   # quick: discover files, write data/manifest.csv, print crawl QC
.venv/bin/python -m pybeam run     # full: manifest, mice.csv, beam_l1/*.csv, qc_report.csv, web/
.venv/bin/python -m pybeam export  # rebuild data/web/ only, from the committed CSVs
```

Re-run `run` whenever Box is updated. It prints the files and zips that changed since the last run, and the output is deterministic, so `git diff data/` shows exactly what changed.

## Explorer app (`web/`)

A static React + TypeScript app (Vite, TanStack Router/Query, Observable Plot, Tailwind) that reads `data/web/` and runs every analysis in the browser.

```bash
cd web
npm install
npm run dev     # http://localhost:5173/pyBEAM/
npm test        # analysis unit tests (Vitest)
npm run build   # static site in web/dist
```

- **Tabs:** Quiescence (state thresholds, activity distribution, state raster, time-in-state and bout metrics, threshold sensitivity map), Circadian (group activity by clock time or ZT, cosinor and non-parametric metrics, double-plotted actograms), Across cohorts (Hedges' g vs Wt for any metric in every cohort), and Data & QC (cohort summary, mouse table, `qc_report`).
- **Shareable state:** every filter and threshold lives in the URL hash (for example `#/?cohort=009_C3&q=0.05&w=0.15&tab=circadian`); defaults are omitted. "Copy link" copies the current view.
- **Print:** the Print button (or the browser print dialog) hides controls and adds a header with the active filters, thresholds, data date, and link.
- **Methods:** the "i" buttons and the Methods menu give short method notes with references.
- **Deploy:** `.github/workflows/pages.yml` builds `web/` on every push to `main` and publishes it to GitHub Pages (enable Pages with source "GitHub Actions" in the repository settings). The site base path is the repository name. CI never touches Box; it publishes the committed `data/web/`.
- **Updating data:** run `pybeam run`, review `git diff data/`, then commit and push.

## What gets crawled

- Cohort directories matching `NNN_GENE` with `NNN >= 001` (`000_*` pilots are ignored).
- L1 zips at `<cohort>/3_BEAM/L1/*.zip`, excluding names matching `skip_zip_patterns` (default `^OLD`).
- Zip members named `<Mouse_ID>_BEAM_<YYYYMMDD>.csv`.
- One key file per cohort: `<cohort>/*_NNN_Key.xlsx`, matched by cohort number (case-insensitive). Variants such as `*_Key_with_exclusions.xlsx` are ignored and logged. The first sheet is used, and `$` is stripped from column names (`Genotype$` becomes `Genotype`).

## Output data contract (`data/`)

All files are CSV with a header row.

### `manifest.csv`: one row per L1 CSV found in Box

| column | description |
|---|---|
| `cohort` | cohort directory, e.g. `009_C3` |
| `cohort_number`, `gene` | parsed from the directory name |
| `zip_file`, `member` | zip name and CSV name inside it |
| `mouse_id`, `file_date` | parsed from the CSV name |
| `n_rows` | data rows in the CSV |
| `zip_size`, `zip_mtime` | used to detect changes between runs |

### `mice.csv`: one row per mouse (key rows joined with L1 files)

| column | description |
|---|---|
| `cohort`, `cohort_number`, `gene_dir` | cohort identifiers |
| `Mouse_ID`, `Gene`, `Gene_ID`, `Genotype`, `Sex`, `BEAM`, `DOB`, `Autoexcluder` | from the key (configurable via `key_columns`; blank if absent, e.g. cohorts 001-004 have no `Autoexcluder`) |
| `in_key` | mouse appears in the key |
| `has_data` | at least one L1 CSV was found |
| `n_files`, `n_rows` | number of L1 CSVs and total rows |
| `start_time`, `end_time` | first and last `datetime` in the L1 data |
| `beam_file` | BEAM device id(s) as written in the L1 data |
| `source_files` | L1 CSV name(s), `;`-separated |

Exclusion decisions are left to downstream analysis; `Autoexcluder` is passed through unchanged.

### `beam_l1/<cohort>.csv`: 10-minute L1 time series

Columns (configurable via `series_columns`): `datetime, BEAM, Mouse_ID, activity_count, activity_percent, inactivity_count, inactivity_percent, lux, temperature_c`. Values are copied verbatim from the source CSVs and sorted by `Mouse_ID`, then `datetime`. Join to `mice.csv` on `Mouse_ID`.

### `qc_report.csv`: issues found during the run

Columns: `level` (`error`, `warning`, `info`), `check`, `cohort`, `mouse_id`, `source`, `detail`. Checks include:

- Folder and file discovery: `l1_missing`, `l1_empty`, `zip_skipped`, `zip_unreadable`, `member_unrecognized`.
- Key files: `key_missing`, `key_ambiguous`, `key_ignored`, `key_no_mouse_id`, `key_duplicate_mouse`, `key_no_autoexcluder`, `key_autoexcluder_error` (for example `#INVALID OPERATION`).
- CSV contents: `schema_missing_columns`, `schema_extra_columns`, `file_empty`, `mouse_id_mismatch` (filename vs. column), `datetime_unparseable`, `datetime_duplicates`, `beam_multiple`.
- Key vs. files: `mouse_no_data` (in the key, no L1 file), `file_not_in_key`, `beam_mismatch` (key BEAM vs. file BEAM).
- Web export: `light_schedule_deviation` (detected lights-on/off from `lux > 0` differs from `lights_on`/`lights_off` in `config.yaml` by more than `light_tolerance_min`), `grid_gaps` (more than `grid_gap_threshold` empty slots in the aligned grid, or samples outside 48 h).

### `web/`: compact JSON for the explorer app

Written by `pybeam run` (or `pybeam export`, which rebuilds it from the CSVs above without touching Box).

- `index.json`: `lights_on`, `lights_off`, `bin_min`, `n_slots`, `box_updated` (latest zip modified time), `data_through` (latest `end_time`), and `cohorts` (`cohort`, `number`, `gene`, `n_mice`, `n_with_data`, `genotypes` counts, `has_series`).
- `mice.json`: rows of `mice.csv` (booleans and counts typed), plus `lights_on_detected`, `lights_off_detected` (`HH:MM`, median across days of the first/last `lux > 0` sample) and `grid_gaps`.
- `series/<cohort>.json`: `{cohort, bin_min, mice: {Mouse_ID: {start, act, inact, light}}}`. Each mouse has a 48 h grid of `bin_min` slots starting at local midnight of its first sample (`start`). Samples are assigned to the slot their timestamp falls in; slots with two samples are averaged. `act` and `inact` are `activity_percent` and `inactivity_percent` in permille (integers, `null` for empty slots); `light` is 1 when `lux > 0`.
- `qc.json`: `qc_report.csv` as a list of records.

## Layout

- `pybeam/config.py`: loads `config.yaml` and the environment override
- `pybeam/crawl.py`: cohort, zip and CSV discovery; manifest; change detection
- `pybeam/keys.py`: key file selection and normalization
- `pybeam/extract.py`: reads CSVs from the zips, validates them, joins to keys, writes outputs
- `pybeam/export.py`: web JSON export and light/grid QC checks
- `pybeam/qc.py`: QC log
- `pybeam/__main__.py`: CLI
