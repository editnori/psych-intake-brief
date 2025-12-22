import type { TemplateSection } from './types'

export const TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    id: 'intake_id',
    title: 'ID / Chief Summary',
    guidance: 'Format as 2-4 short labeled lines (no bullets). Line 1: "[age]-year-old; DOB [MM/DD/YYYY]" (sex if documented). Line 2: "Key psychiatric history: ..." Line 3: "Chief summary: ..." Keep to 3-4 sentences max.\nExample:\n33-year-old; DOB 05/14/1991\nKey psychiatric history: MDD, intermittent therapy, no prior psych hospitalizations\nChief summary: ED visit 11/2024 for worsening depression with insomnia and passive SI amid job loss.',
  },
  {
    id: 'reason_for_visit',
    title: 'Reason for Visit',
    guidance: 'State the specific, immediate reason for this encounter in one sentence. No subheaders or bullets.\nExample: Evaluated for worsening depressive symptoms with insomnia and passive SI without plan.',
  },
  {
    id: 'hpi',
    title: 'History of Present Illness (HPI)',
    guidance: 'Use short labeled lines in this order: Symptom timeline/course; Precipitating factors/stressors; Care episodes related to current episode; Safety (SI/HI); Substance context (if relevant). 1-2 sentences each. Use specific timeframes (e.g., "over 3 weeks" not "recently").\nExample:\nSymptom timeline/course: Depressed mood and anhedonia x3 months with low energy and insomnia.\nPrecipitating factors/stressors: Laid off from marketing job; financial strain.\nCare episodes: ED 11/02/2024 with inpatient stay 11/02-11/06; outpatient eval 11/15/2024.\nSafety (SI/HI): Passive SI without plan; denies HI.\nSubstance context: Alcohol 1-2 drinks on weekends; cannabis occasional.',
  },
  {
    id: 'interview',
    title: 'Interview Highlights',
    guidance: 'Use labeled lines: Patient quotes; Self-reported symptoms; Observed/MSE; Measures. 1-2 sentences each. Focus on clinically actionable observations.\nExample:\nPatient quotes: I can\'t sleep and I\'ve been feeling hopeless.\nSelf-reported symptoms: Depressed mood, anhedonia, low energy, poor concentration, insomnia.\nObserved/MSE: Constricted affect, linear thought process, no psychosis.\nMeasures: PHQ-9 18 (moderately severe).',
  },
  {
    id: 'phq9',
    title: 'PHQ-9',
    guidance: 'Format: "PHQ-9: [score]/27 (severity) on [date]." Then: "Elevated items: sleep (3); energy (2); concentration (2)." If not documented, state "PHQ-9: Not completed." Avoid bullets.\nExample: PHQ-9: 18/27 (moderately severe) on 11/15/2024. Elevated items: low interest (3); depressed mood (3); sleep (3); fatigue (2); poor appetite (2); concentration (2).',
  },
  {
    id: 'psych_ros',
    title: 'Psychiatric Review of Systems',
    guidance: 'One line per domain with labels (Mood, Anxiety, Psychosis, Safety, Trauma, Substance). Use semicolons; mark "not assessed" if absent. No bullets.\nExample: Mood: depressed mood+, anhedonia+; Anxiety: increased worry+; Psychosis: denies; Safety: SI passive+, plan-; Trauma: emotional abuse+; Substance: alcohol occasional, cannabis occasional.',
  },
  {
    id: 'psychiatric_history',
    title: 'Psychiatric History',
    guidance: 'Short labeled lines; include age of onset, major episodes, and pattern of illness. Distinct from past psych history (which lists discrete events).\nExample: Onset: first depressive episode age 22. Course: three major episodes over 10 years, each 3-6 months.',
  },
  {
    id: 'past_psych_history',
    title: 'Past Psychiatric History',
    guidance: 'Use labeled lines with semicolons for multiple items (Diagnoses; Hospitalizations; Suicide attempts; Self-harm; Medication trials). Avoid bullets unless listing multiple discrete events.\nExample: Diagnoses: MDD recurrent; GAD. Hospitalizations: 11/02/2024-11/06/2024 for depression/SI. Suicide attempts: none. Self-harm: denies. Medication trials: sertraline 50mg started 11/2024, increased to 100mg; trazodone 50mg nightly PRN.',
  },
  {
    id: 'family_psych_history',
    title: 'Family Psychiatric History',
    guidance: 'Use 1-2 labeled lines (Relation: diagnosis/behavior). Note family suicide, substance use, and psychiatric hospitalizations if documented.\nExample: Mother: bipolar I. MGM: completed suicide age 55. Father: alcohol use disorder.',
  },
  {
    id: 'medical_history',
    title: 'Medical History',
    guidance: 'Short labeled lines for active medical conditions, surgeries, allergies, and non-psych meds. Prioritize thyroid, autoimmune, neuro, chronic pain, TBI, sleep disorders. Avoid bullets.\nExample: Conditions: hypothyroidism, migraines. Surgeries: appendectomy 2015. Allergies: NKDA. Non-psych meds: levothyroxine 75 mcg daily.',
  },
  {
    id: 'substance_use',
    title: 'Substance Use (Biopsychosocial)',
    guidance: 'One line per substance: "[Substance]: onset, pattern, last use, quantity; withdrawal hx; prior tx." Use semicolons. Avoid bullets unless many substances.\nExample: Alcohol: onset 18, 1-2 drinks on weekends, last use 1 week ago; withdrawal denies; prior tx none. Cannabis: occasional, last use 2 weeks ago; withdrawal not documented.',
  },
  {
    id: 'treatment_hx',
    title: 'Treatment History',
    guidance: 'Short labeled lines for psychotherapy/med management, programs (PHP/IOP), ECT/TMS. Include dates, duration, and response. Avoid bullets.\nExample: Psychotherapy: CBT group 2 years ago, partial benefit. Programs: no PHP/IOP. ECT/TMS: none.',
  },
  {
    id: 'medical_ros',
    title: 'Medical ROS / Recent Labs',
    guidance: 'Relevant positives only. ROS in 1-2 labeled lines. Labs: use semicolon-separated inline format, NOT a table. List individual tests with values, not panel names. Format abnormals with qualifier in parentheses. Skip if normal or not documented.\nExample: ROS: appetite decreased; sleep poor. Labs: Na 139; K 4.1; Cl 102; TSH 2.1; Vit D 18 (low); UDS THC positive.',
  },
  {
    id: 'social_history',
    title: 'Social History & Functioning',
    guidance: 'Use labeled lines for living, support, education, employment, legal, trauma, functioning. Avoid bullets.\nExample: Living: alone in rented apartment. Support: one close friend; limited contact with parents. Education: bachelor\'s degree. Employment: laid off from marketing position. Legal: none. Trauma: emotional abuse in childhood. Functioning: financial strain; transportation barriers.',
  },
  {
    id: 'barriers_strengths',
    title: 'Barriers & Strengths',
    guidance: 'Two labeled lines only:\nBarriers: ...\nStrengths: ...\nBe specific, not generic.\nExample:\nBarriers: transportation challenges, financial strain, limited local supports.\nStrengths: motivated for treatment, insight, strong work history.',
  },
  {
    id: 'assessment',
    title: 'Assessment (Clinical Summary)',
    guidance: 'Start with "Key highlights: ..." on one line (semicolon-separated items). Then 2-4 sentences synthesizing: symptom clusters, stressors, functional status, diagnostic impressions from records. No treatment plan here. No DSM criteria analysis. Avoid bullets.\nExample: Key highlights: 3-month depressive syndrome; passive SI without plan; job loss stressor. Synthesis: Depressive symptoms with neurovegetative features and PHQ-9 18; denies mania/psychosis. Stressors include job loss, financial strain, and limited supports.',
  },
  {
    id: 'summary_plan',
    title: 'Summary / Plan',
    guidance: 'Start with "Key highlights: ..." on one line (semicolon-separated items). Then brief narrative: disposition, level of care, medication considerations, therapy recommendations, safety plan status. 3-5 sentences max. Avoid bullets.\nExample: Key highlights: continue SSRI; safety plan reviewed. Plan: Increase sertraline to 100mg; continue trazodone PRN; start weekly therapy; follow up psychiatry in 2 weeks and therapy in 1 week.',
  },
  {
    id: 'problem_list',
    title: 'Problem List & Plan',
    guidance: 'Numbered problem list with per-problem plan:\n1. **MDD, recurrent, moderate** — Continue sertraline 100mg; therapy referral\n2. **GAD** — Consider buspirone adjunct\n3. **Insomnia** — Sleep hygiene, consider trazodone\n\nUse clinical language, not ICD codes.\nExample:\n1. **MDD, recurrent, moderate** — Sertraline 100mg daily; weekly therapy\n2. **GAD** — Continue SSRI; therapy focus on anxiety\n3. **Insomnia** — Trazodone 50mg nightly PRN',
  },
  {
    id: 'dsm5_analysis',
    title: 'DSM-5 Criteria Analysis',
    guidance: 'For each considered diagnosis, map evidence to DSM-5-TR criteria and explicitly check diagnostic thresholds. Format:\nDx (status: meets/partial/insufficient/provisional)\nCriteria: A1 ...; A2 ... (cite evidence)\nThresholds: symptom count / duration / impairment (met/partial/unknown)\nRule-outs: substance/medical causes and mania/hypomania when relevant (documented or unknown)\nMissing for certainty: [specific items]\n\nUse cautious language and avoid extra headings. Do not add new diagnoses.\nExample:\nMDD (status: provisional)\nCriteria: A1 depressed mood; A2 anhedonia; A3 insomnia; A6 fatigue; A8 poor concentration; A9 passive SI.\nThresholds: symptom count met; duration met (3 months); impairment unknown.\nRule-outs: mania/hypomania denied; substance/medical causes not documented.\nMissing for certainty: functional impairment; 2-week clustering; medical/substance rule-out.',
  },
  {
    id: 'followup',
    title: 'Follow-up & Safety',
    guidance: 'Use labeled lines: Follow-up, Safety plan, Crisis resources, Risks discussed. Avoid bullets.\nExample: Follow-up: psychiatry in 2 weeks; therapy in 1 week. Safety plan: reviewed. Crisis resources: 988 and ED/911. Risks discussed: medication risks/benefits.',
  },
  {
    id: 'documentation_note',
    title: 'Documentation Note',
    guidance: '2-3 sentences listing sources reviewed and interview/collateral. Avoid bullets.\nExample: Reviewed: Discharge summary 11/06/2024; psych eval 11/15/2024; biopsychosocial 10/29/2024; labs 11/01/2024. No live interview; summary based on records.',
  }
]
