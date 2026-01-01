# Psych Intake Brief

A structured harness for psychiatric intake documentation using GPT-5.2.

This tool wraps a language model with clinical workflow automation: local document parsing, per-section evidence ranking, DSM-5 integration, and citation tracking. The model is standard OpenAI. The difference is in how the interaction gets structured.

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (package manager)
- [Rust](https://rustup.rs/) (for Tauri desktop builds)
- OpenAI API key

### Install & Run

```bash
# Install dependencies
bun install

# Start development server (web)
bun run dev

# Or run as desktop app
bun run tauri:dev
```

### Configuration

Add your API key in the app settings, or create `.env.local`:

```env
VITE_OPENAI_API_KEY=your-openai-key
```

---

## What It Does

Psychiatric intake documentation involves synthesizing multiple source documents: discharge summaries, biopsychosocial assessments, psychiatric evaluations. These documents overlap in content but emphasize different things. The clinician's job is to pull all of this into something coherent.

Done manually, this takes 20-40 minutes per intake.

This tool automates the synthesis with eight components:

1. **Local Parsing** (`src/lib/parser.ts`) — PDF/DOCX extraction on your machine, document type detection, date extraction, chunking with unique identifiers
2. **Evidence Ranking** (`src/lib/evidence.ts`) — Token-based scoring to select relevant chunks per section, source diversification across documents
3. **LLM Orchestration** (`src/lib/llm.ts`) — Separate API calls per section, embedded clinical instructions, JSON schema enforcement
4. **Template System** (`src/lib/template.ts`) — 17 predefined sections with format guidance, DSM-5-TR specifier chain requirements
5. **DSM Integration** (`src/lib/dsm.ts`) — Criterion indexing, clinical synonym expansion, structured notation ([+] met, [-] not met, [?] unknown)
6. **Output Processing** (`src/lib/textUtils.ts`, `src/components/Markdown.tsx`) — Chunk ID stripping, callout detection, DSM badge rendering
7. **Citation System** — Bidirectional mapping from generated text to source excerpts
8. **Privacy Architecture** — Local parsing, fragmented requests (no single request contains complete record), `store: false` on all API calls

---

## Example Output

For a patient with depression:

```
MDD (meets criteria)
A1 depressed mood [+] — "feeling down 3 months"
A2 anhedonia [+] — "no interest in activities"
A3 weight [+] — "6-lb weight loss"
A4 sleep [+] — "insomnia, 4-5 hours/night"
A5 psychomotor [-]
A6 fatigue [+] — "low energy"
A7 worthlessness [?]
A8 concentration [+] — "poor concentration at work"
A9 SI [+] — "passive SI, no plan"
Threshold: 7/9, required 5+ [MET]
```

Substance use with criteria counts:
```
Alcohol: onset not documented; 1-2 drinks/weekends; 0/11 criteria; no AUD
Cannabis: onset not documented; 1-2x/month; 0/11 criteria; no CUD
```

---

## Comparison with ChatGPT

| Aspect | ChatGPT | Psych Intake Brief |
|--------|---------|-------------------|
| Data handling | Complete record in single request | Fragmented across N requests |
| Citations | Available when prompted | Automatic with schema enforcement |
| DSM notation | Available when prompted | Embedded in template |
| Format consistency | Varies by session | Enforced by schema |
| Verification | Manual document search | Click-to-excerpt |
| Gap flagging | Available when prompted | Automatic with rationale |
| Local processing | None | PDF/DOCX on device |
| Data retention | Per OpenAI settings | Explicitly disabled |

---

## Development

```bash
# Type checking
bun run typecheck

# Production build (web)
bun run build

# Production build (desktop)
bun run tauri:build
```

### Desktop Releases

Releases build automatically for Windows (NSIS), macOS (DMG), and Linux (AppImage, DEB).

To create a release:
```bash
git tag v0.0.x-alpha
git push origin v0.0.x-alpha
```

---

## Versioning

| Version | Meaning |
|---------|---------|
| `0.0.x` | Alpha — breaking changes expected |
| `0.x.0` | Beta — feature-complete for testing |
| `x.0.0` | Stable — production-ready |

Current: `0.0.x` (Alpha)

---

## Privacy

- Document parsing happens locally (pdfjs-dist, mammoth)
- Per-section API calls fragment the record across requests
- All API calls include `store: false`
- Your API key goes directly to OpenAI with no intermediary

HIPAA compliance requires legal analysis of your specific deployment context.

---

## Documentation

See `docs/Psych_Intake_Brief_Technical_Documentation.pdf` for detailed architecture diagrams and the complete Jane case walkthrough.

---

## License

Proprietary — All rights reserved.

**Author**: Dr. Layth M Qassem PharmD MSACI
