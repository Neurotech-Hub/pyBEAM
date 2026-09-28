import pandas as pd

QC_COLUMNS = ["level", "check", "cohort", "mouse_id", "source", "detail"]


class QCLog:
    """Collects QC findings; written to data/qc_report.csv."""

    def __init__(self):
        self.rows = []

    def add(self, level, check, cohort="", mouse_id="", source="", detail=""):
        self.rows.append(
            dict(level=level, check=check, cohort=cohort, mouse_id=mouse_id, source=source, detail=detail)
        )

    def to_frame(self):
        df = pd.DataFrame(self.rows, columns=QC_COLUMNS)
        return df.sort_values(["cohort", "level", "check", "mouse_id", "source"], kind="stable").reset_index(drop=True)
