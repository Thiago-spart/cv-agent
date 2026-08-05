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

## Non-interactive / scripted usage

For scripted or agent-driven use, skip the wizard entirely with CLI flags:

```bash
npx tsx src/cli.ts --action optimize --lang pt-BR \
  --jd-file ./job-posting.txt --slug acme-backend --json
```

- `--action <list>` — required. Comma-separated subset of `create`, `optimize`, `email`.
- `--lang <pt-BR|en>` — optional, default `pt-BR`.
- `--cv <path>` — optional, default `data/cv.yaml`.
- `--slug <str>` — required. Used in output filenames.
- `--jd-text <str>` / `--jd-file <path>` / `--jd-url <url>` — mutually exclusive. Required for `optimize`/`email` unless the matching bypass flag below is used.
- `--input <path>` — for `create`/`optimize`: skip the Gemini call entirely and render this pre-tailored CV file (same schema as `data/cv.yaml`) directly.
- `--body <path>` — for `email`: skip the Gemini call entirely and write this pre-written plain-text file as the email body.
- `--json` — print exactly `{"outputs": [...]}` on success or `{"error": "..."}` on failure instead of the human-readable summary, and set a non-zero exit code on failure.

The `--input`/`--body` bypass flags are for callers (including other AI agents) that have already produced final, tailored CV/email content themselves — it skips the tool's own Gemini round-trip entirely.

## Development

```bash
npm run lint        # ESLint
npm run typecheck    # tsc --noEmit
npm test              # vitest
```

CI (`.github/workflows/ci.yml`) runs all three on every push/PR.
