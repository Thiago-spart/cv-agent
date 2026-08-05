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
