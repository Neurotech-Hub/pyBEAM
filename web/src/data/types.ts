export interface CohortInfo {
  cohort: string;
  number: string;
  gene: string;
  n_mice: number;
  n_with_data: number;
  genotypes: Record<string, number>;
  has_series: boolean;
}

export interface DataIndex {
  lights_on: string;
  lights_off: string;
  bin_min: number;
  n_slots: number;
  box_updated: string;
  data_through: string;
  cohorts: CohortInfo[];
}

export interface Mouse {
  cohort: string;
  cohort_number: string;
  gene_dir: string;
  Mouse_ID: string;
  Gene: string;
  Gene_ID: string;
  Genotype: string;
  Sex: string;
  BEAM: string;
  DOB: string;
  Autoexcluder: string;
  in_key: boolean;
  has_data: boolean;
  n_files: number;
  n_rows: number;
  start_time: string;
  end_time: string;
  beam_file: string;
  source_files: string;
  lights_on_detected: string;
  lights_off_detected: string;
  grid_gaps: number | null;
}

/** One mouse's 48 h grid. act/inact are permille (0-1000), null for empty slots; light is 1 when lux > 0. */
export interface MouseSeries {
  start: string;
  act: (number | null)[];
  inact: (number | null)[];
  light: (number | null)[];
}

export interface CohortSeries {
  cohort: string;
  bin_min: number;
  mice: Record<string, MouseSeries>;
}

export interface QcRow {
  level: "error" | "warning" | "info";
  check: string;
  cohort: string;
  mouse_id: string;
  source: string;
  detail: string;
}
