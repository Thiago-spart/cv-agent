# CV PDF visual refresh + content curation rules

Date: 2026-08-04

## Context

`templates/cv.html` is a plain Handlebars template rendered to PDF via
Puppeteer (`src/render/renderPdf.ts`). It currently uses a generic
Arial/Helvetica stack, grey borders, and renders every field verbatim with
no emphasis, no contact links, and no content curation — the caller is
expected to hand it an already-trimmed `Cv` object.

This spec covers two related changes:

1. Content curation rules for job-tailored CVs generated from the base
   `data/cv.yaml` (applies to how tailored data is assembled, not code).
2. A visual refresh of `templates/cv.html` (applies to the template/CSS).

## Content curation rules (applies when tailoring a CV for a specific job)

- **Experience**: max 4 entries — most recent and/or most relevant to the
  target role.
- **Education**: only degree-granting institutions (drop bootcamps/technical
  courses), i.e. keep only the bachelor's degree entry.
- **Skills**: max 20, filtered to only skills that match the job
  description's stated stack/requirements.
- **Projects**: 3 as the default target, up to 5 max if the job's scope
  genuinely calls for more breadth.
- **Section order**: Contact/Header → Summary → Experience → Projects →
  Skills → Education. Rationale (per 2026 resume-writing guidance for
  experienced candidates): lead with proof of work (experience, projects)
  before the scannable skills/keyword section; education last since it's a
  single in-progress degree, not the strongest selling point here.
- **Emphasis**: within summary, experience highlights, and project
  descriptions, mark key terms `**bold**` (tech names, metrics, notable
  outcomes) and uncommon/jargon terms `*italic*` (e.g. loanwords, acronyms
  spelled out). Rendered via inline `<strong>`/`<em>` in the template.
- **Skill years-badges**: for skills that directly correspond to a
  technology/competency named explicitly in the job description, append a
  computed "~X anos" badge, derived only from dated evidence already present
  in the source experience entries (earliest highlight that evidences that
  skill, through the current date), never invented. Applied narrowly to keep
  the skills grid scannable — not every skill needs a badge.

## Visual design

- **Font stack**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "Helvetica Neue", Arial, sans-serif`. No embedded/web font — avoids a
  network/build dependency and keeps Puppeteer rendering deterministic
  across hosts.
- **Color**: single accent color (`#2454b3`) used for name, section
  headings, links, and years-badge borders/text. Everything else stays
  near-black/grey for print-safe contrast.
- **Header**: name ~28px/700; role title ~13px in accent color with slight
  letter-spacing; contact line includes LinkedIn and portfolio as inline
  text links (e.g. "LinkedIn", "Portfólio") in the accent color instead of
  raw URLs.
- **Section headings**: ~12px, uppercase, letter-spaced, with a thin (2px)
  accent-colored bottom rule replacing the current plain grey 1px border.
- **Spacing/density**: page padding ~46px; body text ~10.5px/1.5
  line-height; ~26px gap between sections; ~12px gap between entries —
  tuned to fit a curated (max-4-experience, max-3/5-project) CV on one page.
- **Skills grid**: refined pill/chip grid — tighter padding, light-grey chip
  background. Chips carrying a years-badge get an accent-colored border and
  an appended "· ~X anos" suffix; other chips stay plain grey.

## Non-goals

- No changes to the LLM tailoring pipeline (`optimizeCv.ts`) itself — these
  are template/content rules applied when assembling `Cv` data by hand or
  reviewing LLM output.
- No embedded custom fonts (declined during design review).
- No multi-page layout handling beyond what natural content flow produces.
