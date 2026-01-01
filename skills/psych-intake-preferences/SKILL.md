---
name: psych-intake-preferences
description: Non-visual product and content preferences for the Psych Intake Brief repo (local-first data handling, evidence-backed summaries with strict citations, template-driven section rules, and minimal open questions). Use when making UX/product changes, editing generation prompts or section guidance, modifying citation behavior, or changing export/persistence flows.
---

# Psych Intake Preferences

## Overview

Capture the repo's design preferences beyond visual style: how the app behaves, how clinical summaries are written, and how evidence/citations are enforced. Use this to keep new features or edits aligned with the existing intent.

## Core Preferences

- Preserve local-first privacy: keep settings, cases, and source data in local storage; avoid server persistence; only call OpenAI for generation or optional PDF vision.
- Require evidence for every factual statement; if citations are empty, return empty output and surface missing-citation warnings.
- Keep tone concise and clinical; use direct statements, short labeled lines, and section-specific formats; avoid hedging, filler, and meta-commentary.
- Keep sections distinct and non-duplicative; never repeat section titles or copy facts across sections.
- Keep open questions rare and clinically essential; cap at 1 per section; avoid demographics/metadata; always include clinical impact.
- Keep DSM-5 analysis cautious and evidence-mapped; avoid adding new diagnoses or unsupported claims.

## Workflow and UX Preferences

- Keep the template-driven workflow: sections can be reordered/hidden and have editable guidance; generation must honor section guidance.
- Provide evidence transparency: show citation counts, warnings, and previewable excerpts; keep ask/edit flows tied to citations.
- Preserve follow-up flow: post-interview notes produce addenda only, use follow-up sources for citations, and avoid rewriting existing content.
- Confirm destructive actions (deleting content, removing open questions, clearing outputs).
- Prefer local PDF parsing by default; allow OpenAI vision only as explicit opt-in.

## Prompt and Output Invariants

- Keep JSON-only responses with keys `{ text, citations }` for generation and Q&A.
- Enforce citation-per-fact; if unsupported, omit the statement entirely.
- Keep formatting constraints: labeled lines, no nested lists, explicit timeframes, and standard medication formatting.
- Keep de-dup behavior: use other sections only to avoid repetition, not as evidence.

## Sources of Truth

Open these files when details are needed; treat them as the canonical rules.

- `src/lib/template.ts` (section list, guidance, and examples)
- `src/App.tsx` (section rules, open-question rules, UI behaviors)
- `src/lib/llm.ts` (prompt constraints, evidence rules, JSON formats)
- `src/lib/exporters.ts` (citation numbering and export formatting)
- `src/lib/evidence.ts` (evidence ranking and diversity)
- `src/lib/caseStore.ts` and `src/lib/storage.ts` (local-first persistence)
- `readme.md` and `README.md` (product scope and local-first claims)
