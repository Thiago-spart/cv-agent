# CV Terminal Agent — Design

## Purpose

A standalone terminal CLI, run from this repo, that helps produce tailored CVs and
outreach emails for job applications. It's a personal productivity tool, not a
shared library or service.

## Flow

Running the CLI launches an interactive wizard:

1. **Language** — prompt, default `pt-BR`, can select `en`.
2. **Job description (JD)** — prompt for how to supply it:
   - Paste raw text directly into the terminal
   - Path to a local file (`.txt`/`.md`)
   - URL to the job posting (best-effort: fetch the page and strip HTML tags
     to get plain text; not a robust per-site scraper — if extraction looks
     wrong/empty, the CLI tells the user to paste the text instead)
3. **Action** — choose one or more:
   - `create CV`
   - `optimize CV for this role`
   - `draft outreach email`
4. Runs the chosen action(s), calls the Claude API for generation, writes
   output file(s) to `output/`, and prints the resulting file paths.

## Data & Templates

- `data/cv.yaml` — single source-of-truth master CV, maintained by hand, in one
  base language (e.g. pt-BR). Holds contact info, summary, experience,
  education, skills, projects, etc.
  - Loaded via `src/data/loadCv.ts`, which validates the schema and raises a
    clear error naming the missing/malformed field (not a cryptic
    template-fill crash later).
- `templates/cv.html` — one styled HTML/CSS template with placeholders. Filled
  content is rendered to PDF via Puppeteer (headless Chrome).
- `templates/email.md` — a lightweight scaffold for the outreach email's tone;
  the email body itself is mostly LLM-generated from the JD + CV data, not a
  rigid fill-in-blanks template.
- `output/` — generated PDFs/HTML/email drafts land here, gitignored.
  Filenames include role + date, e.g.
  `output/cv-en-acme-backend-2026-07-22.pdf`.

## Actions & LLM Logic

All three actions share one Claude API client wrapper
(`src/llm/client.ts`), which reads `ANTHROPIC_API_KEY` from `.env` and fails
fast with a clear message before the wizard starts if it's missing.

- **Create CV**: load `cv.yaml` → if target language ≠ base language, ask
  Claude to translate/adapt content (preserving structure, dates, proper
  nouns) → fill `cv.html` → render PDF.
- **Optimize CV for role**: load `cv.yaml` + JD text → ask Claude to select,
  reorder, and reword bullets/skills that best match the JD (translating if
  needed) → same render pipeline → PDF. **The master `cv.yaml` is never
  modified** — output is always a tailored copy, so the source-of-truth stays
  safe to reuse across roles.
- **Draft outreach email**: load `cv.yaml` (for background) + JD text → ask
  Claude to draft a short application/outreach email in the target language →
  save as a `.md` file under `output/`. No Gmail integration in v1 (that would
  require a separate Google Cloud OAuth client since this is a standalone
  script, outside Claude Code's own Gmail integration) — can be added later as
  a follow-up if wanted.

### Error handling

- Missing `ANTHROPIC_API_KEY` → fail before the wizard runs, with a message
  pointing at `.env.example`.
- Invalid/incomplete `cv.yaml` → validation error naming the specific
  field/section.
- PDF render failure (e.g. Puppeteer/Chrome unavailable) → falls back to
  saving the filled HTML file so generated content isn't lost.
- JD URL fetch failure or empty extraction → tell the user to paste the JD
  text instead.

## Project Structure

```
cv_agent/
  data/cv.yaml
  templates/cv.html
  templates/email.md
  output/                 (gitignored)
  src/
    cli.ts                 wizard entry point
    data/loadCv.ts          load + validate cv.yaml
    jd/getJobDescription.ts paste / file / URL handlers
    llm/client.ts           Claude API wrapper
    actions/createCv.ts
    actions/optimizeCv.ts
    actions/draftEmail.ts
    render/renderPdf.ts     template fill + Puppeteer PDF
  .env.example
  package.json / tsconfig.json
```

## Testing

Personal tool, not a shared library — testing is kept light rather than
exhaustive:

- Unit tests for logic that's easy to get subtly wrong without visible
  failure: `cv.yaml` schema validation, and JD-source-selection logic
  (paste/file/URL branching).
- The LLM-driven generation and PDF rendering are validated by manual
  end-to-end runs, not automated tests (output quality is judged by the user,
  not asserted programmatically).

## Out of scope (v1)

- Gmail draft push integration (deferred; emails are written to local files
  instead).
- Per-language parallel content in `cv.yaml` (deferred; base language +
  on-the-fly translation is used instead).
- Robust per-site JD scraping (deferred; URL fetch is best-effort plain-text
  extraction only).
- Editing/improving `cv.yaml` itself as part of "optimize" (deferred; optimize
  only affects the tailored output copy).
