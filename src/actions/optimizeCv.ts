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
