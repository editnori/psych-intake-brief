import type { TemplateSection } from './types'

export const TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    id: 'intake_id',
    title: 'ID / Chief Summary',
    guidance: 'Summarize age, gender, key psychiatric history, and presenting reason for evaluation.',
    placeholder: 'Patient is a __ year old __ with a psychiatric history of __ presenting for __.'
  },
  {
    id: 'reason_for_visit',
    title: 'Reason for Visit',
    guidance: 'State the immediate reason for evaluation or referral.',
    placeholder: 'Referred for ...'
  },
  {
    id: 'hpi',
    title: 'History of Present Illness (HPI)',
    guidance: 'Include narrative from discharge summaries, outside hospital records, prior psych evaluations/progress notes, and biopsychosocial assessment.',
    placeholder: 'Concise narrative of presenting symptoms, timeline, and prior events.'
  },
  {
    id: 'interview',
    title: 'Interview Highlights',
    guidance: 'Key statements from patient interview and current presentation.',
    placeholder: 'Patient reports ...'
  },
  {
    id: 'phq9',
    title: 'PHQ-9',
    guidance: 'Include score and clinically relevant items if present.',
    placeholder: 'PHQ-9: __ (date).'
  },
  {
    id: 'psych_ros',
    title: 'Psychiatric Review of Systems',
    guidance: 'List symptoms by category (depression, anxiety, mania, psychosis, trauma, substance use), noting positives/negatives.',
    placeholder: 'Depression: ... | Anxiety: ...'
  },
  {
    id: 'psychiatric_history',
    title: 'Psychiatric History',
    guidance: 'Summarize prior psychiatric history using available records.',
    placeholder: 'Summary of prior psychiatric course.'
  },
  {
    id: 'past_psych_history',
    title: 'Past Psychiatric History',
    guidance: 'Include diagnoses, treatment, medication trials, hospitalizations, suicidality/self-harm.',
    placeholder: 'Prior diagnoses: ...'
  },
  {
    id: 'family_psych_history',
    title: 'Family Psychiatric History',
    guidance: 'Psychiatric illness, substance use, and suicide history in family.',
    placeholder: 'Family history includes ...'
  },
  {
    id: 'medical_history',
    title: 'Medical History',
    guidance: 'Chronic medical conditions and relevant medical history.',
    placeholder: 'No known chronic medical conditions / ...'
  },
  {
    id: 'substance_use',
    title: 'Substance Use (Biopsychosocial)',
    guidance: 'List substances with onset, last use, withdrawal history, and prior treatment when available.',
    placeholder: 'EtOH: ... Opioids: ...'
  },
  {
    id: 'treatment_hx',
    title: 'Treatment History',
    guidance: 'Relevant treatment history from biopsychosocial notes.',
    placeholder: 'Prior therapy, programs, or supports.'
  },
  {
    id: 'medical_ros',
    title: 'Medical ROS / Recent Labs',
    guidance: 'Summarize pertinent ROS and labs if documented.',
    placeholder: 'ROS: ... Labs: ...'
  },
  {
    id: 'social_history',
    title: 'Social History & Functioning',
    guidance: 'Living situation, relationships/support, education, employment, legal problems, trauma history.',
    placeholder: 'Living situation: ...'
  },
  {
    id: 'barriers_strengths',
    title: 'Barriers & Strengths',
    guidance: 'List barriers to care and protective strengths from biopsychosocial assessment.',
    placeholder: 'Barriers: ... Strengths: ...'
  },
  {
    id: 'summary_plan',
    title: 'Summary / Plan',
    guidance: 'High-level summary of findings and plan. (DSM-5 criteria section can be added later.)',
    placeholder: 'Summary and plan.'
  },
  {
    id: 'problem_list',
    title: 'Problem List & Plan',
    guidance: 'List problems (potential DSM diagnoses) and plan per item.',
    placeholder: 'Problem #1: ... Plan: ...'
  },
  {
    id: 'followup',
    title: 'Follow-up & Safety',
    guidance: 'Follow-up timing, risks/benefits discussed, safety planning, crisis resources.',
    placeholder: 'Follow-up in __ weeks. Safety plan reviewed.'
  },
  {
    id: 'documentation_note',
    title: 'Documentation Note',
    guidance: 'Document chart review sources and interview basis.',
    placeholder: 'Documentation completed via chart review and patient interview.'
  }
]
