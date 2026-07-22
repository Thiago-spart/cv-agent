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
