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
