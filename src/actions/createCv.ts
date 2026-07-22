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
