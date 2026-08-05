# Non-interactive CLI + Gemini Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let cv-agent be driven non-interactively via CLI flags (for orchestrating agents / scripted use), with an optional bypass that skips the tool's own Gemini calls when the caller already has final tailored content.

**Architecture:** A new `parseCliArgs(argv)` returns `null` when no flags are given (existing interactive wizard in `src/cli.ts` runs unchanged) or a validated `CliOptions` object otherwise, in which case a new `runNonInteractive(options)` branch runs instead. Two pure extractions (`renderCvToPdf`, `writeEmailOutput`) let both the normal Gemini-backed actions and the new bypass paths (`--input`, `--body`) share the exact same render/write logic.

**Tech Stack:** TypeScript (ESM, Node >=20), vitest for tests, no new runtime dependencies — CLI flags are hand-parsed (the flag surface is small enough that pulling in yargs/commander isn't justified).

## Global Constraints

- No changes to the interactive wizard's prompts or behavior when invoked with zero CLI flags.
- No changes to the internal Gemini prompt bodies in `translateCvIfNeeded`/`optimizeCv`/`draftEmail`.
- Bypass flags (`--input`, `--body`) apply to the whole CLI invocation, not per-action — mixing a bypassed and non-bypassed action in one call is out of scope.
- `--json` mode prints exactly one line on success (`{"outputs": [...]}`) or on failure (`{"error": "..."}`), and is checked directly against raw `argv` so it still works even when `parseCliArgs` itself throws.
- No new npm dependencies.

---

### Task 1: Extract `renderCvToPdf` and rewire `createCv`/`optimizeCv`

**Files:**
- Create: `src/render/renderCvToPdf.ts`
- Modify: `src/actions/createCv.ts`
- Modify: `src/actions/optimizeCv.ts`

**Interfaces:**
- Produces: `renderCvToPdf(cv: Cv, language: 'pt-BR' | 'en', slug: string, variant: 'cv' | 'cv-optimized'): Promise<string>` — used directly by Task 4's bypass path.
- Consumes: `fillCvTemplate` from `src/render/fillTemplate.ts` (already accepts `(cv, language)`), `renderHtmlToPdf` from `src/render/renderPdf.ts`.

This is a pure refactor: the file-naming/render tail currently duplicated in `createCv.ts` and `optimizeCv.ts` moves into one shared function. No behavior change for existing callers.

- [ ] **Step 1: Create `src/render/renderCvToPdf.ts`**

```typescript
import path from 'node:path';
import type { Cv } from '../data/cvSchema.js';
import { fillCvTemplate } from './fillTemplate.js';
import { renderHtmlToPdf } from './renderPdf.js';

type Language = 'pt-BR' | 'en';

export async function renderCvToPdf(
  cv: Cv,
  language: Language,
  slug: string,
  variant: 'cv' | 'cv-optimized'
): Promise<string> {
  const html = fillCvTemplate(cv, language);
  const date = new Date().toISOString().slice(0, 10);
  const outputPath = path.join(process.cwd(), 'output', `${variant}-${language}-${slug}-${date}.pdf`);
  return renderHtmlToPdf(html, outputPath);
}
```

(`Language` is redeclared locally rather than imported from `../actions/createCv.js`, matching the existing pattern in `src/render/fillTemplate.ts` — avoids a `render/` → `actions/` → `render/` import cycle.)

- [ ] **Step 2: Rewrite `src/actions/createCv.ts` to use it**

Replace the full file with:

```typescript
import type { Cv } from '../data/cvSchema.js';
import { generateJson } from '../llm/client.js';
import { renderCvToPdf } from '../render/renderCvToPdf.js';

export type Language = 'pt-BR' | 'en';

const BASE_LANGUAGE: Language = 'pt-BR';

async function translateCvIfNeeded(cv: Cv, language: Language): Promise<Cv> {
  if (language === BASE_LANGUAGE) return cv;

  const prompt = [
    'Translate the following CV data from Brazilian Portuguese to English.',
    'Keep the exact same JSON structure and keys, only translate string values.',
    'Preserve dates, proper nouns, company names, and URLs unchanged.',
    'Respond with ONLY valid JSON, no markdown fences, no commentary.',
    '',
    JSON.stringify(cv, null, 2),
  ].join('\n');

  const response = await generateJson(prompt);
  try {
    return JSON.parse(response) as Cv;
  } catch (error) {
    throw new Error(
      `Gemini returned invalid JSON: ${(error as Error).message}. Raw response (first 200 chars): ${response.slice(0, 200)}`
    );
  }
}

export async function createCv(cv: Cv, language: Language, slug: string): Promise<string> {
  const translated = await translateCvIfNeeded(cv, language);
  return renderCvToPdf(translated, language, slug, 'cv');
}
```

- [ ] **Step 3: Rewrite `src/actions/optimizeCv.ts` to use it**

Replace the full file with:

```typescript
import type { Cv } from '../data/cvSchema.js';
import type { Language } from './createCv.js';
import { generateJson } from '../llm/client.js';
import { renderCvToPdf } from '../render/renderCvToPdf.js';

export async function optimizeCv(
  cv: Cv,
  jobDescription: string,
  language: Language,
  slug: string
): Promise<string> {
  const prompt = [
    `Tailor the following CV data for this job description, in ${language}.`,
    'Reorder and reword experience highlights and skills to emphasize what matches the job description best.',
    'Do not invent experience that is not present in the source data.',
    'Keep the exact same JSON structure and keys.',
    'Respond with ONLY valid JSON, no markdown fences, no commentary.',
    '',
    'JOB DESCRIPTION:',
    jobDescription,
    '',
    'CV DATA:',
    JSON.stringify(cv, null, 2),
  ].join('\n');

  const response = await generateJson(prompt);
  let tailored: Cv;
  try {
    tailored = JSON.parse(response) as Cv;
  } catch (error) {
    throw new Error(
      `Gemini returned invalid JSON: ${(error as Error).message}. Raw response (first 200 chars): ${response.slice(0, 200)}`
    );
  }
  return renderCvToPdf(tailored, language, slug, 'cv-optimized');
}
```

- [ ] **Step 4: Typecheck, lint, and run the existing test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass (no test file exercises `createCv`/`optimizeCv` directly today, so this just confirms nothing else broke).

- [ ] **Step 5: Manually confirm rendering still works**

Run: `npx tsx scripts/render-fixture.ts`
Expected: prints `Wrote output/manual-render-test.pdf` and the file exists (`ls output/manual-render-test.pdf`). This exercises `fillCvTemplate` + `renderHtmlToPdf` exactly as `renderCvToPdf` now does internally.

- [ ] **Step 6: Commit**

```bash
git add src/render/renderCvToPdf.ts src/actions/createCv.ts src/actions/optimizeCv.ts
git commit -m "$(cat <<'EOF'
Extract renderCvToPdf helper shared by createCv/optimizeCv

Pure refactor: pulls the fillTemplate+renderHtmlToPdf+path-naming tail
out of both actions so the upcoming --input CLI bypass can reuse it
without duplicating the naming convention.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extract `writeEmailOutput` from `draftEmail`

**Files:**
- Modify: `src/actions/draftEmail.ts`

**Interfaces:**
- Produces: `writeEmailOutput(body: string, language: Language, slug: string): Promise<string>` (exported from `src/actions/draftEmail.ts`) — used by Task 4's `--body` bypass path.
- Consumes: nothing new.

- [ ] **Step 1: Rewrite `src/actions/draftEmail.ts`**

Replace the full file with:

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Cv } from '../data/cvSchema.js';
import type { Language } from './createCv.js';
import { generateText } from '../llm/client.js';

const TONE_GUIDE_PATH = path.join(process.cwd(), 'templates', 'email.md');

export async function writeEmailOutput(body: string, language: Language, slug: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const outputPath = path.join(process.cwd(), 'output', `email-${language}-${slug}-${date}.md`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, body.trim() + '\n', 'utf8');
  return outputPath;
}

export async function draftEmail(
  cv: Cv,
  jobDescription: string,
  language: Language,
  slug: string
): Promise<string> {
  const toneGuide = await fs.readFile(TONE_GUIDE_PATH, 'utf8');

  const prompt = [
    `Draft a short, professional job application/outreach email in ${language}.`,
    'The sender is the person described in CV DATA below, applying for the role in JOB DESCRIPTION.',
    'Follow this tone and structure guide:',
    toneGuide,
    'Respond with ONLY the email body text, no subject line, no commentary.',
    '',
    'JOB DESCRIPTION:',
    jobDescription,
    '',
    'CV DATA:',
    JSON.stringify(cv, null, 2),
  ].join('\n');

  const body = await generateText(prompt);
  return writeEmailOutput(body.trim(), language, slug);
}
```

Note `body.trim()` is now passed into `writeEmailOutput`, which itself also calls `.trim()` — harmless (idempotent), keeps `writeEmailOutput` safe to call directly with untrimmed bypass file content too.

- [ ] **Step 2: Typecheck, lint, and run the existing test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/actions/draftEmail.ts
git commit -m "$(cat <<'EOF'
Extract writeEmailOutput helper from draftEmail

Pure refactor: separates the file-naming/write step from the Gemini
prompt so the upcoming --body CLI bypass can reuse it directly.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `parseCliArgs` with tests (TDD)

**Files:**
- Create: `src/cli/parseArgs.ts`
- Test: `tests/cli/parseArgs.test.ts`

**Interfaces:**
- Produces:
  - `export type CliAction = 'create' | 'optimize' | 'email';`
  - `export class CliArgsError extends Error {}`
  - `export interface CliOptions { actions: CliAction[]; language: Language; cvPath: string; slug: string; jdSource?: JdSource; input?: string; body?: string; json: boolean; }`
  - `export function parseCliArgs(argv: string[]): CliOptions | null;`
- Consumes: `type Language` from `../actions/createCv.js`, `type JdSource` from `../jd/getJobDescription.js`.

- [ ] **Step 1: Write the failing tests**

Create `tests/cli/parseArgs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliArgsError } from '../../src/cli/parseArgs.js';

describe('parseCliArgs', () => {
  it('returns null when no arguments are given', () => {
    expect(parseCliArgs([])).toBeNull();
  });

  it('parses a minimal create invocation with defaults', () => {
    const options = parseCliArgs(['--action', 'create', '--slug', 'acme']);
    expect(options).toEqual({
      actions: ['create'],
      language: 'pt-BR',
      cvPath: 'data/cv.yaml',
      slug: 'acme',
      jdSource: undefined,
      input: undefined,
      body: undefined,
      json: false,
    });
  });

  it('parses --key=value syntax and multiple actions', () => {
    const options = parseCliArgs(['--action=optimize,email', '--slug=acme', '--jd-file=./jd.txt', '--lang=en']);
    expect(options).toEqual({
      actions: ['optimize', 'email'],
      language: 'en',
      cvPath: 'data/cv.yaml',
      slug: 'acme',
      jdSource: { mode: 'file', path: './jd.txt' },
      input: undefined,
      body: undefined,
      json: false,
    });
  });

  it('parses --jd-text and --jd-url as their respective JdSource modes', () => {
    const textOptions = parseCliArgs(['--action', 'email', '--slug', 'x', '--jd-text', 'hello']);
    expect(textOptions?.jdSource).toEqual({ mode: 'paste', text: 'hello' });

    const urlOptions = parseCliArgs(['--action', 'optimize', '--slug', 'x', '--jd-url', 'https://example.com/job']);
    expect(urlOptions?.jdSource).toEqual({ mode: 'url', url: 'https://example.com/job' });
  });

  it('allows optimize without a job description when --input bypass is given', () => {
    const options = parseCliArgs(['--action', 'optimize', '--slug', 'acme', '--input', './tailored.yaml']);
    expect(options?.jdSource).toBeUndefined();
    expect(options?.input).toBe('./tailored.yaml');
  });

  it('allows email without a job description when --body bypass is given', () => {
    const options = parseCliArgs(['--action', 'email', '--slug', 'acme', '--body', './body.txt']);
    expect(options?.jdSource).toBeUndefined();
    expect(options?.body).toBe('./body.txt');
  });

  it('sets json true when --json is present', () => {
    const options = parseCliArgs(['--action', 'create', '--slug', 'acme', '--json']);
    expect(options?.json).toBe(true);
  });

  it('throws when --slug is missing', () => {
    expect(() => parseCliArgs(['--action', 'create'])).toThrow(CliArgsError);
  });

  it('throws when --action is missing', () => {
    expect(() => parseCliArgs(['--slug', 'acme'])).toThrow(CliArgsError);
  });

  it('throws on an unknown action', () => {
    expect(() => parseCliArgs(['--action', 'translate', '--slug', 'acme'])).toThrow(CliArgsError);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseCliArgs(['--action', 'create', '--slug', 'acme', '--bogus', 'x'])).toThrow(CliArgsError);
  });

  it('throws when optimize has no job description and no --input bypass', () => {
    expect(() => parseCliArgs(['--action', 'optimize', '--slug', 'acme'])).toThrow(CliArgsError);
  });

  it('throws when email has no job description and no --body bypass', () => {
    expect(() => parseCliArgs(['--action', 'email', '--slug', 'acme'])).toThrow(CliArgsError);
  });

  it('throws when more than one --jd-* flag is given', () => {
    expect(() =>
      parseCliArgs(['--action', 'optimize', '--slug', 'acme', '--jd-text', 'a', '--jd-file', 'b'])
    ).toThrow(CliArgsError);
  });

  it('throws on an invalid --lang value', () => {
    expect(() => parseCliArgs(['--action', 'create', '--slug', 'acme', '--lang', 'fr'])).toThrow(CliArgsError);
  });

  it('throws when a flag is missing its value', () => {
    expect(() => parseCliArgs(['--action', 'create', '--slug'])).toThrow(CliArgsError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/cli/parseArgs.test.ts`
Expected: FAIL — `Cannot find module '../../src/cli/parseArgs.js'` (file doesn't exist yet).

- [ ] **Step 3: Implement `src/cli/parseArgs.ts`**

```typescript
import type { Language } from '../actions/createCv.js';
import type { JdSource } from '../jd/getJobDescription.js';

export type CliAction = 'create' | 'optimize' | 'email';

export interface CliOptions {
  actions: CliAction[];
  language: Language;
  cvPath: string;
  slug: string;
  jdSource?: JdSource;
  input?: string;
  body?: string;
  json: boolean;
}

export class CliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliArgsError';
  }
}

const KNOWN_FLAGS = new Set([
  'action',
  'lang',
  'cv',
  'slug',
  'jd-text',
  'jd-file',
  'jd-url',
  'input',
  'body',
  'json',
]);

const VALID_ACTIONS: CliAction[] = ['create', 'optimize', 'email'];

function parseFlags(argv: string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new CliArgsError(`Unexpected argument: ${arg}`);
    }
    const raw = arg.slice(2);
    const eqIndex = raw.indexOf('=');
    if (eqIndex !== -1) {
      flags.set(raw.slice(0, eqIndex), raw.slice(eqIndex + 1));
      continue;
    }
    if (raw === 'json') {
      flags.set(raw, true);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new CliArgsError(`Flag --${raw} requires a value.`);
    }
    flags.set(raw, next);
    i++;
  }
  return flags;
}

export function parseCliArgs(argv: string[]): CliOptions | null {
  if (argv.length === 0) return null;

  const flags = parseFlags(argv);

  for (const key of flags.keys()) {
    if (!KNOWN_FLAGS.has(key)) {
      throw new CliArgsError(`Unknown flag: --${key}`);
    }
  }

  const actionRaw = flags.get('action');
  if (typeof actionRaw !== 'string' || actionRaw.trim() === '') {
    throw new CliArgsError('Missing required flag: --action <create,optimize,email>');
  }
  const actions = actionRaw.split(',').map((value) => value.trim()) as CliAction[];
  for (const action of actions) {
    if (!VALID_ACTIONS.includes(action)) {
      throw new CliArgsError(`Unknown action: ${action}. Expected one of ${VALID_ACTIONS.join(', ')}.`);
    }
  }

  const slug = flags.get('slug');
  if (typeof slug !== 'string' || slug.trim() === '') {
    throw new CliArgsError('Missing required flag: --slug <str>');
  }

  let language: Language = 'pt-BR';
  const langRaw = flags.get('lang');
  if (typeof langRaw === 'string') {
    if (langRaw !== 'pt-BR' && langRaw !== 'en') {
      throw new CliArgsError(`Unknown --lang value: ${langRaw}. Expected pt-BR or en.`);
    }
    language = langRaw;
  }

  const cvRaw = flags.get('cv');
  const cvPath = typeof cvRaw === 'string' ? cvRaw : 'data/cv.yaml';

  const inputRaw = flags.get('input');
  const input = typeof inputRaw === 'string' ? inputRaw : undefined;

  const bodyRaw = flags.get('body');
  const body = typeof bodyRaw === 'string' ? bodyRaw : undefined;

  const jdText = flags.get('jd-text');
  const jdFile = flags.get('jd-file');
  const jdUrl = flags.get('jd-url');
  const jdFlagsGiven = [jdText, jdFile, jdUrl].filter((value) => typeof value === 'string').length;
  if (jdFlagsGiven > 1) {
    throw new CliArgsError('Only one of --jd-text, --jd-file, --jd-url may be given.');
  }

  let jdSource: JdSource | undefined;
  if (typeof jdText === 'string') {
    jdSource = { mode: 'paste', text: jdText };
  } else if (typeof jdFile === 'string') {
    jdSource = { mode: 'file', path: jdFile };
  } else if (typeof jdUrl === 'string') {
    jdSource = { mode: 'url', url: jdUrl };
  }

  const needsJdForOptimize = actions.includes('optimize') && input === undefined;
  const needsJdForEmail = actions.includes('email') && body === undefined;
  if ((needsJdForOptimize || needsJdForEmail) && jdSource === undefined) {
    throw new CliArgsError(
      'A job description is required (--jd-text, --jd-file, or --jd-url) for optimize/email unless using --input/--body bypass.'
    );
  }

  const json = flags.get('json') === true;

  return { actions, language, cvPath, slug, jdSource, input, body, json };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/cli/parseArgs.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck and lint the whole project**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli/parseArgs.ts tests/cli/parseArgs.test.ts
git commit -m "$(cat <<'EOF'
Add parseCliArgs for non-interactive CLI invocation

Pure, fully-tested argument parser/validator: returns null for the
existing interactive wizard's zero-args case, otherwise validates
--action/--slug/--lang/--cv/--jd-*/--input/--body/--json into a
CliOptions object. Not yet wired into cli.ts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire non-interactive mode into `cli.ts`

**Files:**
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: `parseCliArgs`, `CliOptions` from `./cli/parseArgs.js`; `renderCvToPdf` from `./render/renderCvToPdf.js`; `writeEmailOutput` from `./actions/draftEmail.js`; `loadCv` from `./data/loadCv.js`; `resolveJobDescription` from `./jd/getJobDescription.js`; `createCv`, `optimizeCv`, `draftEmail` unchanged.
- Produces: nothing new exported — this is the CLI entrypoint.

- [ ] **Step 1: Rewrite `src/cli.ts`**

Replace the full file with:

```typescript
import 'dotenv/config';
import fs from 'node:fs/promises';
import { select, input, checkbox } from '@inquirer/prompts';
import { loadCv } from './data/loadCv.js';
import { resolveJobDescription, type JdSource } from './jd/getJobDescription.js';
import { createCv, type Language } from './actions/createCv.js';
import { optimizeCv } from './actions/optimizeCv.js';
import { draftEmail, writeEmailOutput } from './actions/draftEmail.js';
import { renderCvToPdf } from './render/renderCvToPdf.js';
import { parseCliArgs, type CliOptions } from './cli/parseArgs.js';

async function promptLanguage(): Promise<Language> {
  return select<Language>({
    message: 'CV language:',
    choices: [
      { name: 'Portuguese (Brazil) - default', value: 'pt-BR' },
      { name: 'English', value: 'en' },
    ],
    default: 'pt-BR',
  });
}

async function promptJobDescription(): Promise<string> {
  const mode = await select<JdSource['mode']>({
    message: 'How do you want to provide the job description?',
    choices: [
      { name: 'Paste text', value: 'paste' },
      { name: 'Path to a local file', value: 'file' },
      { name: 'URL to the job posting', value: 'url' },
    ],
  });

  let source: JdSource;
  if (mode === 'paste') {
    const text = await input({ message: 'Paste the job description:' });
    source = { mode: 'paste', text };
  } else if (mode === 'file') {
    const filePath = await input({ message: 'Path to the job description file:' });
    source = { mode: 'file', path: filePath };
  } else {
    const url = await input({ message: 'Job posting URL:' });
    source = { mode: 'url', url };
  }

  try {
    return await resolveJobDescription(source);
  } catch (error) {
    console.error((error as Error).message);
    const text = await input({ message: 'Please paste the job description text instead:' });
    return resolveJobDescription({ mode: 'paste', text });
  }
}

async function runNonInteractive(options: CliOptions): Promise<void> {
  const outputs: string[] = [];

  const needsCv =
    (options.actions.includes('create') && options.input === undefined) ||
    (options.actions.includes('optimize') && options.input === undefined) ||
    (options.actions.includes('email') && options.body === undefined);
  const cv = needsCv ? loadCv(options.cvPath) : undefined;

  const needsJd =
    (options.actions.includes('optimize') && options.input === undefined) ||
    (options.actions.includes('email') && options.body === undefined);
  const jobDescription =
    needsJd && options.jdSource ? await resolveJobDescription(options.jdSource) : undefined;

  if (options.actions.includes('create')) {
    if (options.input !== undefined) {
      const inputCv = loadCv(options.input);
      outputs.push(await renderCvToPdf(inputCv, options.language, options.slug, 'cv'));
    } else {
      outputs.push(await createCv(cv!, options.language, options.slug));
    }
  }

  if (options.actions.includes('optimize')) {
    if (options.input !== undefined) {
      const inputCv = loadCv(options.input);
      outputs.push(await renderCvToPdf(inputCv, options.language, options.slug, 'cv-optimized'));
    } else {
      outputs.push(await optimizeCv(cv!, jobDescription!, options.language, options.slug));
    }
  }

  if (options.actions.includes('email')) {
    if (options.body !== undefined) {
      const body = await fs.readFile(options.body, 'utf8');
      outputs.push(await writeEmailOutput(body, options.language, options.slug));
    } else {
      outputs.push(await draftEmail(cv!, jobDescription!, options.language, options.slug));
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ outputs }));
  } else {
    console.log('\nDone! Generated files:');
    for (const file of outputs) {
      console.log(`  - ${file}`);
    }
  }
}

async function runInteractive(): Promise<void> {
  const language = await promptLanguage();
  const jobDescription = await promptJobDescription();
  const actions = await checkbox({
    message: 'What do you want to do?',
    choices: [
      { name: 'Create CV', value: 'create' },
      { name: 'Optimize CV for this role', value: 'optimize' },
      { name: 'Draft outreach email', value: 'email' },
    ],
  });

  const cv = loadCv('data/cv.yaml');
  const slug = await input({ message: 'Short slug for filenames (e.g. acme-backend):' });

  const outputs: string[] = [];
  if (actions.includes('create')) {
    outputs.push(await createCv(cv, language, slug));
  }
  if (actions.includes('optimize')) {
    outputs.push(await optimizeCv(cv, jobDescription, language, slug));
  }
  if (actions.includes('email')) {
    outputs.push(await draftEmail(cv, jobDescription, language, slug));
  }

  console.log('\nDone! Generated files:');
  for (const file of outputs) {
    console.log(`  - ${file}`);
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options) {
    await runNonInteractive(options);
    return;
  }
  await runInteractive();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
```

(The interactive wizard body is unchanged — it's just moved into `runInteractive()` so `main()` can branch cleanly.)

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 4: Manually verify the bypass path (no Gemini call, no API key needed)**

Run:
```bash
npx tsx src/cli.ts --action optimize --slug plan-test --input tests/fixtures/valid-cv.yaml --json
```
Expected: stdout is exactly one line, `{"outputs":["/absolute/path/to/output/cv-optimized-pt-BR-plan-test-<today>.pdf"]}` (or a `.html` fallback path if Puppeteer can't launch in this environment — either is correct, matching `renderHtmlToPdf`'s existing fallback behavior). Confirm the file exists at that path.

- [ ] **Step 5: Manually verify validation errors surface correctly**

Run:
```bash
npx tsx src/cli.ts --action optimize --slug plan-test --json
```
Expected: stdout is exactly one line, `{"error":"A job description is required (--jd-text, --jd-file, or --jd-url) for optimize/email unless using --input/--body bypass."}`, and the process exits with a non-zero code (check with `echo $?` — expect `1`).

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts
git commit -m "$(cat <<'EOF'
Add non-interactive CLI mode with Gemini-bypass flags

parseCliArgs(process.argv) now gates cli.ts's main(): zero flags keeps
the existing interactive wizard exactly as-is; any flags run the new
flag-based path instead. --input/--body let create/optimize/email skip
their Gemini call entirely when the caller already has final content,
and --json makes the result machine-parseable for orchestrating agents.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Document the new flags in README

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Add a new section to `README.md`**

Insert a new `## Non-interactive / scripted usage` section immediately after the existing `## Usage` section (before `## Development`):

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Document non-interactive CLI flags in README

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
