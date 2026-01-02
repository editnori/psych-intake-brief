import type { TemplateSection } from './types'

export const TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    id: 'intake_id',
    title: 'ID / Chief Summary',
    guidance: '4 lines (no "Line X:" prefix):\n[age]-year-old [sex/gender]; DOB [MM/DD/YYYY] (pronouns if documented)\nPresenting for psychiatric evaluation.\nKey psychiatric history: [diagnoses]; [hospitalizations]; [suicide attempts]; [self-harm/violence].\nChief summary: (2-3 sentences)\n\nExample:\n33-year-old female (she/her); DOB 05/14/1991\nPresenting for psychiatric evaluation.\nKey psychiatric history: MDD; no prior psych hospitalizations; no suicide attempts; no self-harm or violence history.\nChief summary: ED presentation 11/2024 for worsening depressive symptoms with insomnia and passive SI amid job loss.',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'reason_for_visit',
    title: 'Reason for Visit',
    guidance: 'One sentence: immediate reason for this encounter.\n\nExample: Evaluated for worsening depressive symptoms with insomnia and passive SI without plan.',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'hpi',
    title: 'History of Present Illness (HPI)',
    guidance: 'Chronological narrative by care episode. Use bold labels with bulleted content.\n\n**Symptom timeline/course:**\n- Depressed mood x3 months\n- Anhedonia\n- Insomnia (4-5 hrs/night)\n- Decreased appetite\n- 6-lb weight loss\n\n**Precipitating factors/stressors:**\n- Job loss with financial strain\n\n**Care episodes:**\n- ED 11/02/2024 → inpatient 11/02-11/06/2024 for depression and passive SI\n- Sertraline 50mg and trazodone started\n- Outpatient eval 11/15/2024; sertraline increased to 100mg\n\n**Safety:**\n- Passive SI without plan at ED\n- Denies HI\n\n**Substance context:**\n- Alcohol 1-2 drinks/weekends\n- Cannabis occasional',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'interview',
    title: 'Interview Highlights',
    guidance: 'Use bold labels with bulleted content.\n\n**Patient quotes:**\n- "I can\'t sleep and I\'ve been feeling hopeless."\n\n**Self-reported symptoms:**\n- Depressed mood\n- Anhedonia\n- Insomnia\n\n**Observed/MSE:**\n- Constricted affect\n- Linear thought process\n- No psychosis\n\n**Measures:**\n- PHQ-9 18 (moderately severe)',
    visibilityCondition: 'has-interview-notes',
    hidden: true,
    audience: 'all',
    exportable: true,
  },
  {
    id: 'psychometrics',
    title: 'Psychometrics',
    guidance: 'Use bold measure names with bulleted details. Supported scales: PHQ-9, GAD-7, AUDIT, MDQ, PC-PTSD-5, C-SSRS.\n\n**PHQ-9:**\n- Score: 18/27 (moderately severe)\n- Date: 11/15/2024\n- Elevated items:\n  - Low interest (3)\n  - Depressed mood (3)\n  - Sleep (3)\n  - Fatigue (2)\n\n**GAD-7:**\n- Not completed\n\n**C-SSRS:**\n- SI screener negative',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'psych_ros',
    title: 'Psychiatric Review of Systems',
    guidance: 'Use bold domain labels with bulleted symptoms. Use + for present, - for absent, ? for not assessed.\n\n**Mood:**\n- Depressed mood (+)\n- Anhedonia (+)\n\n**Anxiety:**\n- Worry (+)\n- Panic (-)\n\n**Psychosis:**\n- AH/VH (-)\n- Paranoia (-)\n\n**Safety:**\n- SI passive (+)\n- Plan (-)\n- HI (-)\n\n**Trauma:**\n- Emotional abuse (+)\n\n**Substance:**\n- Alcohol occasional',
    visibilityCondition: 'has-interview-notes',
    hidden: true,
    audience: 'all',
    exportable: true,
  },
  {
    id: 'past_psych_history',
    title: 'Psychiatric History',
    guidance: 'Use bold headers with bulleted content. Badge BEFORE diagnosis. Skip empty sections entirely.\n\n**Diagnoses:**\n- [+] Major Depressive Disorder, recurrent, moderate\n- [+] Generalized Anxiety Disorder\n- [?] PTSD (r/o)\n\n**Course of Illness:**\n- Onset: first depressive episode age 22\n- Course: three major episodes over 10 years\n\n**Hospitalizations:**\n- 11/02-11/06/2024: depression with passive SI\n\n**Suicide attempts:**\n- None documented\n\n**Self-harm:**\n- Denies\n\n**Medication trials:**\n- Sertraline 50mg → 100mg: tolerated, no side effects\n- Trazodone 50mg nightly: sleep improved\n\n**Psychotherapy:**\n- CBT group 2 years ago: partial benefit\n- Outpatient therapy: intermittent',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'family_psych_history',
    title: 'Family Psychiatric History',
    guidance: 'Use bulleted list with relation and diagnosis. Badge for severity/relevance.\n\n- Mother: bipolar I\n- MGM: completed suicide age 55\n- Father: alcohol use disorder\n- No known family psychiatric hospitalizations',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'medical_history',
    title: 'Medical History',
    guidance: 'Use vertical bulleted lists under bold labels. NEVER use inline/horizontal lists.\n\n**PCP:**\n- Dr. Smith, Family Medicine\n\n**Conditions:**\n- Hypothyroidism\n- Migraines\n\n**Surgeries:**\n- Appendectomy 2015\n\n**Allergies:**\n- NKDA\n\n**Non-psych meds:**\n- Levothyroxine 75mcg daily\n\n**Vitals:**\n- BP 128/82\n- HR 78\n- BMI 26\n\n**Labs:**\n- TSH 2.1\n- Vit D 18 (low)\n- UDS THC+\n- EtOH negative',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'substance_use',
    title: 'Substance Use History',
    guidance: 'Use vertical format for each substance. Badge shows disorder status. Colon separators.\n\nSeverity thresholds: mild 2-3, moderate 4-5, severe 6+\n\n**Alcohol:** [-] no AUD\n- Onset: 18\n- Pattern: 1-2 drinks/weekends\n- Last use: 10/2024\n- Criteria: 0/11\n\n**Cannabis:** [?] insufficient data\n- Onset: unknown\n- Pattern: occasional\n- Last use: 10/2024 per report; UDS THC+ 11/2024\n- Criteria: 0/11 documented\n\n**Tobacco:** [-] no TUD\n- Denies\n\n**Opioids:** [-] no OUD\n- Denies\n\n**Stimulants:** [-] no SUD\n- Denies\n\n**Sedatives/Hypnotics/Anxiolytics:** [-] no disorder\n- Denies\n\n**Hallucinogens:** [-] no disorder\n- Denies',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'social_history',
    title: 'Social History & Functioning',
    guidance: 'Use bold labels with bulleted content. NEVER use semicolon-separated inline lists.\n\n**Living:**\n- Alone in rented apartment\n\n**Support:**\n- One close friend\n- Limited contact with parents\n\n**Education:**\n- Bachelor\'s degree\n\n**Employment:**\n- Laid off from marketing position\n\n**Legal:**\n- None\n\n**Trauma:**\n- Emotional abuse in childhood\n\n**Functioning:**\n- Financial strain\n- Transportation barriers',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'barriers_strengths',
    title: 'Barriers & Strengths',
    guidance: 'Use bold labels with bulleted content.\n\n**Barriers:**\n- Transportation\n- Financial strain\n- Limited local supports\n\n**Strengths:**\n- Motivated for treatment\n- Insight\n- Strong work history',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'assessment',
    title: 'Assessment (Clinical Summary)',
    guidance: '3-5 sentences synthesizing: symptom clusters, stressors, functional status, diagnostic impressions. No treatment plan.\n\nGUARDRAILS:\n- Include ONLY diagnoses explicitly stated in source documents\n- Do NOT suggest new diagnoses (no "consider," "likely," "possible")\n- Use "r/o" only if rule-out is documented in sources\n- Focus on criteria mapping, not diagnostic inference\n\nExample:\nRecords describe a 3-month depressive syndrome with neurovegetative features and functional impairment. Passive SI at ED without plan; no suicide attempts. PHQ-9 18 indicates moderately severe depression. Stressors include job loss, financial strain, limited supports. Documented diagnoses: MDD recurrent moderate; GAD.',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'problem_list',
    title: 'Problem List & Plan',
    guidance: 'Start with disposition header, then numbered problems. Badge BEFORE diagnosis, colon separator.\n\nGUARDRAILS:\n- Include ONLY diagnoses documented in source records\n- Do NOT add diagnoses even if criteria appear met\n- Use specifiers from sources; mark unknown specifiers with [?]\n- If source says "r/o [diagnosis]", list as "Rule out: [diagnosis]"\n\nDSM-5-TR specifier format: [Disorder], [severity], [course], [features]\n\nFormat:\nDisposition: [level of care]; Safety plan: [status/date]; Follow-up: [timing]\n\n1. [+] **Major Depressive Disorder, recurrent, moderate**: Sertraline 100mg daily; weekly CBT\n2. [+] **Generalized Anxiety Disorder**: Continue SSRI; therapy focus on worry management\n3. [?] **Insomnia Disorder**: Trazodone 50mg PRN; sleep hygiene education\n4. [?] **Posttraumatic Stress Disorder**: Continue diagnostic assessment in outpatient care',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'dsm5_analysis',
    title: 'DSM-5 Criteria Analysis',
    guidance: `FORMATTING RULES (MANDATORY - VIOLATIONS WILL BE REJECTED):
- NEVER use inline semicolon-separated lists (e.g., "A1 depressed mood; A2 anhedonia; A3 appetite")
- NEVER put multiple criteria on one line or in one paragraph
- Each criterion MUST be its own bullet point with badge [+]/[-]/[?] at START
- Use bold **Headers:** for each subsection
- Each diagnosis gets its own block with blank line separation

GUARDRAILS:
- Map evidence to criteria; do NOT diagnose
- State what is documented, not what is likely
- Use [?] liberally for undocumented criteria
- Analyze ONLY diagnoses already documented in sources

Notation: [+] met, [-] not met, [?] unknown, [p] partial

COPY THIS FORMAT EXACTLY:

**Major Depressive Disorder (MDD):** [p] partial criteria

**Symptom Criteria:**
- [+] A1 Depressed mood: "depressed mood for 3 months"
- [+] A2 Anhedonia: "anhedonia"
- [+] A3 Weight/appetite: "decreased appetite, 6-lb weight loss"
- [+] A4 Sleep disturbance: "insomnia"
- [?] A5 Psychomotor change: not documented
- [+] A6 Fatigue: "low energy"
- [?] A7 Worthlessness/guilt: not documented
- [+] A8 Concentration: "poor concentration"
- [+] A9 Suicidal ideation: "passive SI"

**Thresholds:**
- [+] Symptom count: 7/9 (requires 5+)
- [+] Duration: "3 months"
- [?] Impairment: not explicitly documented

**Rule-outs:**
- [-] Mania: denies
- [?] Substance-induced: UDS THC positive
- [?] Medical causes: not documented

**Missing for certainty:**
- Psychomotor change
- Worthlessness/guilt
- Functional impairment details`,
    clinicianOnly: true,
    doNotCopyForward: true,
    audience: 'clinician-only',
    exportable: false,
  },
  {
    id: 'followup_safety',
    title: 'Safety',
    guidance: 'Use bold labels with bulleted content. NEVER use semicolon-separated inline lists.\n\n**Safety plan:**\n- Reviewed 11/06/2024\n\n**Risk factors:**\n- Passive SI\n- Job loss\n- Limited support\n- Lives alone\n- Family suicide history\n\n**Protective factors:**\n- Engaged in treatment\n- Future-oriented\n- Supportive friend\n- No lethal means access',
    audience: 'all',
    exportable: true,
  },
  {
    id: 'documentation_note',
    title: 'Documentation Note',
    guidance: '2-3 sentences: sources reviewed, interview/collateral status.\n\nExample: Reviewed: Discharge summary 11/06/2024; psych eval 11/15/2024; biopsychosocial 10/29/2024. No live interview; summary based on records.',
    audience: 'all',
    exportable: true,
  }
]
