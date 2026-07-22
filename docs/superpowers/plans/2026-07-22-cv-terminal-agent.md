# CV Terminal Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Node/TypeScript CLI that walks the user through choosing a CV language, supplying a job description, and creating/optimizing a CV or drafting an outreach email — as a set of independently testable, bottom-up layers.

**Architecture:** An interactive wizard (`src/cli.ts`, using `@inquirer/prompts`) composes small, single-purpose modules: a validated data loader for `data/cv.yaml`, a job-description resolver (paste/file/URL), a thin Gemini API client, an HTML-template-to-PDF renderer, and three action modules (create/optimize/draft-email) that each call the LLM client and renderer.

**Tech Stack:** Node.js >= 20, TypeScript (strict, ESM/NodeNext), `@inquirer/prompts` (wizard), `js-yaml` + `zod` (data loading/validation), `@google/genai` (LLM calls via the Gemini API's free tier), `handlebars` (HTML templating), `puppeteer` (HTML → PDF), `dotenv` (env vars), `vitest` (tests), `eslint` + `@typescript-eslint` (lint), GitHub Actions (CI).

> **Note:** Tasks 1-9 were originally implemented against `@anthropic-ai/sdk`
> (Claude). Mid-implementation, the project switched LLM providers to
> Google's Gemini API for its no-cost free tier — better suited to a
> personal, low-volume tool than a pay-as-you-go key. `src/llm/client.ts`
> (Task 6) still exports the same `generateText`/`MissingApiKeyError` names,
> so no other file needed to change. This plan document has been updated
> throughout to reflect Gemini as the final, correct provider.

## Global Constraints

- Node.js >= 20 (`engines` field in `package.json` — raised from >=18 when `@google/genai` was added, which itself requires Node >=20); TypeScript `strict: true`.
- `data/cv.yaml` holds real personal data — it is gitignored and must never be committed. `data/cv.example.yaml` (placeholder values) is the committed template.
- The "optimize" action must never write back to `data/cv.yaml` — it only reads it and produces a separate tailored output file.
- Default CV language is `pt-BR`; `en` is the only other supported language for v1, produced by on-the-fly LLM translation of the pt-BR base data (no parallel per-language content in `cv.yaml`).
- Gmail integration is out of scope for v1 — the draft-email action writes a local `.md` file under `output/`.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, and unit tests only — no build step, no smoke test, no real LLM calls in CI.
- `GEMINI_API_KEY` is read from `.env` via `dotenv` — the app must fail with a clear message if it's missing, never silently proceed or hardcode a key.
- Repository is public (`Thiago-spart/cv-agent`) — never commit secrets or personal data.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `tests/sanity.test.ts`
- Create: `output/.gitkeep`
- Create: `src/cli.ts` (placeholder — see Step 9; Task 4 replaces its contents)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: npm scripts `start`, `build`, `typecheck`, `lint`, `test` that every later task relies on for verification. Also produces a placeholder `src/cli.ts`, because `tsconfig.json`'s `rootDir`/`include` point at `src/`, and `tsc --noEmit` fails with `TS18003: No inputs were found` if that directory has no `.ts` files yet — Task 4 overwrites this placeholder with the real wizard entry point.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cv-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "tsx src/cli.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@google/genai": "^2.13.0",
    "@inquirer/prompts": "^7.0.0",
    "dotenv": "^16.4.5",
    "handlebars": "^4.7.8",
    "js-yaml": "^4.1.0",
    "puppeteer": "^23.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.0",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.9.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
    },
  },
];
```

(The `globals` block is required — later tasks' code uses `console`, `process`, etc., and without it ESLint's `no-undef` rule flags every one of those as an undefined reference.)

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create `.env.example`**

```
GEMINI_API_KEY=
```

(Originally `ANTHROPIC_API_KEY=` when this task was first implemented against
Claude; corrected to `GEMINI_API_KEY=` as part of the Task 6 provider swap —
see the note under this plan's Tech Stack section.)

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
.env
data/cv.yaml
output/*
!output/.gitkeep
```

- [ ] **Step 7: Create `output/.gitkeep`**

```
```

(empty file, just to keep the directory tracked in git)

- [ ] **Step 8: Create `tests/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('project scaffolding', () => {
  it('is set up correctly', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Create placeholder `src/cli.ts`**

```ts
console.log('cv-agent scaffolding OK');
```

(Exists only so `tsc --noEmit` has a file to compile; Task 4 replaces this
file's contents with the real wizard entry point.)

- [ ] **Step 10: Install dependencies**

Run: `npm install`
Expected: installs without error, creates `package-lock.json`.

- [ ] **Step 11: Verify lint, typecheck, and test all pass**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all three succeed; `npm test` reports 1 passed test.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.js vitest.config.ts .env.example .gitignore tests/sanity.test.ts output/.gitkeep src/cli.ts
git commit -m "chore: scaffold project (package.json, tsconfig, eslint, vitest)"
git push
```

---

### Task 2: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: npm scripts `lint`, `typecheck`, `test` from Task 1.
- Produces: nothing later tasks import — this is infrastructure that runs automatically on push/PR.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for lint, typecheck, and tests"
git push
```

- [ ] **Step 3: Verify the workflow runs on GitHub**

Run: `gh run watch` (after the push triggers a run), or check `gh run list --limit 1`
Expected: the run for this commit completes with conclusion `success`.

---

### Task 3: CV schema & data loader

**Files:**
- Create: `data/cv.example.yaml`
- Create: `src/data/cvSchema.ts`
- Create: `src/data/loadCv.ts`
- Test: `tests/fixtures/valid-cv.yaml`
- Test: `tests/fixtures/invalid-cv.yaml`
- Test: `tests/data/loadCv.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export const cvSchema` and `export type Cv` from `src/data/cvSchema.ts`; `export function loadCv(filePath: string): Cv` and `export class CvValidationError extends Error` from `src/data/loadCv.ts`. Later tasks (4, 9, 10, 11) import `loadCv` and the `Cv` type.

- [ ] **Step 1: Create `data/cv.example.yaml`**

```yaml
name: "Your Name"
title: "Your Professional Title"
contact:
  email: "you@example.com"
  phone: "+55 11 91234-5678"
  location: "São Paulo, Brazil"
  linkedin: "https://linkedin.com/in/yourprofile"
  github: "https://github.com/yourhandle"
summary: >
  A concise 2-4 sentence summary of your professional background and what
  you're looking for next.
experience:
  - company: "Company Name"
    role: "Your Role"
    location: "Remote"
    startDate: "2022-01"
    endDate: "Present"
    highlights:
      - "A quantified achievement or responsibility."
      - "Another quantified achievement or responsibility."
  - company: "Previous Company"
    role: "Previous Role"
    startDate: "2019-03"
    endDate: "2021-12"
    highlights:
      - "An achievement from this role."
education:
  - institution: "University Name"
    degree: "Degree, Major"
    startDate: "2015-01"
    endDate: "2018-12"
skills:
  - "Skill 1"
  - "Skill 2"
  - "Skill 3"
projects:
  - name: "Side Project Name"
    description: "One sentence describing what it does and why."
    url: "https://github.com/yourhandle/project"
    highlights:
      - "Something notable about it."
languages:
  - name: "Portuguese"
    level: "Native"
  - name: "English"
    level: "Fluent"
```

- [ ] **Step 2: Create `src/data/cvSchema.ts`**

```ts
import { z } from 'zod';

export const cvSchema = z.object({
  name: z.string().min(1, 'name is required'),
  title: z.string().min(1, 'title is required'),
  contact: z.object({
    email: z.string().email('contact.email must be a valid email'),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().url().optional(),
    github: z.string().url().optional(),
    website: z.string().url().optional(),
  }),
  summary: z.string().min(1, 'summary is required'),
  experience: z
    .array(
      z.object({
        company: z.string().min(1, 'experience[].company is required'),
        role: z.string().min(1, 'experience[].role is required'),
        location: z.string().optional(),
        startDate: z.string().min(1, 'experience[].startDate is required'),
        endDate: z.string().optional(),
        highlights: z
          .array(z.string())
          .min(1, 'experience[].highlights must have at least one item'),
      })
    )
    .min(1, 'experience must have at least one entry'),
  education: z.array(
    z.object({
      institution: z.string().min(1, 'education[].institution is required'),
      degree: z.string().min(1, 'education[].degree is required'),
      startDate: z.string().min(1, 'education[].startDate is required'),
      endDate: z.string().optional(),
      details: z.string().optional(),
    })
  ),
  skills: z.array(z.string()).min(1, 'skills must have at least one item'),
  projects: z
    .array(
      z.object({
        name: z.string().min(1, 'projects[].name is required'),
        description: z.string().min(1, 'projects[].description is required'),
        url: z.string().url().optional(),
        highlights: z.array(z.string()).optional(),
      })
    )
    .optional(),
  languages: z
    .array(
      z.object({
        name: z.string().min(1, 'languages[].name is required'),
        level: z.string().min(1, 'languages[].level is required'),
      })
    )
    .optional(),
});

export type Cv = z.infer<typeof cvSchema>;
```

- [ ] **Step 3: Create `tests/fixtures/valid-cv.yaml`**

```yaml
name: "Jane Doe"
title: "Backend Engineer"
contact:
  email: "jane@example.com"
  location: "São Paulo, Brazil"
summary: "Backend engineer with 6 years of experience building distributed systems."
experience:
  - company: "Acme Corp"
    role: "Senior Backend Engineer"
    location: "Remote"
    startDate: "2021-01"
    endDate: "Present"
    highlights:
      - "Led migration of monolith to microservices, reducing deploy time by 70%."
      - "Mentored 3 junior engineers."
education:
  - institution: "Universidade de São Paulo"
    degree: "B.Sc. Computer Science"
    startDate: "2013-01"
    endDate: "2017-12"
skills:
  - "TypeScript"
  - "Node.js"
  - "PostgreSQL"
```

- [ ] **Step 4: Create `tests/fixtures/invalid-cv.yaml`**

```yaml
name: "Jane Doe"
title: "Backend Engineer"
contact:
  email: "not-an-email"
experience:
  - company: "Acme Corp"
    role: "Senior Backend Engineer"
    startDate: "2021-01"
    highlights: []
education: []
skills: []
```

- [ ] **Step 5: Write the failing test — `tests/data/loadCv.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCv, CvValidationError } from '../../src/data/loadCv.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

describe('loadCv', () => {
  it('loads and validates a well-formed cv.yaml', () => {
    const cv = loadCv(path.join(fixturesDir, 'valid-cv.yaml'));
    expect(cv.name).toBe('Jane Doe');
    expect(cv.experience).toHaveLength(1);
  });

  it('throws CvValidationError with field names for a malformed cv.yaml', () => {
    expect(() => loadCv(path.join(fixturesDir, 'invalid-cv.yaml'))).toThrowError(CvValidationError);
    try {
      loadCv(path.join(fixturesDir, 'invalid-cv.yaml'));
      throw new Error('expected loadCv to throw');
    } catch (error) {
      expect((error as Error).message).toContain('summary');
      expect((error as Error).message).toContain('contact.email');
    }
  });

  it('throws CvValidationError when the file does not exist', () => {
    expect(() => loadCv(path.join(fixturesDir, 'missing.yaml'))).toThrowError(CvValidationError);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/data/loadCv.test.ts`
Expected: FAIL — `Cannot find module '../../src/data/loadCv.js'`

- [ ] **Step 7: Write `src/data/loadCv.ts`**

```ts
import fs from 'node:fs';
import yaml from 'js-yaml';
import { cvSchema, type Cv } from './cvSchema.js';

export class CvValidationError extends Error {}

export function loadCv(filePath: string): Cv {
  if (!fs.existsSync(filePath)) {
    throw new CvValidationError(
      `CV data file not found at ${filePath}. Copy data/cv.example.yaml to data/cv.yaml and fill in your details.`
    );
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw);

  const result = cvSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new CvValidationError(`Invalid CV data in ${filePath}:\n${issues}`);
  }

  return result.data;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/data/loadCv.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Run full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass

- [ ] **Step 10: Commit**

```bash
git add data/cv.example.yaml src/data/cvSchema.ts src/data/loadCv.ts tests/fixtures/valid-cv.yaml tests/fixtures/invalid-cv.yaml tests/data/loadCv.test.ts
git commit -m "feat: add cv.yaml schema, validated loader, and example data"
git push
```

---

### Task 4: CLI skeleton (language prompt + data load)

**Files:**
- Modify: `src/cli.ts` (replaces Task 1's placeholder `console.log('cv-agent scaffolding OK')` entirely)

**Interfaces:**
- Consumes: `loadCv` from `src/data/loadCv.ts` (Task 3).
- Produces: a runnable entry point; `export type Language = 'pt-BR' | 'en'` (this local definition moves to `src/actions/createCv.ts` in Task 9 — cli.ts will import it from there instead).

- [ ] **Step 1: Replace `src/cli.ts` contents**

```ts
import 'dotenv/config';
import { select } from '@inquirer/prompts';
import { loadCv } from './data/loadCv.js';

export type Language = 'pt-BR' | 'en';

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

async function main() {
  const language = await promptLanguage();
  const cv = loadCv('data/cv.yaml');
  console.log(`Loaded CV for ${cv.name} (${cv.title}). Selected language: ${language}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Manual verification**

```bash
cp data/cv.example.yaml data/cv.yaml
npm start
```

Expected: prompts for language; after selecting one, prints
`Loaded CV for Your Name (Your Professional Title). Selected language: pt-BR.`
(or `en` if selected).

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add CLI skeleton with language prompt and cv.yaml loading"
git push
```

---

### Task 5: JD input handling (paste / file / URL)

**Files:**
- Create: `src/jd/getJobDescription.ts`
- Test: `tests/jd/getJobDescription.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone module).
- Produces: `export type JdSource = { mode: 'paste'; text: string } | { mode: 'file'; path: string } | { mode: 'url'; url: string }`, `export function stripHtml(html: string): string`, `export class JobDescriptionError extends Error`, `export async function resolveJobDescription(source: JdSource): Promise<string>` — all imported by `src/cli.ts` here and reused (via the same wizard step) by Tasks 10 and 11.

- [ ] **Step 1: Write the failing test — `tests/jd/getJobDescription.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveJobDescription, stripHtml, JobDescriptionError } from '../../src/jd/getJobDescription.js';

describe('stripHtml', () => {
  it('removes tags and scripts, collapses whitespace', () => {
    const html =
      '<html><head><style>.a{}</style></head><body><script>evil()</script><h1>Backend Engineer</h1><p>5+ years  experience</p></body></html>';
    expect(stripHtml(html)).toBe('Backend Engineer 5+ years experience');
  });
});

describe('resolveJobDescription', () => {
  it('trims and returns pasted text', async () => {
    const text = await resolveJobDescription({ mode: 'paste', text: '  Backend role  \n' });
    expect(text).toBe('Backend role');
  });

  it('throws JobDescriptionError for empty pasted text', async () => {
    await expect(resolveJobDescription({ mode: 'paste', text: '   ' })).rejects.toThrowError(
      JobDescriptionError
    );
  });

  it('reads and returns file contents', async () => {
    const tmpFile = path.join(os.tmpdir(), `jd-${Date.now()}.txt`);
    await fs.writeFile(tmpFile, 'Backend role from file', 'utf8');
    try {
      const text = await resolveJobDescription({ mode: 'file', path: tmpFile });
      expect(text).toBe('Backend role from file');
    } finally {
      await fs.rm(tmpFile);
    }
  });

  it('throws JobDescriptionError when the file does not exist', async () => {
    await expect(
      resolveJobDescription({ mode: 'file', path: '/nonexistent/path.txt' })
    ).rejects.toThrowError(JobDescriptionError);
  });

  it('fetches and strips HTML from a URL', async () => {
    const html = '<html><body><h1>Backend Engineer</h1><p>' + 'x'.repeat(60) + '</p></body></html>';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => html,
      })
    );
    const text = await resolveJobDescription({ mode: 'url', url: 'https://example.com/job' });
    expect(text).toContain('Backend Engineer');
    vi.unstubAllGlobals();
  });

  it('throws JobDescriptionError when the URL fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(
      resolveJobDescription({ mode: 'url', url: 'https://example.com/job' })
    ).rejects.toThrowError(JobDescriptionError);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/jd/getJobDescription.test.ts`
Expected: FAIL — `Cannot find module '../../src/jd/getJobDescription.js'`

- [ ] **Step 3: Write `src/jd/getJobDescription.ts`**

```ts
import fs from 'node:fs/promises';

export type JdSource =
  | { mode: 'paste'; text: string }
  | { mode: 'file'; path: string }
  | { mode: 'url'; url: string };

export class JobDescriptionError extends Error {}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function resolveJobDescription(source: JdSource): Promise<string> {
  if (source.mode === 'paste') {
    const text = source.text.trim();
    if (!text) {
      throw new JobDescriptionError('Pasted job description was empty.');
    }
    return text;
  }

  if (source.mode === 'file') {
    let raw: string;
    try {
      raw = await fs.readFile(source.path, 'utf8');
    } catch {
      throw new JobDescriptionError(`Could not read job description file at ${source.path}.`);
    }
    const text = raw.trim();
    if (!text) {
      throw new JobDescriptionError(`Job description file at ${source.path} was empty.`);
    }
    return text;
  }

  let response: Response;
  try {
    response = await fetch(source.url);
  } catch {
    throw new JobDescriptionError(
      `Could not fetch URL ${source.url}. Please paste the job description text instead.`
    );
  }
  if (!response.ok) {
    throw new JobDescriptionError(
      `Fetching ${source.url} returned HTTP ${response.status}. Please paste the job description text instead.`
    );
  }
  const html = await response.text();
  const text = stripHtml(html);
  if (text.length < 50) {
    throw new JobDescriptionError(
      `Could not extract meaningful text from ${source.url}. Please paste the job description text instead.`
    );
  }
  return text;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/jd/getJobDescription.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Modify `src/cli.ts` to add the JD prompt**

Replace the full file contents with:

```ts
import 'dotenv/config';
import { select, input } from '@inquirer/prompts';
import { loadCv } from './data/loadCv.js';
import { resolveJobDescription, type JdSource } from './jd/getJobDescription.js';

export type Language = 'pt-BR' | 'en';

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

async function main() {
  const language = await promptLanguage();
  const jobDescription = await promptJobDescription();
  const cv = loadCv('data/cv.yaml');
  console.log(`Loaded CV for ${cv.name} (${cv.title}). Selected language: ${language}.`);
  console.log(`Job description (${jobDescription.length} chars):\n${jobDescription.slice(0, 200)}...`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Run full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass

- [ ] **Step 7: Manual verification**

Run: `npm start`
Expected: after the language prompt, a second prompt asks how to provide the JD; test the "Paste text" path and confirm the console prints a truncated preview of what you typed.

- [ ] **Step 8: Commit**

```bash
git add src/jd/getJobDescription.ts tests/jd/getJobDescription.test.ts src/cli.ts
git commit -m "feat: add job description input handling (paste/file/URL) and wire into CLI"
git push
```

---

### Task 6: Gemini API client wrapper

> **Provider swap note:** this task was originally implemented and reviewed
> against `@anthropic-ai/sdk` (Claude), using `ANTHROPIC_API_KEY` and the
> model id `claude-sonnet-5`. Mid-implementation (after Task 9), the project
> switched to Google's Gemini API for its free tier. The section below
> reflects the corrected, final version built with `@google/genai`. The
> exported names (`generateText`, `MissingApiKeyError`) are unchanged, so no
> other task's files needed to change because of this swap.

**Files:**
- Create: `src/llm/client.ts`
- Test: `tests/llm/client.test.ts`

**Interfaces:**
- Consumes: `GEMINI_API_KEY` from `process.env` (loaded via `dotenv/config` in `cli.ts`).
- Produces: `export class MissingApiKeyError extends Error`, `export async function generateText(prompt: string): Promise<string>` — used by Tasks 9, 10, 11.

- [ ] **Step 1: Write the failing test — `tests/llm/client.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateText, MissingApiKeyError } from '../../src/llm/client.js';

describe('generateText', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it('throws MissingApiKeyError when GEMINI_API_KEY is not set', async () => {
    await expect(generateText('hello')).rejects.toThrowError(MissingApiKeyError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/llm/client.test.ts`
Expected: FAIL — `Cannot find module '../../src/llm/client.js'`

- [ ] **Step 3: Write `src/llm/client.ts`**

```ts
import { GoogleGenAI } from '@google/genai';

export class MissingApiKeyError extends Error {}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError(
      'GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

export async function generateText(prompt: string): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { maxOutputTokens: 4096 },
  });
  const text = response.text;
  if (!text) {
    throw new Error('Unexpected empty response from Gemini API.');
  }
  return text;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/llm/client.test.ts`
Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example src/llm/client.ts tests/llm/client.test.ts
git commit -m "feat: add Gemini API client wrapper with missing-key guard"
git push
```

---

### Task 7: HTML CV template + template filler

**Files:**
- Create: `templates/cv.html`
- Create: `src/render/fillTemplate.ts`
- Test: `tests/render/fillTemplate.test.ts`

**Interfaces:**
- Consumes: `Cv` type from `src/data/cvSchema.ts` (Task 3).
- Produces: `export function fillCvTemplate(cv: Cv): string` — used by Task 8's manual verification script and Tasks 9/10.

- [ ] **Step 1: Create `templates/cv.html`**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>{{name}} - CV</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 40px; }
  h1 { margin-bottom: 0; }
  h2 { border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 24px; }
  .title { color: #555; margin-top: 4px; }
  .contact { font-size: 0.9em; color: #555; margin-top: 8px; }
  .entry { margin-top: 12px; }
  .entry-header { font-weight: bold; }
  .entry-meta { font-style: italic; color: #666; font-size: 0.9em; }
  ul { margin-top: 4px; }
  .skills { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill { background: #eee; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; }
</style>
</head>
<body>
  <h1>{{name}}</h1>
  <div class="title">{{title}}</div>
  <div class="contact">
    {{contact.email}}{{#if contact.phone}} &middot; {{contact.phone}}{{/if}}{{#if contact.location}} &middot; {{contact.location}}{{/if}}
  </div>

  <h2>Summary</h2>
  <p>{{summary}}</p>

  <h2>Experience</h2>
  {{#each experience}}
  <div class="entry">
    <div class="entry-header">{{this.role}} &mdash; {{this.company}}</div>
    <div class="entry-meta">{{this.startDate}} - {{#if this.endDate}}{{this.endDate}}{{else}}Present{{/if}}{{#if this.location}} &middot; {{this.location}}{{/if}}</div>
    <ul>
      {{#each this.highlights}}
      <li>{{this}}</li>
      {{/each}}
    </ul>
  </div>
  {{/each}}

  {{#if education.length}}
  <h2>Education</h2>
  {{#each education}}
  <div class="entry">
    <div class="entry-header">{{this.degree}} &mdash; {{this.institution}}</div>
    <div class="entry-meta">{{this.startDate}} - {{#if this.endDate}}{{this.endDate}}{{else}}Present{{/if}}</div>
    {{#if this.details}}<p>{{this.details}}</p>{{/if}}
  </div>
  {{/each}}
  {{/if}}

  <h2>Skills</h2>
  <div class="skills">
    {{#each skills}}
    <span class="skill">{{this}}</span>
    {{/each}}
  </div>

  {{#if projects.length}}
  <h2>Projects</h2>
  {{#each projects}}
  <div class="entry">
    <div class="entry-header">{{this.name}}</div>
    <p>{{this.description}}</p>
    {{#if this.highlights.length}}
    <ul>
      {{#each this.highlights}}
      <li>{{this}}</li>
      {{/each}}
    </ul>
    {{/if}}
  </div>
  {{/each}}
  {{/if}}

  {{#if languages.length}}
  <h2>Languages</h2>
  <ul>
    {{#each languages}}
    <li>{{this.name}} &mdash; {{this.level}}</li>
    {{/each}}
  </ul>
  {{/if}}
</body>
</html>
```

- [ ] **Step 2: Write the failing test — `tests/render/fillTemplate.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { fillCvTemplate } from '../../src/render/fillTemplate.js';
import type { Cv } from '../../src/data/cvSchema.js';

const sampleCv: Cv = {
  name: 'Jane Doe',
  title: 'Backend Engineer',
  contact: { email: 'jane@example.com' },
  summary: 'Backend engineer with 6 years of experience.',
  experience: [
    {
      company: 'Acme Corp',
      role: 'Senior Backend Engineer',
      startDate: '2021-01',
      endDate: 'Present',
      highlights: ['Led migration to microservices.'],
    },
  ],
  education: [],
  skills: ['TypeScript', 'Node.js'],
};

describe('fillCvTemplate', () => {
  it('renders name, title, and experience highlights into the HTML', () => {
    const html = fillCvTemplate(sampleCv);
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Backend Engineer');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Led migration to microservices.');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/render/fillTemplate.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/fillTemplate.js'`

- [ ] **Step 4: Write `src/render/fillTemplate.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import type { Cv } from '../data/cvSchema.js';

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'cv.html');

export function fillCvTemplate(cv: Cv): string {
  const source = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const template = Handlebars.compile(source);
  return template(cv);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/render/fillTemplate.test.ts`
Expected: PASS

(Note: this test reads the real `templates/cv.html` file via `process.cwd()`, so it must be run from the repo root — same as `npm test` always runs.)

- [ ] **Step 6: Run full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add templates/cv.html src/render/fillTemplate.ts tests/render/fillTemplate.test.ts
git commit -m "feat: add CV HTML template and Handlebars template filler"
git push
```

---

### Task 8: PDF renderer

**Files:**
- Create: `src/render/renderPdf.ts`
- Create: `scripts/render-fixture.ts`

**Interfaces:**
- Consumes: `fillCvTemplate` from `src/render/fillTemplate.ts` (Task 7, used only by the manual verification script here), `loadCv` from `src/data/loadCv.ts` (Task 3).
- Produces: `export async function renderHtmlToPdf(html: string, outputPath: string): Promise<string>` (resolves to the actual file written — a `.pdf` on success, a `.html` fallback on failure) — used by Tasks 9, 10.

This task has no automated test: Puppeteer launches a real headless browser, which is slow and heavy for a unit test suite, and per the design spec, PDF rendering is verified manually rather than asserted programmatically.

- [ ] **Step 1: Write `src/render/renderPdf.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

export async function renderHtmlToPdf(html: string, outputPath: string): Promise<string> {
  try {
    const browser = await puppeteer.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
      return outputPath;
    } finally {
      await browser.close();
    }
  } catch (error) {
    const fallbackPath = outputPath.replace(/\.pdf$/, '.html');
    await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
    await fs.writeFile(fallbackPath, html, 'utf8');
    console.error(
      `PDF rendering failed (${(error as Error).message}). Saved HTML instead: ${fallbackPath}`
    );
    return fallbackPath;
  }
}
```

- [ ] **Step 2: Write `scripts/render-fixture.ts`** (manual verification aid)

```ts
import { loadCv } from '../src/data/loadCv.js';
import { fillCvTemplate } from '../src/render/fillTemplate.js';
import { renderHtmlToPdf } from '../src/render/renderPdf.js';

async function main() {
  const cv = loadCv('tests/fixtures/valid-cv.yaml');
  const html = fillCvTemplate(cv);
  const output = await renderHtmlToPdf(html, 'output/manual-render-test.pdf');
  console.log(`Wrote ${output}`);
}

main();
```

- [ ] **Step 3: Run full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass (no new automated tests added in this task)

- [ ] **Step 4: Manual verification**

Run: `npx tsx scripts/render-fixture.ts`
Expected: prints `Wrote output/manual-render-test.pdf`; open that file and confirm it's a one-page CV PDF for "Jane Doe" with a title, summary, experience, education, and skills sections rendered correctly.

- [ ] **Step 5: Commit**

```bash
git add src/render/renderPdf.ts scripts/render-fixture.ts
git commit -m "feat: add HTML-to-PDF renderer with HTML fallback, plus manual render script"
git push
```

---

### Task 9: Create CV action

**Files:**
- Create: `src/actions/createCv.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: `generateText` from `src/llm/client.ts` (Task 6), `fillCvTemplate` from `src/render/fillTemplate.ts` (Task 7), `renderHtmlToPdf` from `src/render/renderPdf.ts` (Task 8), `Cv` type from `src/data/cvSchema.ts` (Task 3).
- Produces: `export type Language = 'pt-BR' | 'en'` (canonical definition, moved here from `cli.ts`), `export async function createCv(cv: Cv, language: Language, slug: string): Promise<string>` — used by `cli.ts` here and by Tasks 10/11 for the shared `Language` type.

No automated test: this action's correctness (translation quality, real PDF output) is judged by manual end-to-end runs per the design spec, same rationale as Task 8.

- [ ] **Step 1: Write `src/actions/createCv.ts`**

```ts
import path from 'node:path';
import type { Cv } from '../data/cvSchema.js';
import { generateText } from '../llm/client.js';
import { fillCvTemplate } from '../render/fillTemplate.js';
import { renderHtmlToPdf } from '../render/renderPdf.js';

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

  const response = await generateText(prompt);
  return JSON.parse(response) as Cv;
}

export async function createCv(cv: Cv, language: Language, slug: string): Promise<string> {
  const translated = await translateCvIfNeeded(cv, language);
  const html = fillCvTemplate(translated);
  const date = new Date().toISOString().slice(0, 10);
  const outputPath = path.join(process.cwd(), 'output', `cv-${language}-${slug}-${date}.pdf`);
  return renderHtmlToPdf(html, outputPath);
}
```

- [ ] **Step 2: Modify `src/cli.ts`** — replace the full file contents with:

```ts
import 'dotenv/config';
import { select, input, checkbox } from '@inquirer/prompts';
import { loadCv } from './data/loadCv.js';
import { resolveJobDescription, type JdSource } from './jd/getJobDescription.js';
import { createCv, type Language } from './actions/createCv.js';

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

async function main() {
  const language = await promptLanguage();
  await promptJobDescription();
  const actions = await checkbox({
    message: 'What do you want to do?',
    choices: [{ name: 'Create CV', value: 'create' }],
  });

  const cv = loadCv('data/cv.yaml');
  const slug = await input({ message: 'Short slug for filenames (e.g. acme-backend):' });

  const outputs: string[] = [];
  if (actions.includes('create')) {
    outputs.push(await createCv(cv, language, slug));
  }

  console.log('\nDone! Generated files:');
  for (const file of outputs) {
    console.log(`  - ${file}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

(`await promptJobDescription();` here intentionally discards the return value — no action in this task's checkbox needs it yet. It's still prompted for, matching the spec's fixed wizard order [language → JD → action], and awaiting it without binding it to a name means `promptJobDescription`/`resolveJobDescription`/`JdSource` all stay genuinely used, so `no-unused-vars` doesn't fire. Task 10 changes this line to `const jobDescription = await promptJobDescription();` once the "optimize" action needs the value.)

- [ ] **Step 3: Run full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass

- [ ] **Step 4: Manual verification**

Ensure `.env` has a real `GEMINI_API_KEY` (copy from `.env.example`), then run:

```bash
npm start
```

Expected: select language `pt-BR`, provide any job description text when prompted (its content doesn't affect this task's output yet), check "Create CV", enter a slug; a real PDF appears at `output/cv-pt-BR-<slug>-<date>.pdf`. Repeat selecting `en` and confirm the output PDF content is translated to English while dates/company names are preserved.

- [ ] **Step 5: Commit**

```bash
git add src/actions/createCv.ts src/cli.ts
git commit -m "feat: add create-CV action and wire it into the CLI wizard"
git push
```

---

### Task 10: Optimize CV action

**Files:**
- Create: `src/actions/optimizeCv.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: `Language` type from `src/actions/createCv.ts` (Task 9), `generateText` from `src/llm/client.ts` (Task 6), `fillCvTemplate` from `src/render/fillTemplate.ts` (Task 7), `renderHtmlToPdf` from `src/render/renderPdf.ts` (Task 8), `Cv` type from `src/data/cvSchema.ts` (Task 3).
- Produces: `export async function optimizeCv(cv: Cv, jobDescription: string, language: Language, slug: string): Promise<string>` — used by `cli.ts` here.

No automated test, same rationale as Tasks 8 and 9 (LLM output + PDF rendering verified manually).

- [ ] **Step 1: Write `src/actions/optimizeCv.ts`**

```ts
import path from 'node:path';
import type { Cv } from '../data/cvSchema.js';
import type { Language } from './createCv.js';
import { generateText } from '../llm/client.js';
import { fillCvTemplate } from '../render/fillTemplate.js';
import { renderHtmlToPdf } from '../render/renderPdf.js';

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

  const response = await generateText(prompt);
  const tailored = JSON.parse(response) as Cv;
  const html = fillCvTemplate(tailored);
  const date = new Date().toISOString().slice(0, 10);
  const outputPath = path.join(process.cwd(), 'output', `cv-optimized-${language}-${slug}-${date}.pdf`);
  return renderHtmlToPdf(html, outputPath);
}
```

- [ ] **Step 2: Modify `src/cli.ts`**

Change the import line:

```ts
import { createCv, type Language } from './actions/createCv.js';
```

to:

```ts
import { createCv, type Language } from './actions/createCv.js';
import { optimizeCv } from './actions/optimizeCv.js';
```

Change the JD prompt line in `main()` from:

```ts
  await promptJobDescription();
```

to:

```ts
  const jobDescription = await promptJobDescription();
```

(now that "optimize" needs the value.)

Change the checkbox choices in `main()` from:

```ts
  const actions = await checkbox({
    message: 'What do you want to do?',
    choices: [{ name: 'Create CV', value: 'create' }],
  });
```

to:

```ts
  const actions = await checkbox({
    message: 'What do you want to do?',
    choices: [
      { name: 'Create CV', value: 'create' },
      { name: 'Optimize CV for this role', value: 'optimize' },
    ],
  });
```

Change the outputs block from:

```ts
  const outputs: string[] = [];
  if (actions.includes('create')) {
    outputs.push(await createCv(cv, language, slug));
  }
```

to:

```ts
  const outputs: string[] = [];
  if (actions.includes('create')) {
    outputs.push(await createCv(cv, language, slug));
  }
  if (actions.includes('optimize')) {
    outputs.push(await optimizeCv(cv, jobDescription, language, slug));
  }
```

- [ ] **Step 3: Run full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass

- [ ] **Step 4: Manual verification**

Run: `npm start`, check "Optimize CV for this role", paste a sample job description when prompted.
Expected: a PDF appears at `output/cv-optimized-<language>-<slug>-<date>.pdf`, visibly reordered/reworded to emphasize skills/experience matching the pasted JD, compared against the plain `create CV` output from Task 9. Confirm `data/cv.yaml` is unchanged (`git status` / diff against the copy made in Task 4 shows no modification, since it's gitignored and untracked — just visually confirm the file content is untouched).

- [ ] **Step 5: Commit**

```bash
git add src/actions/optimizeCv.ts src/cli.ts
git commit -m "feat: add optimize-CV action and wire it into the CLI wizard"
git push
```

---

### Task 11: Draft outreach email action

**Files:**
- Create: `templates/email.md`
- Create: `src/actions/draftEmail.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: `Language` type from `src/actions/createCv.ts` (Task 9), `generateText` from `src/llm/client.ts` (Task 6), `Cv` type from `src/data/cvSchema.ts` (Task 3).
- Produces: `export async function draftEmail(cv: Cv, jobDescription: string, language: Language, slug: string): Promise<string>` — used by `cli.ts` here. This is the final task in the plan.

No automated test, same rationale as Tasks 8–10 (LLM output verified manually).

- [ ] **Step 1: Write `templates/email.md`** (tone/structure scaffold fed into the prompt, not a fill-in-blanks template)

```markdown
# Outreach Email Tone Guide

- Professional but warm, not stiff or overly formal.
- Concise: aim for under 200 words.
- Open with a brief, specific reason for interest in the role/company
  (referencing the job description), not generic filler like "I am writing
  to express my interest...".
- Include 2-3 concrete points from the candidate's background that map
  directly to what the job description asks for.
- Close with a clear, low-pressure call to action (e.g. availability for a
  call).
```

- [ ] **Step 2: Write `src/actions/draftEmail.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Cv } from '../data/cvSchema.js';
import type { Language } from './createCv.js';
import { generateText } from '../llm/client.js';

const TONE_GUIDE_PATH = path.join(process.cwd(), 'templates', 'email.md');

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
  const date = new Date().toISOString().slice(0, 10);
  const outputPath = path.join(process.cwd(), 'output', `email-${language}-${slug}-${date}.md`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, body.trim() + '\n', 'utf8');
  return outputPath;
}
```

- [ ] **Step 3: Modify `src/cli.ts`**

Change the import line:

```ts
import { optimizeCv } from './actions/optimizeCv.js';
```

to:

```ts
import { optimizeCv } from './actions/optimizeCv.js';
import { draftEmail } from './actions/draftEmail.js';
```

Change the checkbox choices from:

```ts
  const actions = await checkbox({
    message: 'What do you want to do?',
    choices: [
      { name: 'Create CV', value: 'create' },
      { name: 'Optimize CV for this role', value: 'optimize' },
    ],
  });
```

to:

```ts
  const actions = await checkbox({
    message: 'What do you want to do?',
    choices: [
      { name: 'Create CV', value: 'create' },
      { name: 'Optimize CV for this role', value: 'optimize' },
      { name: 'Draft outreach email', value: 'email' },
    ],
  });
```

Change the outputs block from:

```ts
  const outputs: string[] = [];
  if (actions.includes('create')) {
    outputs.push(await createCv(cv, language, slug));
  }
  if (actions.includes('optimize')) {
    outputs.push(await optimizeCv(cv, jobDescription, language, slug));
  }
```

to:

```ts
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
```

- [ ] **Step 4: Run full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass

- [ ] **Step 5: Manual verification**

Run: `npm start`, check "Draft outreach email", paste a sample job description when prompted.
Expected: a file appears at `output/email-<language>-<slug>-<date>.md` containing a plausible, concise application email in the selected language that references specific details from `data/cv.yaml` and the pasted job description.

- [ ] **Step 6: Commit**

```bash
git add templates/email.md src/actions/draftEmail.ts src/cli.ts
git commit -m "feat: add draft-email action and wire it into the CLI wizard"
git push
```
