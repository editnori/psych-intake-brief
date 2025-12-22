# Psych Intake Brief

Local psychiatric intake summarization tool with AI-powered document analysis, template-based section generation, and citation tracking.

## Features

- **Document Upload**: Supports TXT, MD, DOCX, and PDF files
- **AI Summarization**: Uses OpenAI/Anthropic models to generate structured psychiatric intake summaries
- **Template System**: Customizable sections with reordering and visibility controls
- **Citation Tracking**: Links generated content back to source documents
- **Post-Interview Notes**: Add follow-up information and answer open questions
- **Export Options**: PDF and DOCX export with formatting

## Versioning

This project uses **semantic versioning** with the following scheme:

| Version | Meaning |
|---------|---------|
| `0.0.x` | Alpha releases — breaking changes expected, core features in development |
| `0.x.0` | Beta releases — feature-complete for testing, API may still change |
| `x.0.0` | Stable releases — production-ready |

**Current Status**: `0.0.x` (Alpha)

Each push increments the patch version (0.0.1 → 0.0.2 → 0.0.3, etc.) until feature completeness is reached.

## Development

### Prerequisites

- [Bun](https://bun.sh/) (package manager)
- [Rust](https://rustup.rs/) (for Tauri desktop builds)
- OpenAI or Anthropic API key

### Setup

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Type checking
bun run typecheck
```

### Desktop App (Tauri)

```bash
# Development
bun run tauri:dev

# Production build
bun run tauri:build
```

### Environment Variables

Create a `.env.local` file:

```env
VITE_OPENAI_API_KEY=your-openai-key
VITE_ANTHROPIC_API_KEY=your-anthropic-key
```

## Releases

Releases are automatically built for:
- **Windows** (NSIS installer)
- **macOS** (DMG, both Intel and Apple Silicon)
- **Linux** (AppImage, DEB)

To create a release, push a version tag:

```bash
git tag v0.0.1-alpha
git push origin v0.0.1-alpha
```

## License

Proprietary — All rights reserved.

---

**Author**: Dr. Layth M Qassem PharmD MSACI

