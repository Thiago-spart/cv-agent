# Non-interactive CLI + Gemini bypass for agent-driven usage

Date: 2026-08-05

## Context

`src/cli.ts` only offers an interactive wizard (`@inquirer/prompts`). When an
orchestrating agent (e.g. Claude Code) needs to drive cv-agent — as happened
in the session that produced the BRQ front-end CV — there is no way to call
it directly. The agent has to write a throwaway script that imports internal
functions (`loadCv`, `fillCvTemplate`, `renderHtmlToPdf`) and run it via
`tsx`, discarding the script afterward. This is token-expensive (multiple
tool calls to write/run/delete a script) and brittle (relies on internal
module paths that aren't a stable interface).

Separately, when an orchestrating agent has already tailored/translated the
CV itself (because no `GEMINI_API_KEY` is configured, or because the agent's
own reasoning is a better fit for the job-matching step), the tool's
`translateCvIfNeeded`/`optimizeCv`/`draftEmail` Gemini calls are pure
overhead — the agent doesn't need the tool to redo work it already did.

This spec covers two changes that together address both: (1) a
non-interactive, flag-based CLI mode, and (2) a "bypass" mode on that CLI
that skips the relevant Gemini call entirely when the caller already has
final content.

Internal Gemini prompt sizes (`translateCvIfNeeded`/`optimizeCv`/
`draftEmail`) were also considered as an optimization target, but for a
single-person CV (a few KB of JSON) there's no meaningful token win there
beyond what the bypass mode already provides — explicitly out of scope for
this change.

## CLI argument surface

`src/cli.ts`'s `main()` calls a new `parseCliArgs(process.argv.slice(2))`
first. If it returns `null` (no recognized flags present), the existing
interactive wizard runs completely unchanged — this is purely additive, the
default `npm start` UX for the human user is untouched.

If flags are present, `parseCliArgs` returns a fully validated `CliOptions`
object (or throws `CliArgsError`), and `main()` runs a new
`runNonInteractive(options)` instead of the wizard.

Flags:

- `--action <list>`: required. Comma-separated subset of `create`,
  `optimize`, `email` (mirrors the wizard's checkbox step).
- `--lang <pt-BR|en>`: optional, default `pt-BR`.
- `--cv <path>`: optional, default `data/cv.yaml`. Base CV data source for
  non-bypassed actions.
- `--slug <str>`: required. Used in output filenames, same as the wizard's
  slug prompt.
- `--jd-text <str>` / `--jd-file <path>` / `--jd-url <url>`: mutually
  exclusive. Required when `optimize` or `email` is requested *and* that
  action's bypass flag is not given (see validation rules below).
- `--input <path>`: bypass flag for `create`/`optimize`. Points to a
  pre-tailored `Cv` YAML/JSON file (validated with the existing `loadCv` —
  YAML is a superset of JSON so both formats work through the same loader).
  When given, that action skips its Gemini call entirely and renders the
  file's content directly.
- `--body <path>`: bypass flag for `email`. Points to a plain-text file
  containing the final email body. Skips `draftEmail`'s Gemini call and
  writes the file's content to the standard output path.
- `--json`: suppress human-readable console output. On success, print
  exactly one line: `{"outputs": ["output/....pdf", ...]}`. On failure,
  print `{"error": "<message>"}` and exit with code 1. This flag is checked
  independently of full parse success, so parse errors are also reportable
  as JSON when `--json` is present in the raw argv.

### Validation rules (enforced inside `parseCliArgs`)

- `create` never requires a job description.
- `optimize` requires a JD source unless `--input` is given.
- `email` requires a JD source unless `--body` is given.
- `--jd-text`/`--jd-file`/`--jd-url` are mutually exclusive; specifying more
  than one is a `CliArgsError`.
- Unknown `--action` values, missing `--slug`, or an empty `--action` list
  are `CliArgsError`s with a message naming the specific problem.
- Bypass flags apply to the whole invocation (not per-action). This is a
  deliberate simplification: a single CLI call almost always represents one
  action end-to-end (this is the dominant real usage pattern for
  agent-driven calls); mixing a bypassed and a non-bypassed action in the
  same invocation is not supported and is out of scope.

## Internal refactor

Two small extractions, pure refactors with no behavior change to the
existing Gemini-backed paths:

- `src/render/renderCvToPdf.ts`: exports
  `renderCvToPdf(cv: Cv, language: Language, slug: string, variant: string): Promise<string>`,
  containing the `fillCvTemplate` + `renderHtmlToPdf` + output-path-naming
  logic currently duplicated between `createCv.ts` (`variant: 'cv'`) and
  `optimizeCv.ts` (`variant: 'cv-optimized'`). Both actions and the new
  `--input` bypass path call this.
- `writeEmailOutput(body: string, language: Language, slug: string): Promise<string>`
  (co-located in `src/actions/draftEmail.ts` and exported): the
  file-naming/write tail currently inlined in `draftEmail`. Both the normal
  action and the new `--body` bypass call this.

`runNonInteractive` orchestration, per requested action:

- `create`: if `--input` given, `loadCv(input)` then `renderCvToPdf(...,'cv')`
  directly (no translation step — bypass means the file is already in its
  final form). Otherwise, current behavior: `loadCv(cvPath)` →
  `translateCvIfNeeded` → `renderCvToPdf`.
- `optimize`: if `--input` given, `loadCv(input)` then
  `renderCvToPdf(...,'cv-optimized')` directly. Otherwise, current
  `optimizeCv` behavior (resolves JD, calls Gemini, renders).
- `email`: if `--body` given, read the file and `writeEmailOutput` directly.
  Otherwise, current `draftEmail` behavior (resolves JD, calls Gemini,
  writes).

## Error handling

The existing top-level `main().catch(...)` in `cli.ts` is extended: if the
raw `argv` includes `--json`, the catch handler prints
`JSON.stringify({ error: message })` instead of the current plain
`console.error`, and still sets `exitCode = 1`.

## Testing

- `tests/cli/parseArgs.test.ts`: unit tests for `parseCliArgs` — valid
  single/multi-action invocations, `null` returned for empty argv, and each
  validation error (missing slug, missing JD when required and not
  bypassed, conflicting JD sources, unknown action/flag). Pure and
  deterministic, no Gemini mocking needed, matching the existing style of
  `tests/jd/getJobDescription.test.ts`.
- Manual verification: re-run the bypass flow from the BRQ CV session
  (`--action optimize --input <tailored.yaml> --slug brq-frontend --json`)
  and confirm it produces the same PDF without any Gemini call, plus one
  `--action create --json` smoke test against `data/cv.yaml` if a
  `GEMINI_API_KEY` is configured.
- `README.md` gains a section documenting the new flags, since this is the
  primary way other agents (or scripted use) will drive the tool going
  forward.

## Non-goals

- No changes to the internal Gemini prompt bodies
  (`translateCvIfNeeded`/`optimizeCv`/`draftEmail`) — evaluated and found
  not worth the complexity for this project's scale.
- No MCP server or long-running process — a one-shot CLI invocation per
  action is sufficient for how this tool is actually used.
- No support for mixing bypassed and non-bypassed actions within a single
  invocation.
- No changes to the interactive wizard's behavior or prompts.
