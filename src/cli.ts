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
