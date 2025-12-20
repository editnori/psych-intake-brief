# Psych Intake Composer (POC)

Local-first intake summarization with structured template output and citations. All files are processed locally; only the configured OpenAI endpoint is called for generation.

## Quick start

```bash
bun install
bun dev
```

## Features
- Upload `.txt`, `.docx`, or `.pdf` files (PDF parsing is stubbed for now).
- One-click **Generate summary** with section streaming.
- Patient profile + auto-saved case state with searchable dashboard.
- Add interview notes after the fact to enrich context.
- Export to DOCX/PDF with embedded citations and optional chat addenda.
- Chat panel to ask questions and auto-apply responses to the selected section.

## Notes
- Configure OpenAI settings via the Settings modal.
- The intake template is stored at `public/templates/intake-template.docx`.
- Example notes are available via the “Load examples” button.
- This POC stores the API key locally in the browser; do not use production keys in a shared environment.
