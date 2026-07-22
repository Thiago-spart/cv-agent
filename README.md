# cv-agent

A terminal CLI that helps produce tailored CVs and outreach emails for job
applications. It's a personal productivity tool: you maintain one CV in
`data/cv.yaml`, and the CLI can render it, translate it, tailor it to a
specific job description, or draft an application email — using Google's
Gemini API for the AI-generated parts.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your Gemini API key:

   ```bash
   cp .env.example .env
   ```

   Then open `.env` and set `GEMINI_API_KEY` to a real key. Get a free key at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — no
   billing setup required for personal, low-volume use. `.env` is gitignored
   and never committed.

3. Add your CV data:

   ```bash
   cp data/cv.example.yaml data/cv.yaml
   ```

   Then edit `data/cv.yaml` with your real name, contact info, experience,
   education, skills, etc. Write it in whichever language you consider your
   "base" language (the project defaults to Brazilian Portuguese, `pt-BR`) —
   the CLI can translate it to English on demand. `data/cv.yaml` is
   gitignored and never committed, since it holds real personal data.

## Usage

```bash
npm start
```

The wizard will ask for:

1. **Language** — `pt-BR` (default) or `en`.
2. **Job description** — paste text, point to a local file, or give a URL.
3. **Action(s)** — create a CV, optimize a CV for the job description, and/or
   draft an outreach email. You can select more than one.

Generated files (PDFs, HTML fallbacks, email drafts) are written to
`output/`, which is also gitignored.

## Development

```bash
npm run lint        # ESLint
npm run typecheck    # tsc --noEmit
npm test              # vitest
```

CI (`.github/workflows/ci.yml`) runs all three on every push/PR.
