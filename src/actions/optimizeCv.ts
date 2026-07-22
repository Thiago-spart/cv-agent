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
