import type { TemplateSection } from './types'

export const TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    id: 'intake_id',
    title: 'ID / Chief Summary',
    guidance: '4 lines (no "Line X:" prefix):\n[age]-year-old [sex/gender]; DOB [MM/DD/YYYY] (pronouns if documented)\nPresenting for psychiatric evaluation.\nKey psychiatric history: [diagnoses]; [hospitalizations]; [suicide attempts]; [self-harm/violence].\nChief summary: (2-3 sentences)\n\nExample:\n33-year-old female (she/her); DOB 05/14/1991\nPresenting for psychiatric evaluation.\nKey psychiatric history: MDD; no prior psych hospitalizations; no suicide attempts; no self-harm or violence history.\nChief summary: ED presentation 11/2024 for worsening depressive symptoms with insomnia and passive SI amid job loss.',
  },
  {
    id: 'reason_for_visit',
    title: 'Reason for Visit',
    guidance: 'One sentence: immediate reason for this encounter.\n\nExample: Evaluated for worsening depressive symptoms with insomnia and passive SI without plan.',
  },
  {
    id: 'hpi',
    title: 'History of Present Illness (HPI)',
    guidance: 'Chronological narrative by care episode. Prioritize: (1) discharge summaries, (2) psych evals, (3) biopsychosocial.\n\nStructure:\n- Symptom timeline/course\n- Precipitating factors/stressors\n- Care episodes with treatment changes\n- Safety (SI/HI at each episode)\n- Substance context if relevant\n\nExample:\nSymptom timeline/course: Depressed mood x3 months with anhedonia, insomnia (4-5 hrs/night), decreased appetite, 6-lb weight loss.\nPrecipitating factors/stressors: Job loss with financial strain.\nCare episodes: ED 11/02/2024 → inpatient 11/02-11/06/2024 for depression and passive SI; sertraline 50mg and trazodone started. Outpatient eval 11/15/2024; sertraline increased to 100mg.\nSafety: Passive SI without plan at ED; denies HI.\nSubstance context: Alcohol 1-2 drinks/weekends; cannabis occasional.',
  },
  {
    id: 'interview',
    title: 'Interview Highlights',
    guidance: 'Labeled lines: Patient quotes; Self-reported symptoms; Observed/MSE; Measures.\n\nExample:\nPatient quotes: "I can\'t sleep and I\'ve been feeling hopeless."\nSelf-reported symptoms: Depressed mood, anhedonia, insomnia.\nObserved/MSE: Constricted affect, linear thought process, no psychosis.\nMeasures: PHQ-9 18 (moderately severe).',
    visibilityCondition: 'has-interview-notes',
    hidden: true,
  },
  {
    id: 'psychometrics',
    title: 'Psychometrics (PHQ-9)',
    guidance: 'Format: "[Measure]: [score]/[max] (severity) on [date]." For PHQ-9: list elevated items. State "Not completed" if absent.\n\nExample:\nPHQ-9: 18/27 (moderately severe) on 11/15/2024. Elevated items: low interest (3); depressed mood (3); sleep (3); fatigue (2).\nGAD-7: Not completed.',
  },
  {
    id: 'psych_ros',
    title: 'Psychiatric Review of Systems',
    guidance: 'One line per domain (Mood, Anxiety, Psychosis, Safety, Trauma, Substance). Use semicolons; "not assessed" if absent.\n\nExample: Mood: depressed+, anhedonia+; Anxiety: worry+; Psychosis: denies; Safety: SI passive+, plan-; Trauma: emotional abuse+; Substance: alcohol occasional.',
    visibilityCondition: 'has-interview-notes',
    hidden: true,
  },
  {
    id: 'psychiatric_history',
    title: 'Psychiatric History',
    guidance: 'Age of onset, episode pattern, course of illness.\n\nExample:\nOnset: first depressive episode age 22.\nCourse: three major episodes over 10 years, each 3-6 months.',
  },
  {
    id: 'past_psych_history',
    title: 'Past Psychiatric History',
    guidance: 'Include: Diagnoses (full DSM-5-TR specifier chain), Hospitalizations, Suicide attempts, Self-harm, Medication trials, Psychotherapy, Programs, ECT/TMS.\n\nDSM-5 specifier format: [Disorder], [severity], [course], [features]\n\nExample:\nDiagnoses: Major Depressive Disorder, recurrent, moderate, with anxious distress; Generalized Anxiety Disorder; r/o PTSD.\nHospitalizations: 11/02-11/06/2024 for depression with passive SI.\nSuicide attempts: none.\nSelf-harm: denies.\nMedication trials: Sertraline 50mg → 100mg, tolerated; trazodone 50mg PRN.\nPsychotherapy: CBT group 2 years ago, partial benefit.\nPrograms: none.\nECT/TMS: none.',
  },
  {
    id: 'family_psych_history',
    title: 'Family Psychiatric History',
    guidance: '1-2 lines: Relation: diagnosis. Note family suicide, substance use, hospitalizations.\n\nExample: Mother: bipolar I. MGM: completed suicide age 55. Father: alcohol use disorder.',
  },
  {
    id: 'medical_history',
    title: 'Medical History',
    guidance: 'Include: PCP, conditions (prioritize thyroid/neuro/chronic pain/TBI), surgeries, allergies, non-psych meds, vitals, labs inline.\n\nExample:\nPCP: Dr. Smith, Family Medicine.\nConditions: hypothyroidism, migraines.\nSurgeries: appendectomy 2015.\nAllergies: NKDA.\nNon-psych meds: levothyroxine 75mcg daily.\nVitals: BP 128/82, HR 78, BMI 26.\nLabs: TSH 2.1; Vit D 18 (low); UDS THC+.',
  },
  {
    id: 'substance_use',
    title: 'Substance Use History',
    guidance: 'One line per substance. MUST include X/11 criteria count.\n\nSeverity thresholds: mild 2-3, moderate 4-5, severe 6+\n\nFormat: "[Substance]: [onset]; [pattern]; [last use]; [X]/11 criteria ([list if any]); [Dx or none]."\n\nExample:\nAlcohol: onset 18; 1-2 drinks/weekends; last use 1 week ago; 0/11 criteria; no AUD.\nCannabis: daily x2 years; last use yesterday; 2/11 criteria (tolerance, larger amounts); Cannabis Use Disorder, mild.\nOpioids: denies; 0/11 criteria; no OUD.\nTobacco: 1 pack/day x10 years; 4/11 criteria (tolerance, withdrawal, craving, continued despite problems); Tobacco Use Disorder, moderate.',
  },
  {
    id: 'social_history',
    title: 'Social History & Functioning',
    guidance: 'Labeled lines: Living, Support, Education, Employment, Legal, Trauma, Functioning.\n\nExample:\nLiving: alone in rented apartment.\nSupport: one close friend; limited contact with parents.\nEducation: bachelor\'s degree.\nEmployment: laid off from marketing position.\nLegal: none.\nTrauma: emotional abuse in childhood.\nFunctioning: financial strain; transportation barriers.',
  },
  {
    id: 'barriers_strengths',
    title: 'Barriers & Strengths',
    guidance: 'Two lines only. Be specific, not generic.\n\nExample:\nBarriers: transportation, financial strain, limited local supports.\nStrengths: motivated for treatment, insight, strong work history.',
  },
  {
    id: 'assessment',
    title: 'Assessment (Clinical Summary)',
    guidance: '3-5 sentences synthesizing: symptom clusters, stressors, functional status, diagnostic impressions. No treatment plan.\n\nExample:\nRecords describe a 3-month depressive syndrome with neurovegetative features and functional impairment. Passive SI at ED without plan; no suicide attempts. PHQ-9 18 indicates moderately severe depression. Stressors include job loss, financial strain, limited supports. Diagnoses: MDD recurrent moderate; GAD; r/o PTSD.',
  },
  {
    id: 'problem_list',
    title: 'Problem List & Plan',
    guidance: 'Start with disposition header, then numbered problems using full DSM-5-TR specifier chain.\n\nDSM-5-TR specifier format: [Disorder], [severity], [course], [features]\n- Severity: mild/moderate/severe\n- Course: single episode/recurrent, in partial/full remission\n- Features: with anxious distress, with melancholic features, with psychotic features, etc.\n\nFormat:\nDisposition: [level of care]; Safety plan: [status/date]; Follow-up: [timing]\n\n1. **[Full DSM-5-TR diagnosis]** — [Plan]\n\nExample:\nDisposition: Outpatient; Safety plan: reviewed 11/06/2024; Follow-up: psychiatry 2 weeks, therapy 1 week\n\n1. **Major Depressive Disorder, recurrent, moderate, with anxious distress** — Sertraline 100mg daily; weekly CBT; monitor for anxiety\n2. **Generalized Anxiety Disorder** — Continue SSRI; therapy focus on worry management\n3. **Insomnia Disorder, episodic** — Trazodone 50mg PRN; sleep hygiene education',
  },
  {
    id: 'dsm5_analysis',
    title: 'DSM-5 Criteria Analysis',
    guidance: 'CRITICAL: Use structured line-by-line notation. Do NOT write prose paragraphs.\n\nNotation (REQUIRED):\n[+] = met  [-] = not met  [?] = unknown  [p] = partial\n\nFor each diagnosis, output EXACTLY this format:\n\n**[Disorder]** (status: meets/partial/insufficient)\nA1 [symptom] [+/-/?] — "quote"\nA2 [symptom] [+/-/?] — "quote"\n... (list ALL criteria A1-A9 for MDD)\nThreshold: [X]/9 required 5+ [MET/NOT MET]\nDuration: [MET/?] — evidence\nImpairment: [+/?] — evidence\nRule-outs: mania [-/?]; substance [-/?]; medical [-/?]\nMissing: [items]\n\nExample:\n**MDD** (provisional)\nA1 depressed mood [+] — "feeling down 3 months"\nA2 anhedonia [+] — "no interest"\nA3 weight [+] — "6-lb loss"\nA4 sleep [+] — "insomnia 4-5 hrs"\nA5 psychomotor [-]\nA6 fatigue [+] — "low energy"\nA7 worthlessness [?]\nA8 concentration [+] — "poor concentration"\nA9 SI [+] — "passive SI no plan"\nThreshold: 7/9 required 5+ [MET]\nDuration: [MET] — 3 months\nImpairment: [?]\nRule-outs: mania [-]; substance [?]; medical [?]\nMissing: 2-week clustering; functional impairment link',
    clinicianOnly: true,
    doNotCopyForward: true,
  },
  {
    id: 'followup_safety',
    title: 'Follow-up & Safety',
    guidance: 'Three lines only:\n- Safety plan: [date or "not documented"]\n- Risk factors: [list]\n- Protective factors: [list]\n\nExample:\nSafety plan: Reviewed 11/06/2024.\nRisk factors: passive SI; job loss; limited support; lives alone; family suicide history.\nProtective factors: engaged in treatment; future-oriented; supportive friend; no lethal means access.',
  },
  {
    id: 'documentation_note',
    title: 'Documentation Note',
    guidance: '2-3 sentences: sources reviewed, interview/collateral status.\n\nExample: Reviewed: Discharge summary 11/06/2024; psych eval 11/15/2024; biopsychosocial 10/29/2024. No live interview; summary based on records.',
  }
]
