import re
import warnings

import pandas as pd


def find_key(cohort, qc):
    """Return the path of the cohort's key file (<anything>_NNN_Key.xlsx), or None.

    Other key-like workbooks (e.g. *_Key_with_exclusions.xlsx) are ignored and logged.
    """
    pattern = re.compile(rf"_{cohort.number}_key\.xlsx$", re.IGNORECASE)
    candidates = sorted(
        p for p in cohort.path.iterdir()
        if p.is_file() and p.suffix.lower() == ".xlsx" and "key" in p.name.lower() and not p.name.startswith("~$")
    )
    matches = [p for p in candidates if pattern.search(p.name)]
    for p in candidates:
        if p not in matches:
            qc.add("info", "key_ignored", cohort.name, source=p.name, detail="does not match *_NNN_Key.xlsx")

    if not matches:
        qc.add("error", "key_missing", cohort.name, detail="no *_NNN_Key.xlsx found")
        return None
    if len(matches) > 1:
        qc.add("error", "key_ambiguous", cohort.name, detail="; ".join(p.name for p in matches))
        return None
    return matches[0]


def load_key(path, cohort, qc):
    """Read the first sheet of a key workbook with normalized column names."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        df = pd.read_excel(path, sheet_name=0, dtype=object)

    df.columns = [str(c).replace("$", "").strip() for c in df.columns]
    if "Mouse_ID" not in df.columns:
        qc.add("error", "key_no_mouse_id", cohort.name, source=path.name, detail=f"columns: {list(df.columns)}")
        return None

    df["Mouse_ID"] = df["Mouse_ID"].astype("string").str.strip()
    df = df[df["Mouse_ID"].notna() & (df["Mouse_ID"] != "")].copy()

    for mid in df.loc[df["Mouse_ID"].duplicated(), "Mouse_ID"].unique():
        qc.add("warning", "key_duplicate_mouse", cohort.name, mouse_id=mid, source=path.name)

    if "Autoexcluder" in df.columns:
        odd = df[df["Autoexcluder"].astype("string").str.startswith("#", na=False)]
        for _, row in odd.iterrows():
            qc.add("warning", "key_autoexcluder_error", cohort.name, mouse_id=row["Mouse_ID"],
                   source=path.name, detail=str(row["Autoexcluder"]))
    else:
        qc.add("info", "key_no_autoexcluder", cohort.name, source=path.name)

    return df
