export interface Reference {
  id: string;
  cite: string;
  doi: string;
}

export const REFERENCES: Record<string, Reference> = {
  pack2007: {
    id: "pack2007",
    cite: "Pack AI, et al. (2007) Novel method for high-throughput phenotyping of sleep in mice. Physiol Genomics 28:232-238.",
    doi: "10.1152/physiolgenomics.00139.2006",
  },
  fisher2012: {
    id: "fisher2012",
    cite: "Fisher SP, et al. (2012) Rapid assessment of sleep-wake behavior in mice. J Biol Rhythms 27:48-58.",
    doi: "10.1177/0748730411431550",
  },
  brown2017: {
    id: "brown2017",
    cite: "Brown LA, Hasan S, Foster RG, Peirson SN (2017) COMPASS: Continuous Open Mouse Phenotyping of Activity and Sleep Status. Wellcome Open Res 1:2.",
    doi: "10.12688/wellcomeopenres.9892.2",
  },
  witting1990: {
    id: "witting1990",
    cite: "Witting W, et al. (1990) Alterations in the circadian rest-activity rhythm in aging and Alzheimer's disease. Biol Psychiatry 27:563-572.",
    doi: "10.1016/0006-3223(90)90523-5",
  },
  vansomeren1999: {
    id: "vansomeren1999",
    cite: "Van Someren EJW, et al. (1999) Bright light therapy: improved sensitivity to its effects on rest-activity rhythms in Alzheimer patients by application of nonparametric methods. Chronobiol Int 16:505-518.",
    doi: "10.3109/07420529908998724",
  },
  cornelissen2014: {
    id: "cornelissen2014",
    cite: "Cornelissen G (2014) Cosinor-based rhythmometry. Theor Biol Med Model 11:16.",
    doi: "10.1186/1742-4682-11-16",
  },
  refinetti2007: {
    id: "refinetti2007",
    cite: "Refinetti R, Cornelissen G, Halberg F (2007) Procedures for numerical analysis of circadian rhythms. Biol Rhythm Res 38:275-325.",
    doi: "10.1080/09291010600903692",
  },
  lakens2013: {
    id: "lakens2013",
    cite: "Lakens D (2013) Calculating and reporting effect sizes to facilitate cumulative science: a practical primer for t-tests and ANOVAs. Front Psychol 4:863.",
    doi: "10.3389/fpsyg.2013.00863",
  },
};

export interface MethodNoteDef {
  title: string;
  text: string;
  refs: string[];
}

export const METHOD_NOTES: Record<string, MethodNoteDef> = {
  data: {
    title: "Data and preprocessing",
    text:
      "BEAM L1 CSVs are read in place from each cohort's Box zips and joined to the cohort key file by Mouse_ID. " +
      "Each mouse's samples are aligned to a 48-h grid of 10-min slots starting at local midnight of its first sample; " +
      "each sample is assigned to the slot its timestamp falls in, and slots with two samples are averaged. " +
      "Empty slots are left out of every calculation. Analysis uses both recording days.",
    refs: [],
  },
  lights: {
    title: "Light schedule and zeitgeber time",
    text:
      "Lights are on 06:00 to 18:00 (facility schedule); ZT0 is lights on. Each slot is assigned to the light or dark phase by the ZT of its midpoint. " +
      "Lights-on and lights-off are also detected per mouse from lux > 0 (median across days of the first and last lit sample), " +
      "and mice whose detected schedule differs from the facility schedule by more than 30 min " +
      "(40 min for lights-off, since the last lit sample can precede lights-off by one bin) are flagged in QC.",
    refs: [],
  },
  states: {
    title: "Behavioral quiescence from PIR activity",
    text:
      "Each 10-min bin reports activity_percent from an in-cage PIR sensor (the firmware scores 40-s windows). " +
      "Bins at or below the quiescent threshold are scored quiescent, bins at or above the awake threshold awake, and bins in between undefined. " +
      "States can instead be scored from inactivity_percent, with the comparisons reversed (quiescent at or above its threshold, awake at or below). " +
      "With Remove Undefined, a single threshold splits every bin into quiescent (at or below it for activity, at or above it for inactivity) or awake; " +
      "defaults are 10% activity and 90% inactivity. " +
      "Sustained immobility of about 40 s or more agrees closely with EEG/EMG-defined sleep in mice; quiescence here is a behavioral proxy, not EEG sleep.",
    refs: ["pack2007", "fisher2012", "brown2017"],
  },
  bouts: {
    title: "Quiescent bouts",
    text:
      "A bout is a run of consecutive quiescent bins; empty bins end a bout. Bout counts and durations are limited by the 10-min bin size, " +
      "so they describe consolidation at a coarse scale. " +
      "The quiescent-to-awake transition rate counts each switch from a quiescent bin to an awake bin, skipping undefined bins in between " +
      "(empty bins reset it), divided by hours spent quiescent. Unlike bout counts, it is not inflated by brief dips into the undefined band.",
    refs: ["fisher2012", "brown2017"],
  },
  sensitivity: {
    title: "Threshold sensitivity",
    text:
      "Hedges' g (mutant minus Wt) for the selected state metric, recomputed across a grid of quiescent and awake thresholds " +
      "(activity: quiescent 1-20% in 1% steps, awake 5-42.5% in 2.5% steps; inactivity: the mirror image, quiescent 80-99% and awake 57.5-95%). " +
      "With Undefined removed, the single threshold is swept instead (activity 1-40% in 1% steps; inactivity 60-99%). " +
      "Regions where g is stable indicate conclusions that do not hinge on the exact threshold. Click a cell to apply it.",
    refs: ["lakens2013"],
  },
  activity: {
    title: "Activity level and dark-phase fraction",
    text:
      "Mean activity is the mean activity_percent over valid bins. The dark-phase fraction is the share of summed activity that falls in the dark phase. " +
      "Circadian metrics always use activity_percent, regardless of the state basis.",
    refs: [],
  },
  cosinor: {
    title: "Cosinor",
    text:
      "A 24-h cosine is fit by least squares to each mouse's activity in every valid 10-min bin: MESOR (rhythm-adjusted mean), amplitude, and acrophase (time of fitted peak, in ZT hours). " +
      "R\u00b2 is the fraction of variance explained. Rest-activity profiles are often non-sinusoidal, so these are complemented by non-parametric measures.",
    refs: ["cornelissen2014", "refinetti2007"],
  },
  nonparametric: {
    title: "Non-parametric rhythm measures",
    text:
      "From hourly means: M10 and L5 are the most active 10 h and least active 5 h of the average day, relative amplitude RA = (M10 - L5)/(M10 + L5), " +
      "and intradaily variability (IV) indexes fragmentation (near 0 for a smooth rhythm, near 2 for noise). " +
      "Interdaily stability is not reported because recordings span only 2 days.",
    refs: ["witting1990", "vansomeren1999"],
  },
  actogram: {
    title: "Double-plotted actograms",
    text:
      "Each row shows two consecutive days so rhythms crossing midnight are continuous. Shading marks the scheduled dark phase; ZT0 is lights on.",
    refs: ["refinetti2007"],
  },
  stats: {
    title: "Group comparisons",
    text:
      "Each genotype is compared with Wt littermates in the same cohort (sex-matched when sex is split). " +
      "When Collapse Hom/Hemi as KO is on (the default), homozygous and hemizygous mice are pooled as a single full-knockout (KO) group. " +
      "Hedges' g is the bias-corrected standardized mean difference with an approximate 95% CI; " +
      "p is a two-sided Mann-Whitney U test (normal approximation with tie and continuity corrections). " +
      "These are exploratory, uncorrected for multiple comparisons, and should guide rather than replace a pre-specified analysis.",
    refs: ["lakens2013"],
  },
  exclusions: {
    title: "Exclusions and QC flags",
    text:
      "When Apply key exclusions is on (the default), mice whose key Autoexcluder starts with \"Exclude\" are dropped. " +
      "Mice with a QC warning or error (other than having no data) are kept but outlined in red and listed above the plots. " +
      "QC checks cover file discovery, key files, CSV contents, key-versus-file agreement, light-schedule deviation, " +
      "and grid gaps (more than 12 empty 10-min slots, or samples outside the 48-h grid); the full report is on the Data & QC tab.",
    refs: [],
  },
};

/** Order of sections on the Methods page. */
export const METHODS_ORDER: string[] = [
  "data",
  "lights",
  "states",
  "bouts",
  "sensitivity",
  "activity",
  "cosinor",
  "nonparametric",
  "actogram",
  "stats",
  "exclusions",
];
