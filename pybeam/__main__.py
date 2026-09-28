import argparse

from .config import load_config
from .crawl import build_manifest
from .export import export
from .extract import run, write_manifest
from .qc import QCLog


def main():
    parser = argparse.ArgumentParser(prog="pybeam", description="Crawl Box and extract BEAM L1 data.")
    parser.add_argument("--config", help="path to config.yaml (default: repo config.yaml)")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("crawl", help="discover L1 files and write data/manifest.csv only")
    sub.add_parser("run", help="full pipeline: manifest, mice.csv, beam_l1/*.csv, qc_report.csv, web/")
    sub.add_parser("export", help="rebuild data/web/ from the existing data/*.csv outputs (no Box access)")
    args = parser.parse_args()

    cfg = load_config(args.config)
    if args.command == "export":
        export(cfg)
    elif args.command == "crawl":
        qc = QCLog()
        cohorts, manifest = build_manifest(cfg, qc)
        print(f"Found {len(cohorts)} cohorts, {manifest['zip_file'].nunique()} zips, {len(manifest)} L1 CSVs")
        print(manifest.groupby("cohort").size().to_string())
        write_manifest(manifest, cfg.output_dir)
        qc_df = qc.to_frame()
        if len(qc_df):
            print("\nCrawl QC:")
            print(qc_df.to_string(index=False))
    else:
        run(cfg)


if __name__ == "__main__":
    main()
