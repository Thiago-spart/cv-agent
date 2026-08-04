import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import type { Cv } from '../data/cvSchema.js';

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'cv.html');

type Language = 'pt-BR' | 'en';

const LABELS: Record<Language, Record<string, string>> = {
  'pt-BR': {
    summary: 'Resumo',
    experience: 'Experiência',
    projects: 'Projetos',
    skills: 'Habilidades',
    education: 'Formação',
    languages: 'Idiomas',
    linkedin: 'LinkedIn',
    website: 'Portfólio',
    present: 'Atual',
  },
  en: {
    summary: 'Summary',
    experience: 'Experience',
    projects: 'Projects',
    skills: 'Skills',
    education: 'Education',
    languages: 'Languages',
    linkedin: 'LinkedIn',
    website: 'Portfolio',
    present: 'Present',
  },
};

export function fillCvTemplate(cv: Cv, language: Language = 'pt-BR'): string {
  const source = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const template = Handlebars.compile(source);
  return template({ ...cv, labels: LABELS[language] });
}
