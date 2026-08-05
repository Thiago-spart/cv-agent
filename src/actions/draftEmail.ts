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
